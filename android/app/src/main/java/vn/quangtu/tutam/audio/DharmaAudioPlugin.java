package vn.quangtu.tutam.audio;

import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "DharmaAudio")
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class DharmaAudioPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private ListenableFuture<MediaController> connecting;
    private MediaController controller;
    private boolean destroyed;
    private PracticeSounds practiceSounds;
    private volatile int principalGeneration;
    private String widgetRefreshPrincipal;
    private final Runnable ticker = new Runnable() {
        @Override public void run() { publish(); main.postDelayed(this, 1000); }
    };
    private interface Operation { void run(MediaController c) throws Exception; }
    private void execute(PluginCall call, Operation operation) {
        execute(call, operation, false);
    }
    private void execute(PluginCall call, Operation operation, boolean includeAlbum) {
        final int selectedGeneration = principalGeneration;
        main.post(() -> {
            if (destroyed) { call.reject("Audio bridge is closed"); return; }
            if (selectedGeneration != principalGeneration) { call.reject("Audio principal changed"); return; }
            if (connecting == null) {
                SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), DharmaPlaybackService.class));
                connecting = new MediaController.Builder(getContext(), token).buildAsync();
                connecting.addListener(() -> {
                    try {
                        if (destroyed) return;
                        controller = connecting.get();
                        controller.addListener(new Player.Listener() {
                            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                                if (destroyed || controller == null || practiceSounds == null) return;
                                if (ready || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) {
                                    practiceSounds.suspend(!ready || controller.getPlaybackSuppressionReason() != Player.PLAYBACK_SUPPRESSION_REASON_NONE);
                                }
                            }
                            @Override public void onPlaybackSuppressionReasonChanged(int reason) {
                                if (destroyed || controller == null || practiceSounds == null) return;
                                if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE || controller.getPlayWhenReady()) {
                                    practiceSounds.suspend(reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE);
                                }
                            }
                            @Override public void onEvents(Player player, Player.Events events) { publish(); }
                            @Override public void onPlayerError(PlaybackException error) { publish(); }
                        });
                        main.post(ticker);
                    } catch (Exception ignored) { }
                }, ContextCompat.getMainExecutor(getContext()));
            }
            connecting.addListener(() -> {
                try {
                    if (destroyed) { call.reject("Audio bridge is closed"); return; }
                    if (selectedGeneration != principalGeneration) { call.reject("Audio principal changed"); return; }
                    operation.run(connecting.get());
                    call.resolve(state(includeAlbum));
                } catch (Exception e) { call.reject("Native audio: " + e.getMessage(), e); }
            }, ContextCompat.getMainExecutor(getContext()));
        });
    }

    private JSObject state() { return state(false); }
    private JSObject state(boolean includeAlbum) {
        JSObject out = new JSObject();
        MediaController c = controller;
        if (c == null) return out;
        MediaItem item = c.getCurrentMediaItem();
        Bundle extras = item == null ? null : item.mediaMetadata.extras;
        out.put("queueId", extras == null ? "" : extras.getString("queueId", ""));
        out.put("trackIndex", c.getCurrentMediaItemIndex());
        out.put("position", c.getCurrentPosition() / 1000.0);
        out.put("observedAtMs", System.currentTimeMillis());
        out.put("duration", c.getDuration() == C.TIME_UNSET ? 0 : c.getDuration() / 1000.0);
        out.put("playing", c.isPlaying());
        out.put("playWhenReady", c.getPlayWhenReady());
        out.put("buffering", c.getPlaybackState() == Player.STATE_BUFFERING);
        out.put("ended", c.getPlaybackState() == Player.STATE_ENDED);
        out.put("speed", c.getPlaybackParameters().speed);
        out.put("repeat", c.getRepeatMode());
        out.put("volume", c.getVolume());
        PlaybackException error = c.getPlayerError();
        out.put("error", error == null ? "" : error.getMessage());
        DharmaPlaybackService service = DharmaPlaybackService.active;
        out.put("sleepRemainingMs", service == null ? 0 : service.getSleepRemainingMs());
        out.put("sleepAtEnd", service != null && service.getSleepAtEnd());
        if (includeAlbum && item != null && extras != null) {
            JSObject album = new JSObject();
            album.put("id", extras.getString("albumId", ""));
            album.put("title", String.valueOf(item.mediaMetadata.albumTitle));
            album.put("description", String.valueOf(item.mediaMetadata.artist));
            album.put("artwork", extras.getString("originalArtwork", ""));
            JSArray tracks = new JSArray();
            for (int i = 0; i < c.getMediaItemCount(); i++) {
                MediaItem track = c.getMediaItemAt(i);
                JSObject row = new JSObject(); row.put("url", track.mediaId); row.put("title", String.valueOf(track.mediaMetadata.title));
                tracks.put(row);
            }
            album.put("tracks", tracks);
            out.put("album", album);
        }
        return out;
    }
    private void publish() { if (!destroyed && controller != null) notifyListeners("state", state()); }

    @PluginMethod public void selectPrincipal(PluginCall call) {
        String key = call.getString("principalKey", "");
        if (key.isEmpty() || key.length() > 512) { call.reject("Invalid audio principal"); return; }
        main.post(() -> {
            if (destroyed) { call.reject("Audio bridge is closed"); return; }
            android.util.AtomicFile marker = new android.util.AtomicFile(new File(getContext().getNoBackupFilesDir(), "dharma-audio-principal-v1.txt"));
            String previous = "";
            try { previous = new String(marker.readFully(), StandardCharsets.UTF_8); } catch (Exception ignored) { }
            if (key.equals(previous)) {
                if (!key.equals(widgetRefreshPrincipal)) {
                    DharmaAudioWidgetProvider.updateAll(getContext());
                    widgetRefreshPrincipal = key;
                }
                call.resolve(); return;
            }
            // Chặn command cũ đang chờ kết nối trước khi chọn tài khoản/role mới.
            principalGeneration++;
            if (practiceSounds != null) practiceSounds.release();
            DharmaPlaybackService active = DharmaPlaybackService.active;
            if (active != null) active.clearForPrincipal();
            DharmaAudioWidgetStore.clear(getContext());
            DharmaAudioWidgetProvider.updateAll(getContext());
            FileOutputStream output = null;
            try {
                output = marker.startWrite(); output.write(key.getBytes(StandardCharsets.UTF_8)); marker.finishWrite(output);
                widgetRefreshPrincipal = key;
                call.resolve();
            } catch (Exception error) {
                if (output != null) marker.failWrite(output);
                call.reject("Cannot select audio principal", error);
            }
        });
    }

    @PluginMethod public void setQueue(PluginCall call) {
        execute(call, c -> {
            JSONArray rows = call.getArray("tracks");
            if (rows == null || rows.length() == 0 || rows.length() > 5000) throw new IllegalArgumentException("Invalid playlist");
            ArrayList<MediaItem> items = new ArrayList<>();
            String queueId = call.getString("queueId", "");
            String album = call.getString("album", "Pháp thoại");
            String artist = call.getString("artist", "Tu tập");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String url = row.getString("url");
                File cached = cacheFile(url, false);
                Uri uri = cached.isFile() && cached.length() > 0 ? Uri.fromFile(cached) : Uri.parse(url);
                String scheme = uri.getScheme();
                if (!"https".equals(scheme) && !"http".equals(scheme) && !"asset".equals(scheme) && !"file".equals(scheme)) throw new IllegalArgumentException("Unsupported audio source");
                Bundle extras = new Bundle(); extras.putString("queueId", queueId);
                extras.putString("albumId", call.getString("albumId", ""));
                extras.putString("originalArtwork", call.getString("originalArtwork", ""));
                MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                    .setTitle(row.getString("title")).setAlbumTitle(album).setArtist(artist).setExtras(extras);
                String artwork = call.getString("artwork");
                if (artwork != null && !artwork.isEmpty()) metadata.setArtworkUri(Uri.parse(artwork));
                items.add(new MediaItem.Builder().setMediaId(url).setUri(uri).setMediaMetadata(metadata.build()).build());
            }
            int index = call.getInt("index", 0);
            if (index < 0 || index >= items.size()) throw new IllegalArgumentException("Invalid track index");
            c.setPlayWhenReady(false);
            c.setMediaItems(items, index, Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000)));
            c.prepare();
        });
    }
    @PluginMethod public void play(PluginCall call) { execute(call, c -> {
        if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback() && c.getPlaybackState() == Player.STATE_ENDED) throw new IllegalStateException("Rosary session has completed");
        if (c.getPlaybackState() == Player.STATE_ENDED) c.seekTo(0);
        if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.rewindRecoveredEndForPlay();
        if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
        c.play();
    }); }
    @PluginMethod public void pause(PluginCall call) { execute(call, MediaController::pause); }
    @PluginMethod public void stop(PluginCall call) { execute(call, c -> { c.stop(); c.clearMediaItems(); if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.setSleep(0, false); }); }
    @PluginMethod public void seek(PluginCall call) { execute(call, c -> {
        if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback()) throw new IllegalStateException("Rosary seeking is unavailable");
        c.seekTo(Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000)));
    }); }
    @PluginMethod public void options(PluginCall call) {
        execute(call, c -> {
            if (DharmaPlaybackService.active != null && DharmaPlaybackService.active.isRosaryPlayback()) {
                if ((call.hasOption("speed") && call.getDouble("speed", 1.0) != 1.0)
                        || (call.hasOption("repeat") && call.getInt("repeat", 0) != 0)) throw new IllegalStateException("Rosary cadence is fixed for this session");
            }
            if (call.hasOption("speed")) c.setPlaybackSpeed((float) Math.max(.25, Math.min(3, call.getDouble("speed", 1.0))));
            if (call.hasOption("volume")) c.setVolume((float) Math.max(0, Math.min(1, call.getDouble("volume", 1.0))));
            if (call.hasOption("repeat")) c.setRepeatMode(call.getInt("repeat", 0));
        });
    }
    @PluginMethod public void sleep(PluginCall call) {
        execute(call, c -> {
            // JSON represents ordinary timer values as Integer, not Long.
            long remaining = Math.max(0, Math.round(call.getData().optDouble("remainingMs", 0)));
            if (DharmaPlaybackService.active != null) DharmaPlaybackService.active.setSleep(remaining, call.getBoolean("atEnd", false));
        });
    }
    @PluginMethod public void getState(PluginCall call) { execute(call, c -> {}); }
    @PluginMethod public void peek(PluginCall call) {
        main.post(() -> {
            if (DharmaPlaybackService.active == null) call.resolve(new JSObject());
            else execute(call, c -> {}, true);
        });
    }

    static Uri resolveCached(android.content.Context context, Uri original) {
        try { File cached = audioCacheFile(context, original.toString(), false); if (cached.isFile() && cached.length() > 0) return Uri.fromFile(cached); }
        catch (Exception ignored) { }
        return original;
    }

    private File cacheFile(String key, boolean partial) throws Exception {
        return audioCacheFile(getContext(), key, partial);
    }
    private static File audioCacheFile(android.content.Context context, String key, boolean partial) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder(); for (byte b : digest) name.append(String.format("%02x", b));
        File directory = new File(context.getCacheDir(), "dharmatalks"); directory.mkdirs();
        return new File(directory, name + (partial ? ".partial" : ".audio"));
    }
    @PluginMethod public void cacheStatus(PluginCall call) {
        try { File file = cacheFile(call.getString("key", ""), false); JSObject out = new JSObject(); out.put("bytes", file.isFile() ? file.length() : 0); call.resolve(out); }
        catch (Exception e) { call.reject("Cannot inspect audio cache", e); }
    }
    @PluginMethod public void cacheChunk(PluginCall call) {
        try {
            String key = call.getString("key", "");
            int offset = call.getInt("offset", -1);
            String data = call.getString("data", "");
            if (key.isEmpty() || data.length() > 800000 || offset < 0) throw new IllegalArgumentException("Invalid audio chunk");
            File partial = cacheFile(key, true);
            if (offset != 0 && partial.length() != offset) throw new IllegalArgumentException("Audio cache offset mismatch");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(partial, offset != 0)) { out.write(bytes); }
            if (call.getBoolean("last", false)) {
                File target = cacheFile(key, false);
                if (target.exists() && !target.delete()) throw new IllegalStateException("Cannot replace audio cache");
                if (!partial.renameTo(target)) throw new IllegalStateException("Cannot finish audio cache");
            }
            call.resolve();
        } catch (Exception e) { call.reject("Cannot cache offline audio", e); }
    }
    @PluginMethod public void backgroundStatus(PluginCall call) {
        ActivityManager activity = (ActivityManager) getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
        PowerManager power = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        JSObject out = new JSObject();
        out.put("restricted", Build.VERSION.SDK_INT >= 28 && activity.isBackgroundRestricted());
        out.put("batteryOptimized", !power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(out);
    }
    @PluginMethod public void openBackgroundSettings(PluginCall call) {
        try { getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()))); call.resolve(); }
        catch (Exception e) { call.reject("Cannot open application settings", e); }
    }
    @PluginMethod public void practiceSound(PluginCall call) {
        final int selectedGeneration = principalGeneration;
        main.post(() -> {
            try {
                if (destroyed) throw new IllegalStateException("Audio bridge is closed");
                if (selectedGeneration != principalGeneration) throw new IllegalStateException("Audio principal changed");
                if (practiceSounds == null) practiceSounds = new PracticeSounds(getContext(), main);
                String channel = call.getString("channel", "");
                if (call.getBoolean("stop", false)) practiceSounds.stop(channel);
                else if (channel.equals("ambient")) {
                    float volume = (float) Math.max(0, Math.min(1, call.getDouble("volume", 0.5)));
                    if (call.getString("source") == null) practiceSounds.volume(volume);
                    else practiceSounds.ambient(call.getString("source", ""), volume);
                }
                else if (channel.equals("cue")) practiceSounds.cue(call.getString("cue", ""),
                    Math.max(0, Math.min(5000, call.getInt("delayMs", 0))));
                else throw new IllegalArgumentException("Invalid sound channel");
                call.resolve();
            } catch (Exception error) { call.reject("Cannot play practice sound", error); }
        });
    }

    @Override protected void handleOnDestroy() {
        destroyed = true;
        if (practiceSounds != null) practiceSounds.release();
        main.removeCallbacksAndMessages(null);
        if (connecting != null) MediaController.releaseFuture(connecting);
        controller = null;
        // Releasing the UI controller deliberately leaves the playback service running.
        super.handleOnDestroy();
    }
}
