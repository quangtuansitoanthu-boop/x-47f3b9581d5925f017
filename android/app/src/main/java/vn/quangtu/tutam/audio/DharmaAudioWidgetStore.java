package vn.quangtu.tutam.audio;

import android.content.Context;
import android.net.Uri;
import android.util.AtomicFile;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** Snapshot private không backup; không lưu URL chứa query/token hoặc credential. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class DharmaAudioWidgetStore {
    private static JSONArray savedTracks;
    private static String savedFingerprint = "";
    private static boolean queueDirty;
    private static AtomicFile file(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(), "dharma-audio-widget-v1.json")); }
    private static AtomicFile queueFile(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(), "dharma-audio-widget-queue-v1.json")); }
    private static JSONArray tracks(Context context) {
        if (savedTracks == null) {
            try {
                JSONObject saved = new JSONObject(new String(queueFile(context).readFully(), StandardCharsets.UTF_8));
                String payload = saved.getString("payload");
                String fingerprint = saved.getString("fingerprint");
                if (!DharmaAudioRecoveryPolicy.fingerprint(payload).equals(fingerprint)) throw new IllegalArgumentException("Mismatched queue fingerprint");
                savedTracks = new JSONArray(payload); savedFingerprint = fingerprint;
            } catch (Exception ignored) { savedTracks = new JSONArray(); savedFingerprint = ""; }
        }
        return savedTracks;
    }
    static void invalidateQueue() { queueDirty = true; }
    static JSONObject read(Context context) {
        try { return new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8)); }
        catch (Exception ignored) { return new JSONObject(); }
    }
    static JSONObject display(Context context) {
        JSONObject checkpoint = read(context);
        JSONObject data = checkpoint.optJSONObject("display");
        if (data == null) return new JSONObject();
        try {
            data.put("playing", false);
            JSONArray rows = tracks(context);
            if (!DharmaAudioRecoveryPolicy.canRecover(checkpoint.optString("queueFingerprint"), savedFingerprint,
                    data.optString("albumId"), data.optString("queueId"))) return new JSONObject();
            data.put("ready", rows != null && rows.length() > 0);
        } catch (Exception ignored) { }
        return data;
    }
    static void clear(Context context) { DharmaAudioWidgetArtwork.clear(context); file(context).delete(); queueFile(context).delete(); savedTracks = new JSONArray(); savedFingerprint = ""; queueDirty = true; }
    static void save(Context context, Player player, JSONObject display) {
        MediaItem selected = player.getCurrentMediaItem();
        if (practice(selected)) { clear(context); return; }
        FileOutputStream output = null;
        try {
            JSONObject data = new JSONObject(); data.put("display", display);
            JSONArray tracks = tracks(context);
            if (queueDirty) {
            tracks = new JSONArray();
            for (int i = 0; i < player.getMediaItemCount(); i++) {
                MediaItem item = player.getMediaItemAt(i);
                if (practice(item)) { clear(context); return; }
                Uri uri = Uri.parse(item.mediaId);
                String scheme = uri.getScheme();
                if (uri.getEncodedQuery() != null || uri.getEncodedUserInfo() != null || uri.getFragment() != null
                    || !("https".equals(scheme) || "asset".equals(scheme) || "file".equals(scheme))) {
                    tracks = new JSONArray(); break;
                }
                if ("file".equals(scheme) && !new File(uri.getPath()).getCanonicalPath().startsWith(context.getApplicationInfo().dataDir + File.separator)) { tracks = new JSONArray(); break; }
                JSONObject row = new JSONObject(); row.put("uri", item.mediaId); row.put("title", String.valueOf(item.mediaMetadata.title));
                row.put("album", String.valueOf(item.mediaMetadata.albumTitle)); row.put("artist", String.valueOf(item.mediaMetadata.artist));
                String artwork = DharmaAudioWidgetArtwork.safeUri(context, item.mediaMetadata.artworkUri == null ? "" : item.mediaMetadata.artworkUri.toString());
                if (!artwork.isEmpty()) row.put("artwork", artwork);
                if (item.mediaMetadata.extras != null) {
                    row.put("queueId", item.mediaMetadata.extras.getString("queueId", ""));
                    row.put("albumId", item.mediaMetadata.extras.getString("albumId", ""));
                    String original = DharmaAudioWidgetArtwork.original(context, item.mediaMetadata.extras.getString("originalArtwork", ""));
                    if (!original.isEmpty()) row.put("originalArtwork", original);
                }
                tracks.put(row);
            }
            FileOutputStream queueOutput = null;
            String payload = tracks.toString();
            String fingerprint = DharmaAudioRecoveryPolicy.fingerprint(payload);
            JSONObject envelope = new JSONObject(); envelope.put("fingerprint", fingerprint); envelope.put("payload", payload);
            try {
                queueOutput = queueFile(context).startWrite(); queueOutput.write(envelope.toString().getBytes(StandardCharsets.UTF_8)); queueFile(context).finishWrite(queueOutput);
            } catch (Exception error) { if (queueOutput != null) queueFile(context).failWrite(queueOutput); throw error; }
            savedTracks = tracks; savedFingerprint = fingerprint; queueDirty = false;
            }
            data.put("queueFingerprint", savedFingerprint);
            data.put("index", player.getCurrentMediaItemIndex()); data.put("position", Math.max(0, player.getCurrentPosition()));
            data.put("repeat", player.getRepeatMode()); data.put("speed", player.getPlaybackParameters().speed); data.put("volume", player.getVolume());
            output = file(context).startWrite(); output.write(data.toString().getBytes(StandardCharsets.UTF_8)); file(context).finishWrite(output);
        } catch (Exception ignored) { if (output != null) file(context).failWrite(output); }
    }
    static void restore(Context context, Player player) {
        try {
            JSONObject data = read(context); JSONArray rows = tracks(context);
            if (rows == null || rows.length() == 0 || rows.length() > 5000) return;
            if (!DharmaAudioRecoveryPolicy.canRecover(data.optString("queueFingerprint"), savedFingerprint, "", "")) return;
            java.util.ArrayList<MediaItem> tracks = new java.util.ArrayList<>();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i); String source = row.getString("uri");
                if (DharmaAudioRecoveryPolicy.isPractice(row.optString("albumId"), row.optString("queueId"))) { clear(context); return; }
                android.os.Bundle extras = new android.os.Bundle(); extras.putString("queueId", row.optString("queueId")); extras.putString("albumId", row.optString("albumId"));
                extras.putString("originalArtwork", DharmaAudioWidgetArtwork.original(context, row.optString("originalArtwork")));
                MediaMetadata.Builder metadata = new MediaMetadata.Builder().setTitle(row.optString("title")).setAlbumTitle(row.optString("album")).setArtist(row.optString("artist")).setExtras(extras);
                String artwork = DharmaAudioWidgetArtwork.safeUri(context, row.optString("artwork"));
                if (!artwork.isEmpty()) metadata.setArtworkUri(Uri.parse(artwork));
                tracks.add(new MediaItem.Builder().setMediaId(source).setUri(DharmaAudioPlugin.resolveCached(context, Uri.parse(source)))
                    .setMediaMetadata(metadata.build()).build());
            }
            int index = data.optInt("index"); if (index < 0 || index >= tracks.size()) return;
            // Giữ vị trí để tua ±15s vẫn đúng; chỉ thao tác Play mới phát lại bài đã kết thúc.
            player.setMediaItems(tracks, index, DharmaAudioRecoveryPolicy.recoveryPosition(data.optLong("position"), false));
            player.setRepeatMode(Math.max(0, Math.min(2, data.optInt("repeat"))));
            player.setPlaybackSpeed((float) Math.max(.25, Math.min(3, data.optDouble("speed", 1))));
            player.setVolume((float) Math.max(0, Math.min(1, data.optDouble("volume", 1))));
        } catch (Exception ignored) { }
    }

    private static boolean practice(MediaItem item) {
        return item != null && item.mediaMetadata.extras != null
            && DharmaAudioRecoveryPolicy.isPractice(item.mediaMetadata.extras.getString("albumId", ""), item.mediaMetadata.extras.getString("queueId", ""));
    }
}
