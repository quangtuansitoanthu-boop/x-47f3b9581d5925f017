import fs from 'node:fs';
import path from 'node:path';
import { patchIosGoogleSdk } from './lib/ios-google-sdk-patch.mjs';
import { patchIosLocalNotifications } from './lib/ios-local-notifications-patch.mjs';

patchIosGoogleSdk();
patchIosLocalNotifications();

const targetFile = path.resolve('node_modules/@codetrix-studio/capacitor-google-auth/android/src/main/java/com/codetrixstudio/capacitor/GoogleAuth/GoogleAuth.java');

if (!fs.existsSync(targetFile)) {
  console.log('[patch-google-auth] Target file does not exist, skipping.');
  process.exit(0);
}

const patchedContent = `package com.codetrixstudio.capacitor.GoogleAuth;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerFuture;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.codetrixstudio.capacitor.GoogleAuth.capacitorgoogleauth.R;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.android.gms.tasks.OnFailureListener;

@CapacitorPlugin()
public class GoogleAuth extends Plugin {
  private final static String VERIFY_TOKEN_URL = "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=";
  private final static String FIELD_TOKEN_EXPIRES_IN = "expires_in";
  private final static String FIELD_ACCESS_TOKEN = "accessToken";
  private final static String FIELD_TOKEN_EXPIRES = "expires";

  private final static int SIGN_IN_CANCELLED = 12501;
  public static final int KAssumeStaleTokenSec = 60;

  private GoogleSignInClient googleSignInClient;

  public void loadSignInClient(String clientId, boolean forceCodeForRefreshToken, String[] scopeArray) {
    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
      .requestIdToken(clientId)
      .requestEmail();

    if (forceCodeForRefreshToken) {
      googleSignInBuilder.requestServerAuthCode(clientId, true);
    }

    if (scopeArray != null && scopeArray.length > 0) {
      List<Scope> extraScopes = new ArrayList<>();
      for (String s : scopeArray) {
        String trimmed = s.trim();
        if (!trimmed.isEmpty() && !trimmed.equalsIgnoreCase("profile") && !trimmed.equalsIgnoreCase("email")) {
          extraScopes.add(new Scope(trimmed));
        }
      }
      if (!extraScopes.isEmpty()) {
        Scope firstScope = extraScopes.remove(0);
        googleSignInBuilder.requestScopes(firstScope, extraScopes.toArray(new Scope[0]));
      }
    }

    GoogleSignInOptions googleSignInOptions = googleSignInBuilder.build();
    googleSignInClient = GoogleSignIn.getClient(this.getContext(), googleSignInOptions);
  }

  @Override
  public void load() {}

  @PluginMethod()
  public void signIn(PluginCall call) {
    if (googleSignInClient == null) {
      String configClientId = getConfig().getString("serverClientId",
        getConfig().getString("clientId",
          this.getContext().getString(R.string.server_client_id)));
      loadSignInClient(configClientId, false, new String[]{"profile", "email"});
    }
    Intent signInIntent = googleSignInClient.getSignInIntent();
    startActivityForResult(call, signInIntent, "signInResult");
  }

  @ActivityCallback
  protected void signInResult(PluginCall call, ActivityResult result) {
    if (call == null) return;

    Task<GoogleSignInAccount> completedTask = GoogleSignIn.getSignedInAccountFromIntent(result.getData());

    try {
      GoogleSignInAccount account = completedTask.getResult(ApiException.class);

      JSObject authentication = new JSObject();
      authentication.put("idToken", account.getIdToken());

      JSObject user = new JSObject();
      user.put("serverAuthCode", account.getServerAuthCode());
      user.put("idToken", account.getIdToken());
      user.put("name", account.getDisplayName());
      user.put("displayName", account.getDisplayName());
      user.put("email", account.getEmail());
      user.put("familyName", account.getFamilyName());
      user.put("givenName", account.getGivenName());
      user.put("id", account.getId());
      user.put("imageUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);

      ExecutorService executor = Executors.newSingleThreadExecutor();
      try {
        executor.execute(() -> {
        try {
          JSONObject accessTokenObject = getAuthToken(account.getAccount(), true);
          if (accessTokenObject != null) {
            authentication.put(FIELD_ACCESS_TOKEN, accessTokenObject.opt(FIELD_ACCESS_TOKEN));
            authentication.put(FIELD_TOKEN_EXPIRES, accessTokenObject.opt(FIELD_TOKEN_EXPIRES));
            authentication.put(FIELD_TOKEN_EXPIRES_IN, accessTokenObject.opt(FIELD_TOKEN_EXPIRES_IN));
          }
        } catch (Exception e) {
          Log.w("GoogleAuth", "Could not fetch optional access token, proceeding with idToken: " + e.getMessage());
        }
        user.put("authentication", authentication);
        call.resolve(user);
        });
      } finally {
        // shutdown vẫn cho tác vụ đã xếp hàng hoàn tất, rồi giải phóng worker.
        executor.shutdown();
      }
    } catch (ApiException e) {
      if (SIGN_IN_CANCELLED == e.getStatusCode()) {
        call.reject("The user canceled the sign-in flow.", "" + e.getStatusCode());
      } else {
        call.reject("Google Sign-In failed (" + e.getStatusCode() + ")", "" + e.getStatusCode());
      }
    }
  }

  @PluginMethod()
  public void refresh(final PluginCall call) {
    GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(getContext());
    if (account == null) {
      call.reject("User not logged in.");
    } else {
      JSObject authentication = new JSObject();
      authentication.put("idToken", account.getIdToken());
      authentication.put("refreshToken", "");
      try {
        JSONObject accessTokenObject = getAuthToken(account.getAccount(), true);
        if (accessTokenObject != null) {
          authentication.put(FIELD_ACCESS_TOKEN, accessTokenObject.opt(FIELD_ACCESS_TOKEN));
        }
      } catch (Exception e) {
        Log.w("GoogleAuth", "Could not refresh optional access token: " + e.getMessage());
      }
      call.resolve(authentication);
    }
  }

  @PluginMethod()
  public void signOut(final PluginCall call) {
    if (googleSignInClient == null) {
      call.resolve();
      return;
    }
    try {
      googleSignInClient.signOut()
        .addOnSuccessListener(new OnSuccessListener<Void>() {
          @Override
          public void onSuccess(Void aVoid) {
            call.resolve();
          }
        })
        .addOnFailureListener(new OnFailureListener() {
          @Override
          public void onFailure(Exception e) {
            call.resolve();
          }
        });
    } catch (Exception e) {
      call.resolve();
    }
  }

  @PluginMethod()
  public void initialize(final PluginCall call) {
    String configClientId = getConfig().getString("serverClientId",
      getConfig().getString("androidClientId",
        getConfig().getString("clientId",
          this.getContext().getString(R.string.server_client_id))));
    if (configClientId == null || configClientId.trim().isEmpty()) {
      configClientId = this.getContext().getString(R.string.server_client_id);
    }
    boolean configForceCodeForRefreshToken = getConfig().getBoolean("forceCodeForRefreshToken", false);
    String configScopeArray = getConfig().getString("scopes", "");

    String clientId = call.getData().getString("clientId", configClientId);
    if (clientId == null || clientId.trim().isEmpty()) {
      clientId = configClientId;
    }
    boolean forceCodeForRefreshToken = call.getData().getBoolean("grantOfflineAccess", configForceCodeForRefreshToken);
    String scopesStr = call.getData().getString("scopes", configScopeArray);
    String replacedScopesStr = scopesStr == null ? "" : scopesStr
      .replace("[", "")
      .replace("]", "")
      .replace(String.valueOf((char) 34), "")
      .replace(" ", "")
      .replace(String.valueOf((char) 92), "");

    String[] scopeArray = replacedScopesStr.isEmpty() ? new String[]{"profile", "email"} : replacedScopesStr.split(",");

    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);
    call.resolve();
  }

  private JSONObject getAuthToken(Account account, boolean retry) throws Exception {
    AccountManager manager = AccountManager.get(getContext());
    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, "oauth2:profile email", null, false, null, null);
    Bundle bundle = future.getResult();
    String authToken = bundle.getString(AccountManager.KEY_AUTHTOKEN);
    try {
      return verifyToken(authToken);
    } catch (IOException e) {
      if (retry) {
        manager.invalidateAuthToken("com.google", authToken);
        return getAuthToken(account, false);
      } else {
        throw e;
      }
    }
  }

  private JSONObject verifyToken(String authToken) throws IOException, JSONException {
    URL url = new URL(VERIFY_TOKEN_URL + authToken);
    HttpURLConnection urlConnection = (HttpURLConnection) url.openConnection();
    urlConnection.setInstanceFollowRedirects(true);
    String stringResponse = fromStream(new BufferedInputStream(urlConnection.getInputStream()));

    JSONObject jsonResponse = new JSONObject(stringResponse);
    int expires_in = jsonResponse.getInt(FIELD_TOKEN_EXPIRES_IN);
    if (expires_in < KAssumeStaleTokenSec) {
      throw new IOException("Auth token soon expiring.");
    }
    jsonResponse.put(FIELD_ACCESS_TOKEN, authToken);
    jsonResponse.put(FIELD_TOKEN_EXPIRES, expires_in + (System.currentTimeMillis() / 1000));
    return jsonResponse;
  }

  private static String fromStream(InputStream is) throws IOException {
    BufferedReader reader = new BufferedReader(new InputStreamReader(is));
    StringBuilder sb = new StringBuilder();
    String line;
    while ((line = reader.readLine()) != null) {
      sb.append(line).append("\\n");
    }
    reader.close();
    return sb.toString();
  }
}
`;

fs.writeFileSync(targetFile, patchedContent, 'utf8');
console.log('✓ Successfully patched @codetrix-studio/capacitor-google-auth for robust native Google Sign-In.');
