package vn.quangtu.tutam;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

/** Exports newly generated PNG cards without broad storage permissions or server calls. */
@CapacitorPlugin(name = "ImageExport")
public class ImageExportPlugin extends Plugin {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final byte[] PNG = {(byte)137, 80, 78, 71, 13, 10, 26, 10};

    @PluginMethod
    public void saveImage(PluginCall call) {
        String name = call.getString("fileName", "tu-tap.png");
        if (!name.matches("[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\\.png")) {
            call.reject("Invalid PNG file name", "INVALID_IMAGE"); return;
        }
        final byte[] bytes;
        try { bytes = imageBytes(call); } catch (Exception error) { call.reject("Invalid PNG image", "INVALID_IMAGE"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getBridge().execute(() -> saveToPictures(call, name, bytes));
        } else {
            // Capacitor persists pending activity-call options in an Android
            // Bundle. Keep a small cache-file name there, never megabytes of PNG.
            getBridge().execute(() -> {
                File pending = null;
                try {
                    pending = File.createTempFile("tu-tap-export-", ".png", getContext().getCacheDir());
                    try (FileOutputStream stream = new FileOutputStream(pending)) { stream.write(bytes); }
                    call.getData().put("pendingImage", pending.getName());
                    call.getData().remove("base64");
                    final File staged = pending;
                    getActivity().runOnUiThread(() -> {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("image/png").putExtra(Intent.EXTRA_TITLE, name);
                        try { startActivityForResult(call, intent, "documentCreated"); }
                        catch (Exception error) { staged.delete(); call.reject("Cannot open image destination", "SAVE_FAILED"); }
                    });
                } catch (Exception error) {
                    if (pending != null) pending.delete();
                    call.reject("Cannot prepare PNG image", "SAVE_FAILED");
                }
            });
        }
    }

    private byte[] imageBytes(PluginCall call) {
        String encoded = call.getString("base64", "");
        if (encoded.length() > ((MAX_BYTES + 2) / 3) * 4) throw new IllegalArgumentException();
        byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
        if (bytes.length < PNG.length || bytes.length > MAX_BYTES) throw new IllegalArgumentException();
        for (int i = 0; i < PNG.length; i++) if (bytes[i] != PNG[i]) throw new IllegalArgumentException();
        return bytes;
    }

    @android.annotation.TargetApi(29)
    private void saveToPictures(PluginCall call, String name, byte[] bytes) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri created = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/TuTap");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            created = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (created == null) throw new IllegalStateException();
            write(resolver, created, bytes);
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Images.Media.IS_PENDING, 0);
            if (resolver.update(created, ready, null, null) != 1) throw new IllegalStateException();
            resolveSaved(call, true);
        } catch (Exception error) {
            // Only remove this attempt's newly inserted, incomplete image.
            if (created != null) try { resolver.delete(created, null, null); } catch (Exception ignored) {}
            call.reject("Cannot save PNG image", "SAVE_FAILED");
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String pendingName = call.getString("pendingImage", "");
        if (!pendingName.matches("tu-tap-export-[A-Za-z0-9_-]+\\.png")) { call.reject("Image export expired", "SAVE_FAILED"); return; }
        File pending = new File(getContext().getCacheDir(), pendingName);
        if (result.getResultCode() != Activity.RESULT_OK) { pending.delete(); resolveSaved(call, false); return; }
        Intent data = result.getData();
        Uri destination = data == null ? null : data.getData();
        if (destination == null || !"content".equals(destination.getScheme())) { pending.delete(); call.reject("No image destination", "SAVE_FAILED"); return; }
        getBridge().execute(() -> {
            try (FileInputStream input = new FileInputStream(pending);
                 OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
                if (output == null || pending.length() < PNG.length || pending.length() > MAX_BYTES) throw new IllegalStateException();
                byte[] buffer = new byte[8192]; int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                output.flush();
            }
            catch (Exception error) { call.reject("Cannot save PNG image", "SAVE_FAILED"); return; }
            finally { pending.delete(); }
            resolveSaved(call, true);
        });
    }

    private void write(ContentResolver resolver, Uri destination, byte[] bytes) throws Exception {
        try (OutputStream stream = resolver.openOutputStream(destination, "w")) {
            if (stream == null) throw new IllegalStateException();
            stream.write(bytes);
            stream.flush();
        }
    }
    private void resolveSaved(PluginCall call, boolean saved) {
        JSObject response = new JSObject(); response.put("saved", saved); call.resolve(response);
    }
}
