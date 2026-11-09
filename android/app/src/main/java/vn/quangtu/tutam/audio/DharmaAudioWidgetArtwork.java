package vn.quangtu.tutam.audio;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import androidx.media3.common.util.BitmapLoader;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Bìa hiện tại dùng chung giữa các cỡ; renderer chỉ đọc local, không tự gọi mạng. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class DharmaAudioWidgetArtwork {
    interface Guard { boolean current(); }
    private static final int MAX_BYTES = 512 * 1024, DIMENSION = 256, HEADER = 65;
    private static final String FILE = "dharma-audio-widget-cover-v1.bin";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static long generation;
    private static String owner = "", cachedScope = "", cachedKey = "", pendingKey = "";
    private static Bitmap cached;
    private static ListenableFuture<Bitmap> pending;

    private static AtomicFile file(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(), FILE)); }
    private static String scope(Context context) { return context.getNoBackupFilesDir().getAbsolutePath(); }

    static String safeUri(Context context, String raw) {
        if (raw == null || raw.length() > 2048) return "";
        String value = raw.trim();
        for (int i = 0; i < value.length(); i++) if (Character.isISOControl(value.charAt(i))) return "";
        int fragment = value.indexOf('#');
        if (fragment >= 0) value = value.substring(0, fragment);
        if (value.startsWith("/covers/") || value.startsWith("covers/")) value = "asset:///public/" + value.replaceFirst("^/", "");
        try {
            Uri uri = Uri.parse(value);
            if ("https".equals(uri.getScheme()) && "i0.wp.com".equals(uri.getHost()) && uri.getEncodedQuery() != null) {
                for (String name : uri.getQueryParameterNames()) {
                    if (!"resize".equals(name) && !"ssl".equals(name)) return "";
                    for (String parameter : uri.getQueryParameters(name)) {
                        if ("resize".equals(name) ? !parameter.matches("[0-9]{1,5},[0-9]{1,5}") : !"1".equals(parameter)) return "";
                    }
                }
                uri = uri.buildUpon().clearQuery().build();
            }
            if (uri.getEncodedQuery() != null || uri.getEncodedUserInfo() != null) return "";
            String path = uri.getPath();
            if (path == null || path.isEmpty()) return "";
            for (String part : path.split("/")) if ("..".equals(part) || ".".equals(part)) return "";
            String lower = path.toLowerCase(java.util.Locale.ROOT);
            if (lower.contains("/assets/branding/") || lower.endsWith("/tu-tap-logo.png") || lower.endsWith("/dharma_audio_lotus.png")) return "";
            if (("https".equals(uri.getScheme()) || "capacitor".equals(uri.getScheme())) && "localhost".equals(uri.getHost()) && path.startsWith("/covers/")) return "asset:///public" + path;
            if ("asset".equals(uri.getScheme())) return path.startsWith("/public/covers/") && (uri.getAuthority() == null || uri.getAuthority().isEmpty()) ? uri.toString() : "";
            if ("https".equals(uri.getScheme())) return uri.getHost() != null && !uri.getHost().isEmpty() && (uri.getPort() == -1 || uri.getPort() == 443) ? uri.toString() : "";
            if ("file".equals(uri.getScheme()) && (uri.getAuthority() == null || uri.getAuthority().isEmpty())) {
                String canonical = new File(path).getCanonicalPath();
                String root = new File(context.getApplicationInfo().dataDir).getCanonicalPath() + File.separator;
                return canonical.startsWith(root) ? Uri.fromFile(new File(canonical)).toString() : "";
            }
        } catch (Exception ignored) { }
        return "";
    }

    static String original(Context context, String value) {
        String safe = safeUri(context, value);
        return safe.startsWith("asset:///public/covers/") ? safe.substring("asset:///public".length()) : safe;
    }

    static String key(Context context, String album, String artwork, String original) {
        String first = safeUri(context, artwork), second = safeUri(context, original);
        if ((first.isEmpty() && second.isEmpty()) || album == null || album.length() > 256) return "";
        return DharmaAudioRecoveryPolicy.fingerprint(album + "\n" + first + "\n" + second);
    }

    private static Bitmap bounded(Bitmap image) {
        if (image == null || image.getWidth() < 1 || image.getHeight() < 1) return null;
        int longest = Math.max(image.getWidth(), image.getHeight());
        if (longest <= DIMENSION) return image;
        return Bitmap.createScaledBitmap(image, Math.max(1, image.getWidth() * DIMENSION / longest), Math.max(1, image.getHeight() * DIMENSION / longest), true);
    }

    private static String assetPath(String uri) {
        Uri parsed = Uri.parse(uri);
        if ("asset".equals(parsed.getScheme())) return parsed.getPath().replaceFirst("^/", "");
        String path = parsed.getPath();
        return path != null && path.contains("/covers/") ? "public/covers/" + parsed.getLastPathSegment() : "";
    }

    private static InputStream localStream(Context context, String uri) throws Exception {
        if ("file".equals(Uri.parse(uri).getScheme())) return new java.io.FileInputStream(new File(Uri.parse(uri).getPath()));
        String asset = assetPath(uri);
        return asset.isEmpty() ? null : context.getAssets().open(asset);
    }

    private static Bitmap local(Context context, String artwork, String original) {
        for (String source : new String[]{safeUri(context, artwork), safeUri(context, original)}) {
            if (source.isEmpty()) continue;
            try {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                try (InputStream input = localStream(context, source)) { if (input == null) continue; BitmapFactory.decodeStream(input, null, options); }
                if (options.outWidth < 1 || options.outHeight < 1 || options.outWidth > 32768 || options.outHeight > 32768) continue;
                options.inJustDecodeBounds = false; options.inSampleSize = 1;
                while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > DIMENSION * 2) options.inSampleSize *= 2;
                try (InputStream input = localStream(context, source)) { Bitmap image = bounded(BitmapFactory.decodeStream(input, null, options)); if (image != null) return image; }
            } catch (Exception | OutOfMemoryError ignored) { }
        }
        return null;
    }

    private static Bitmap persisted(Context context, String key) {
        try {
            File base = file(context).getBaseFile();
            if (base.length() > MAX_BYTES || new File(base + ".bak").length() > MAX_BYTES) return null;
            byte[] bytes = file(context).readFully();
            if (bytes.length <= HEADER || bytes.length > MAX_BYTES || bytes[64] != '\n'
                || !key.equals(new String(bytes, 0, 64, StandardCharsets.US_ASCII))) return null;
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, HEADER, bytes.length - HEADER, options);
            if (options.outWidth < 1 || options.outHeight < 1 || options.outWidth > DIMENSION || options.outHeight > DIMENSION) return null;
            return BitmapFactory.decodeByteArray(bytes, HEADER, bytes.length - HEADER);
        } catch (Exception | OutOfMemoryError ignored) { return null; }
    }

    static synchronized Bitmap bitmap(Context context, JSONObject state) {
        if (state == null || !state.optBoolean("ready")) return null;
        String key = key(context, state.optString("albumId"), state.optString("artwork"), state.optString("originalArtwork"));
        if (key.isEmpty() || (state.has("artworkKey") && !key.equals(state.optString("artworkKey")))) return null;
        String scope = scope(context);
        if (scope.equals(cachedScope) && key.equals(cachedKey)) return cached;
        Bitmap image = persisted(context, key);
        if (image == null) image = local(context, state.optString("artwork"), state.optString("originalArtwork"));
        cachedScope = scope; cachedKey = key; cached = image;
        return image;
    }

    private static synchronized boolean current(long ticket, String expected) { return generation == ticket && owner.equals(expected); }

    static void request(Context context, String queue, String album, String artwork, String original, BitmapLoader loader, Guard alive, Runnable changed) {
        String key = key(context, album, artwork, original);
        String expected = scope(context) + "\n" + queue + "\n" + key;
        final long ticket;
        synchronized (DharmaAudioWidgetArtwork.class) {
            if (owner.equals(expected)) return;
            owner = expected; ticket = ++generation;
        }
        if (key.isEmpty()) return;
        IO.execute(() -> {
            if (!current(ticket, expected)) return;
            Bitmap local = persisted(context, key);
            if (local != null) { MAIN.post(() -> { if (current(ticket, expected) && alive.current()) changed.run(); }); return; }
            local = local(context, artwork, original);
            if (local != null) { finish(context, key, local, ticket, expected, alive, changed); return; }
            String first = safeUri(context, artwork), second = safeUri(context, original);
            String remote = first.startsWith("https://") ? first : second.startsWith("https://") ? second : "";
            if (remote.isEmpty() || loader == null) return;
            MAIN.post(() -> {
                if (!current(ticket, expected) || !alive.current()) return;
                final ListenableFuture<Bitmap> work;
                try {
                    synchronized (DharmaAudioWidgetArtwork.class) {
                        if (!current(ticket, expected)) return;
                        if (pending == null || !pendingKey.equals(key)) { pending = loader.loadBitmap(Uri.parse(remote)); pendingKey = key; }
                        work = pending;
                    }
                    work.addListener(() -> {
                        if (!current(ticket, expected)) return;
                        try { finish(context, key, work.get(), ticket, expected, alive, changed); }
                        catch (Exception | OutOfMemoryError ignored) { }
                    }, IO);
                } catch (Exception ignored) { }
            });
        });
    }

    private static void finish(Context context, String key, Bitmap source, long ticket, String expected, Guard alive, Runnable changed) {
        if (!current(ticket, expected)) return;
        final Bitmap image;
        final byte[] data;
        try {
            image = bounded(source); if (image == null) return;
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!image.compress(Bitmap.CompressFormat.PNG, 100, output)) return;
            data = output.toByteArray(); if (data.length + HEADER > MAX_BYTES) return;
        } catch (Exception | OutOfMemoryError ignored) { return; }
        MAIN.post(() -> {
            if (!current(ticket, expected) || !alive.current()) return;
            IO.execute(() -> {
                synchronized (DharmaAudioWidgetArtwork.class) {
                    if (!current(ticket, expected)) return;
                    AtomicFile target = file(context); FileOutputStream stream = null;
                    try {
                        stream = target.startWrite(); stream.write(key.getBytes(StandardCharsets.US_ASCII)); stream.write('\n'); stream.write(data); target.finishWrite(stream);
                        cachedScope = scope(context); cachedKey = key; cached = image;
                    } catch (Exception ignored) { if (stream != null) target.failWrite(stream); return; }
                }
                MAIN.post(() -> { if (current(ticket, expected) && alive.current()) changed.run(); });
            });
        });
    }

    static synchronized void invalidate() { generation++; owner = ""; pending = null; pendingKey = ""; }
    static synchronized void clear(Context context) {
        invalidate(); file(context).delete(); cached = null; cachedKey = ""; cachedScope = "";
    }
}
