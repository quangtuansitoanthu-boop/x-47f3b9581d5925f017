package vn.quangtu.tutam.audio;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionResult;
import vn.quangtu.tutam.MainActivity;

/** The service owns audio, focus, wake locks, playlist and sleep timer, independently of WebView. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class DharmaPlaybackService extends MediaSessionService {
    static DharmaPlaybackService active;
    private ExoPlayer player;
    private MediaSession session;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long sleepRemainingMs;
    private boolean sleepAtEnd;
    private long lastTick;
    private boolean wasPlaying;
    private long lastWidgetPublish;
    private String lastWidgetState = "";
    private org.json.JSONObject recoveredCheckpoint;
    private boolean artworkDisposed;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            tickSleep();
            if (player.isPlaying() && SystemClock.elapsedRealtime() - lastWidgetPublish >= 10000) publishWidget();
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        active = this;
        player = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(
                new ResolvingDataSource.Factory(new DefaultDataSource.Factory(this),
                    spec -> spec.withUri(DharmaAudioPlugin.resolveCached(this, spec.uri)))))
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(30000)
            .build();
        // Phục hồi trước listener/ticker để queue rỗng lúc cold start không xóa snapshot.
        DharmaAudioWidgetStore.restore(this, player);
        org.json.JSONObject savedDisplay = DharmaAudioWidgetStore.read(this).optJSONObject("display");
        if (savedDisplay != null && player.getMediaItemCount() > 0) {
            recoveredCheckpoint = savedDisplay;
            sleepRemainingMs = Math.max(0, savedDisplay.optLong("sleepRemainingMs"));
            sleepAtEnd = savedDisplay.optBoolean("sleepAtEnd");
            player.setPauseAtEndOfMediaItems(sleepAtEnd);
        }
        player.addListener(new Player.Listener() {
            @Override public void onTimelineChanged(androidx.media3.common.Timeline timeline, int reason) { DharmaAudioWidgetStore.invalidateQueue(); }
            @Override public void onPlaybackStateChanged(int state) {
                // playWhenReady can remain true in STATE_ENDED. Publish a stopped
                // final item and release active playback/foreground wake state.
                if (state == Player.STATE_ENDED) player.setPlayWhenReady(false);
            }
            @Override public void onIsPlayingChanged(boolean playing) {
                tickSleep();
                wasPlaying = playing;
                lastTick = SystemClock.elapsedRealtime();
            }
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                if (!ready && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM && sleepAtEnd) {
                    setSleep(0, false);
                }
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                if (sleepAtEnd && reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) {
                    player.pause();
                    setSleep(0, false);
                }
            }
            @Override public void onEvents(Player changed, Player.Events events) { publishWidget(); }
        });
        Intent activity = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 70, activity,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        session = new MediaSession.Builder(this, player).setSessionActivity(pending)
            .setCallback(new MediaSession.Callback() {
                @Override public MediaSession.ConnectionResult onConnect(MediaSession s, MediaSession.ControllerInfo c) {
                    if (!getPackageName().equals(c.getPackageName()) && !c.isTrusted()) {
                        return MediaSession.ConnectionResult.reject();
                    }
                    return MediaSession.Callback.super.onConnect(s, c);
                }
                @Override public int onPlayerCommandRequest(MediaSession s, MediaSession.ControllerInfo c, int command) {
                    // Native media controls must not skip unheard rosary beats or repeat a completed session.
                    if (isRosaryPlayback() && ((command >= Player.COMMAND_SEEK_TO_DEFAULT_POSITION && command <= Player.COMMAND_SEEK_FORWARD)
                            || (!getPackageName().equals(c.getPackageName()) && (command == Player.COMMAND_SET_SPEED_AND_PITCH || command == Player.COMMAND_SET_REPEAT_MODE))
                            || (command == Player.COMMAND_PLAY_PAUSE && player.getPlaybackState() == Player.STATE_ENDED))) {
                        return SessionResult.RESULT_ERROR_NOT_SUPPORTED;
                    }
                    return MediaSession.Callback.super.onPlayerCommandRequest(s, c, command);
                }
            }).build();
        lastTick = SystemClock.elapsedRealtime();
        handler.post(ticker);
    }

    /** PendingIntent nội bộ gọi cùng player; không mở Activity hoặc WebView. */
    void handleWidgetCommand(Intent intent) {
        if (intent == null || !DharmaAudioWidgetProvider.ACTION.equals(intent.getAction())) return;
        try {
            if (isPracticePlayback()) { publishWidget(); return; }
            if (player.getMediaItemCount() == 0) DharmaAudioWidgetStore.restore(this, player);
            if (player.getMediaItemCount() == 0) {
                DharmaAudioWidgetStore.clear(this);
                DharmaAudioWidgetProvider.updateAll(this);
                stopSelf();
                return;
            }
            MediaItem selected = player.getCurrentMediaItem();
            if (isPracticePlayback()) { publishWidget(); return; }
            String queueId = selected == null || selected.mediaMetadata.extras == null ? "" : selected.mediaMetadata.extras.getString("queueId", "");
            if (!queueId.equals(intent.getStringExtra("queueId"))) { publishWidget(); return; }
            String command = intent.getStringExtra("command");
            boolean startPlaying = false;
            if ("toggle".equals(command)) {
                // Lỗi nguồn giữ playWhenReady=true nhưng player đã IDLE; nút Play phải retry.
                if (player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_IDLE) player.pause();
                else { if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0); rewindRecoveredEndForPlay(); startPlaying = true; }
            } else if ("back".equals(command)) player.seekTo(Math.max(0, player.getCurrentPosition() - 15000));
            else if ("forward".equals(command)) {
                long next = player.getCurrentPosition() + 15000;
                player.seekTo(player.getDuration() == C.TIME_UNSET ? next : Math.min(player.getDuration(), next));
            } else if ("track".equals(command)) {
                int index = intent.getIntExtra("index", -1);
                if (index >= 0 && index < player.getMediaItemCount()
                    && trackIdentity(player.getMediaItemAt(index).mediaId).equals(intent.getStringExtra("trackId"))) {
                    player.seekTo(index, 0); startPlaying = true;
                }
            } else if ("repeat".equals(command)) player.setRepeatMode((player.getRepeatMode() + 1) % 3);
            else if ("sleep".equals(command)) {
                long minutes = (sleepRemainingMs + 59999) / 60000;
                setSleep(minutes == 0 ? 15 * 60000 : minutes <= 15 ? 30 * 60000 : minutes <= 30 ? 60 * 60000 : 0, false);
            }
            if (startPlaying) { if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare(); player.play(); }
            publishWidget();
        } catch (Exception ignored) {
            // Giữ queue hiện có khi command lỗi; người dùng vẫn điều khiển từ app/media notification.
            DharmaAudioWidgetProvider.updateAll(this);
        }
    }

    org.json.JSONObject widgetState() {
        org.json.JSONObject out = new org.json.JSONObject();
        try {
            MediaItem item = player.getCurrentMediaItem();
            if (isPracticePlayback()) return out;
            out.put("ready", item != null); out.put("playing", player.isPlaying());
            out.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
            out.put("trackId", item == null ? "" : trackIdentity(item.mediaId));
            out.put("title", item == null ? "" : String.valueOf(item.mediaMetadata.title));
            out.put("artist", item == null ? "" : String.valueOf(item.mediaMetadata.artist));
            out.put("position", Math.max(0, player.getCurrentPosition()));
            out.put("duration", player.getDuration() == C.TIME_UNSET ? 0 : Math.max(0, player.getDuration()));
            out.put("repeat", player.getRepeatMode()); out.put("sleepRemainingMs", sleepRemainingMs); out.put("sleepAtEnd", sleepAtEnd);
            out.put("queueId", item == null || item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("queueId", ""));
            out.put("albumId", item == null || item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("albumId", ""));
            String artwork = DharmaAudioWidgetArtwork.safeUri(this, item == null || item.mediaMetadata.artworkUri == null ? "" : item.mediaMetadata.artworkUri.toString());
            String original = DharmaAudioWidgetArtwork.original(this, item == null || item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("originalArtwork", ""));
            String artworkKey = DharmaAudioWidgetArtwork.key(this, out.optString("albumId"), artwork, original);
            if (!artwork.isEmpty()) out.put("artwork", artwork);
            if (!original.isEmpty()) out.put("originalArtwork", original);
            if (!artworkKey.isEmpty()) out.put("artworkKey", artworkKey);
            org.json.JSONArray next = new org.json.JSONArray();
            for (int i = player.getCurrentMediaItemIndex() + 1; i < player.getMediaItemCount() && next.length() < 3; i++) {
                org.json.JSONObject row = new org.json.JSONObject(); row.put("index", i);
                row.put("title", String.valueOf(player.getMediaItemAt(i).mediaMetadata.title)); row.put("trackId", trackIdentity(player.getMediaItemAt(i).mediaId)); next.put(row);
            }
            out.put("next", next);
        } catch (Exception ignored) { }
        return out;
    }

    static String trackIdentity(String source) {
        try {
            byte[] bytes = java.security.MessageDigest.getInstance("SHA-256").digest(source.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(); for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    boolean isRosaryPlayback() {
        MediaItem item = player.getCurrentMediaItem();
        return item != null && item.mediaMetadata.extras != null
            && DharmaAudioRecoveryPolicy.isRosary(item.mediaMetadata.extras.getString("albumId", ""), item.mediaMetadata.extras.getString("queueId", ""));
    }

    private boolean isPracticePlayback() {
        MediaItem item = player == null ? null : player.getCurrentMediaItem();
        return item != null && item.mediaMetadata.extras != null
            && DharmaAudioRecoveryPolicy.isPractice(item.mediaMetadata.extras.getString("albumId", ""), item.mediaMetadata.extras.getString("queueId", ""));
    }

    void rewindRecoveredEndForPlay() {
        if (recoveredCheckpoint == null || isPracticePlayback() || player.getPlaybackState() != Player.STATE_IDLE) return;
        MediaItem item = player.getCurrentMediaItem();
        if (item == null) return;
        String queueId = item.mediaMetadata.extras == null ? "" : item.mediaMetadata.extras.getString("queueId", "");
        if (DharmaAudioRecoveryPolicy.matchesEndedCheckpoint(queueId, trackIdentity(item.mediaId), player.getCurrentPosition(),
                recoveredCheckpoint.optString("queueId"), recoveredCheckpoint.optString("trackId"),
                recoveredCheckpoint.optLong("position"), recoveredCheckpoint.optBoolean("ended"))) {
            player.seekTo(DharmaAudioRecoveryPolicy.recoveryPosition(player.getCurrentPosition(), true));
            recoveredCheckpoint = null;
        }
    }

    void clearForPrincipal() {
        recoveredCheckpoint = null;
        player.stop();
        player.clearMediaItems();
        setSleep(0, false);
        DharmaAudioWidgetStore.clear(this);
        lastWidgetState = "";
        publishWidget();
    }

    private void publishWidget() {
        if (player == null) return;
        lastWidgetPublish = SystemClock.elapsedRealtime();
        org.json.JSONObject state = widgetState();
        if (!artworkDisposed && session != null && state.optBoolean("ready")) {
            String queue = state.optString("queueId"), key = state.optString("artworkKey");
            DharmaAudioWidgetArtwork.request(this, queue, state.optString("albumId"), state.optString("artwork"), state.optString("originalArtwork"),
                session.getBitmapLoader(), () -> currentArtwork(queue, key), () -> DharmaAudioWidgetProvider.updateAll(this));
        }
        String encoded = state.toString();
        if (encoded.equals(lastWidgetState)) return;
        lastWidgetState = encoded;
        if (player.getMediaItemCount() == 0 || isPracticePlayback()) DharmaAudioWidgetStore.clear(this);
        else DharmaAudioWidgetStore.save(this, player, state);
        DharmaAudioWidgetProvider.updateAll(this);
    }

    private boolean currentArtwork(String queue, String key) {
        if (artworkDisposed || active != this || player == null || isPracticePlayback()) return false;
        MediaItem item = player.getCurrentMediaItem();
        if (item == null || item.mediaMetadata.extras == null || !queue.equals(item.mediaMetadata.extras.getString("queueId", ""))) return false;
        return key.equals(DharmaAudioWidgetArtwork.key(this, item.mediaMetadata.extras.getString("albumId", ""),
            item.mediaMetadata.artworkUri == null ? "" : item.mediaMetadata.artworkUri.toString(), item.mediaMetadata.extras.getString("originalArtwork", "")));
    }

    private void tickSleep() {
        long now = SystemClock.elapsedRealtime();
        if (sleepRemainingMs > 0 && wasPlaying) {
            sleepRemainingMs = Math.max(0, sleepRemainingMs - Math.max(0, now - lastTick));
            if (sleepRemainingMs == 0) player.pause();
        }
        lastTick = now;
    }

    void setSleep(long milliseconds, boolean endOfTrack) {
        sleepRemainingMs = Math.max(0, milliseconds);
        sleepAtEnd = endOfTrack;
        lastTick = SystemClock.elapsedRealtime();
        player.setPauseAtEndOfMediaItems(endOfTrack);
        publishWidget();
    }
    long getSleepRemainingMs() { return sleepRemainingMs; }
    boolean getSleepAtEnd() { return sleepAtEnd; }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) { return session; }
    @Override public void onDestroy() {
        artworkDisposed = true;
        if (active == this) DharmaAudioWidgetArtwork.invalidate();
        handler.removeCallbacksAndMessages(null);
        publishWidget();
        active = null;
        if (session != null) session.release();
        if (player != null) player.release();
        DharmaAudioWidgetProvider.updateAll(this);
        super.onDestroy();
    }
}
