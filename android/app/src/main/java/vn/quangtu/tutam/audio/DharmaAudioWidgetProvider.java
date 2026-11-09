package vn.quangtu.tutam.audio;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.LinkedHashMap;
import vn.quangtu.tutam.MainActivity;
import vn.quangtu.tutam.R;
import org.json.JSONArray;
import org.json.JSONObject;

/** Điều khiển player hiện có; widget không tạo player hay request metadata riêng. */
public class DharmaAudioWidgetProvider extends AppWidgetProvider {
    public static final String ACTION = "vn.quangtu.tutam.DHARMA_WIDGET";
    public static final class Small extends DharmaAudioWidgetProvider {}
    public static final class Medium extends DharmaAudioWidgetProvider {}
    public static final class Large extends DharmaAudioWidgetProvider {}

    private static Uri openingUri(JSONObject state) {
        Uri route = Uri.parse("vn.quangtu.tutam:///phap-thoai");
        if (state == null || !state.optBoolean("ready") || !(state.opt("albumId") instanceof String)) return route;
        String albumId = (String) state.opt("albumId");
        if (albumId.trim().isEmpty() || albumId.length() > 256) return route;
        for (int index = 0; index < albumId.length(); index++) {
            if (Character.isISOControl(albumId.charAt(index))) return route;
        }
        return route.buildUpon().appendQueryParameter("album", albumId).build();
    }

    private static PendingIntent command(Context context, String command, int index, JSONObject state) {
        Intent intent = new Intent(context, DharmaAudioWidgetProvider.class).setAction(ACTION)
            .setData(Uri.parse("tutam-widget://audio/" + command + "/" + index))
            .putExtra("command", command).putExtra("index", index).putExtra("queueId", state.optString("queueId"));
        if ("track".equals(command)) {
            JSONArray next = state.optJSONArray("next");
            if (next != null) for (int i = 0; i < next.length(); i++) {
                JSONObject row = next.optJSONObject(i);
                if (row != null && row.optInt("index", -1) == index) intent.putExtra("trackId", row.optString("trackId"));
            }
        }
        intent.setData(Uri.parse("tutam-widget://audio/" + command + "/" + index + "/"
            + Uri.encode(state.optString("queueId")) + "/" + intent.getStringExtra("trackId")));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    private static RemoteViews views(Context context, int layout, JSONObject state, int height) {
        context = vn.quangtu.tutam.widgets.PracticeWidgetProvider.localizedContext(context);
        RemoteViews view = new RemoteViews(context.getPackageName(), layout);
        vn.quangtu.tutam.widgets.PracticeWidgetProvider.localizeStaticText(context, view, layout);
        boolean ready = state.optBoolean("ready");
        android.graphics.Bitmap cover = DharmaAudioWidgetArtwork.bitmap(context, state);
        view.setImageViewResource(R.id.dharma_cover, android.R.color.transparent);
        if (cover != null) view.setImageViewBitmap(R.id.dharma_cover, cover);
        boolean playing = ready && DharmaPlaybackService.active != null && state.optBoolean("playing");
        long duration = Math.max(0, state.optLong("duration"));
        String title = ready ? metadata(state.optString("title"), context.getString(R.string.dharma_audio_name)) : context.getString(R.string.dharma_audio_choose);
        view.setTextViewText(R.id.dharma_title, title);
        view.setTextViewText(R.id.dharma_times, ready ? time(state.optLong("position")) + " / " + (duration > 0 ? time(duration) : "—") : "");
        view.setTextViewText(R.id.dharma_status, context.getString(!ready ? R.string.dharma_audio_unselected
            : playing ? R.string.dharma_audio_playing : state.optBoolean("ended") ? R.string.dharma_audio_ended : R.string.dharma_audio_pause));
        Intent open = new Intent(Intent.ACTION_VIEW, openingUri(state), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent launch = PendingIntent.getActivity(context, 1510500, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.dharma_root, launch);
        view.setOnClickPendingIntent(R.id.dharma_cover, launch);
        view.setImageViewResource(R.id.dharma_play, playing ? R.drawable.dharma_audio_pause : R.drawable.dharma_audio_play);
        view.setContentDescription(R.id.dharma_play, context.getString(playing ? R.string.dharma_audio_pause : R.string.dharma_audio_play));
        view.setOnClickPendingIntent(R.id.dharma_play, ready ? command(context, "toggle", 0, state) : launch);
        float fontScale = context.getResources().getConfiguration().fontScale;
        int smallFontAllowance = (int) Math.ceil(Math.max(0, fontScale - 1) * 70);
        if (layout == R.layout.dharma_audio_small || layout == R.layout.dharma_audio_small_narrow) {
            view.setViewVisibility(R.id.dharma_small_label, height < 180 + smallFontAllowance ? View.GONE : View.VISIBLE);
            view.setViewVisibility(R.id.dharma_cover, height < 135 ? View.GONE : View.VISIBLE);
            view.setViewVisibility(R.id.dharma_status, height < 135 + smallFontAllowance ? View.GONE : View.VISIBLE);
            view.setViewVisibility(R.id.dharma_times, ready && height >= 150 + smallFontAllowance ? View.VISIBLE : View.GONE);
            view.setInt(R.id.dharma_title, "setMaxLines", height < 135 ? 1 : 2);
            return view;
        }
        view.setTextViewText(R.id.dharma_artist, ready ? metadata(state.optString("artist"), context.getString(R.string.dharma_audio_name)) : context.getString(R.string.dharma_audio_open));
        view.setViewVisibility(R.id.dharma_progress, ready && duration > 0 ? View.VISIBLE : View.GONE);
        boolean crampedMedium = layout == R.layout.dharma_audio_medium_tall && height < 190 && fontScale > 1.15f;
        boolean crampedLarge = layout == R.layout.dharma_audio_large && height < 280 && fontScale > 1.15f;
        if (crampedMedium || crampedLarge) view.setViewVisibility(R.id.dharma_artist, View.GONE);
        view.setViewVisibility(R.id.dharma_times, ready && layout != R.layout.dharma_audio_medium && !crampedMedium && !crampedLarge ? View.VISIBLE : View.GONE);
        view.setProgressBar(R.id.dharma_progress, 1000, (int) Math.max(0, Math.min(1000,
            duration > 0 ? state.optLong("position") * 1000d / duration : 0)), false);
        view.setOnClickPendingIntent(R.id.dharma_back, ready ? command(context, "back", 0, state) : launch);
        view.setOnClickPendingIntent(R.id.dharma_forward, ready ? command(context, "forward", 0, state) : launch);
        if (layout == R.layout.dharma_audio_large) {
            int repeatMode = Math.max(0, Math.min(2, state.optInt("repeat")));
            if (repeatMode > 0) view.setTextViewTextSize(R.id.dharma_repeat, android.util.TypedValue.COMPLEX_UNIT_SP, 14);
            view.setTextViewText(R.id.dharma_repeat, new String[]{"↻", "↻1", "↻∞"}[repeatMode]);
            view.setContentDescription(R.id.dharma_repeat, context.getString(new int[]{R.string.dharma_audio_repeat_off, R.string.dharma_audio_repeat_one, R.string.dharma_audio_repeat_all}[repeatMode]));
            long sleep = state.optLong("sleepRemainingMs");
            String sleepLabel = state.optBoolean("sleepAtEnd") ? context.getString(R.string.dharma_audio_sleep_end)
                : sleep > 0 ? context.getString(R.string.dharma_audio_sleep_short, (sleep + 59999) / 60000) : context.getString(R.string.dharma_audio_sleep_off);
            if (fontScale > 1.4f) view.setTextViewTextSize(R.id.dharma_sleep, android.util.TypedValue.COMPLEX_UNIT_SP, 9);
            view.setTextViewText(R.id.dharma_sleep, "◷\n" + sleepLabel);
            view.setContentDescription(R.id.dharma_sleep, context.getString(R.string.dharma_audio_sleep) + ": " + sleepLabel);
            view.setOnClickPendingIntent(R.id.dharma_repeat, ready ? command(context, "repeat", 0, state) : launch);
            view.setOnClickPendingIntent(R.id.dharma_sleep, ready ? command(context, "sleep", 0, state) : launch);
            // Chừa chỗ cho tên hai dòng và vùng chạm 48dp, kể cả khi người dùng tăng cỡ chữ.
            int fontAllowance = (int) Math.ceil(Math.max(0, context.getResources().getConfiguration().fontScale - 1) * 110);
            int visibleRows = visibleQueueRows(height - fontAllowance);
            JSONArray next = ready ? state.optJSONArray("next") : null;
            int[] rows = {R.id.dharma_next_1, R.id.dharma_next_2, R.id.dharma_next_3};
            int[] titles = {R.id.dharma_next_1_title, R.id.dharma_next_2_title, R.id.dharma_next_3_title};
            int[] covers = {R.id.dharma_next_1_cover, R.id.dharma_next_2_cover, R.id.dharma_next_3_cover};
            for (int i = 0; i < rows.length; i++) {
                view.setImageViewResource(covers[i], android.R.color.transparent);
                if (cover != null) view.setImageViewBitmap(covers[i], cover);
                JSONObject track = next == null ? null : next.optJSONObject(i);
                view.setViewVisibility(rows[i], track == null || i >= visibleRows ? View.GONE : View.VISIBLE);
                if (track != null) {
                    String nextTitle = metadata(track.optString("title"), context.getString(R.string.dharma_audio_name));
                    view.setTextViewText(titles[i], nextTitle);
                    view.setContentDescription(rows[i], context.getString(R.string.dharma_audio_play) + ": " + nextTitle);
                    view.setOnClickPendingIntent(rows[i], command(context, "track", track.optInt("index", -1), state));
                }
            }
            boolean empty = next == null || next.length() == 0;
            view.setViewVisibility(R.id.dharma_queue_label, !crampedLarge && (empty || visibleRows > 0) ? View.VISIBLE : View.GONE);
            view.setViewVisibility(R.id.dharma_empty_queue, empty || visibleRows == 0 ? View.VISIBLE : View.GONE);
            view.setTextViewText(R.id.dharma_empty_queue, context.getString(empty ? R.string.dharma_audio_queue_empty : R.string.dharma_audio_queue_open));
            if (crampedLarge) view.setInt(R.id.dharma_empty_queue, "setMaxLines", 1);
            view.setOnClickPendingIntent(R.id.dharma_empty_queue, launch);
        }
        return view;
    }

    private static String metadata(String value, String fallback) {
        return value == null || value.trim().isEmpty() || "null".equals(value) ? fallback : value;
    }

    private static int visibleQueueRows(int height) { return Math.max(0, Math.min(3, (height - 220) / 52)); }

    private static int sizeForBounds(int width, int height) {
        return width >= 260 && height >= 250 ? 2 : width >= 230 && height >= 155 ? 1 : width >= 230 ? -2 : width < 150 ? -1 : 0;
    }

    private static int[] legacySizesForBounds(int minWidth, int minHeight, int maxWidth, int maxHeight) {
        return new int[]{sizeForBounds(Math.max(minWidth, maxWidth), minHeight), sizeForBounds(minWidth, Math.max(minHeight, maxHeight))};
    }

    private static RemoteViews render(Context context, JSONObject state, int size, int height) {
        return views(context, size == 2 ? R.layout.dharma_audio_large : size == 1 ? R.layout.dharma_audio_medium_tall
            : size == -2 ? R.layout.dharma_audio_medium : size == -1 ? R.layout.dharma_audio_small_narrow : R.layout.dharma_audio_small, state, height);
    }

    private static String time(long millis) {
        long seconds = Math.max(0, millis) / 1000;
        return String.format(java.util.Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }

    private static void update(Context context, AppWidgetManager manager, int id, Class<?> owner, JSONObject state) {
        if (Build.VERSION.SDK_INT >= 31) {
            LinkedHashMap<SizeF, RemoteViews> sizes = new LinkedHashMap<>();
            sizes.put(new SizeF(110, 110), views(context, R.layout.dharma_audio_small_narrow, state, 110));
            sizes.put(new SizeF(110, 150), views(context, R.layout.dharma_audio_small_narrow, state, 150));
            sizes.put(new SizeF(110, 180), views(context, R.layout.dharma_audio_small_narrow, state, 180));
            sizes.put(new SizeF(150, 150), views(context, R.layout.dharma_audio_small, state, 150));
            sizes.put(new SizeF(150, 180), views(context, R.layout.dharma_audio_small, state, 180));
            sizes.put(new SizeF(230, 110), views(context, R.layout.dharma_audio_medium, state, 110));
            sizes.put(new SizeF(230, 155), views(context, R.layout.dharma_audio_medium_tall, state, 155));
            sizes.put(new SizeF(230, 190), views(context, R.layout.dharma_audio_medium_tall, state, 190));
            sizes.put(new SizeF(260, 250), views(context, R.layout.dharma_audio_large, state, 250));
            sizes.put(new SizeF(260, 300), views(context, R.layout.dharma_audio_large, state, 300));
            sizes.put(new SizeF(260, 345), views(context, R.layout.dharma_audio_large, state, 345));
            sizes.put(new SizeF(260, 400), views(context, R.layout.dharma_audio_large, state, 400));
            manager.updateAppWidget(id, new RemoteViews(sizes));
        } else {
            Bundle options = manager.getAppWidgetOptions(id);
            int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, owner == Small.class ? 110 : 260);
            int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, owner == Large.class ? 250 : 110);
            int maxWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidth);
            int maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeight);
            int[] sizes = legacySizesForBounds(minWidth, minHeight, maxWidth, maxHeight);
            manager.updateAppWidget(id, new RemoteViews(render(context, state, sizes[0], minHeight),
                render(context, state, sizes[1], Math.max(minHeight, maxHeight))));
        }
    }

    public static void updateAll(Context context) {
        JSONObject state = DharmaPlaybackService.active == null ? DharmaAudioWidgetStore.display(context) : DharmaPlaybackService.active.widgetState();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> owner : new Class<?>[]{Small.class, Medium.class, Large.class})
            for (int id : manager.getAppWidgetIds(new ComponentName(context, owner))) update(context, manager, id, owner, state);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { updateAll(context); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION.equals(intent.getAction())) {
            // Kết nối MediaSession trước; không startForegroundService cho thao tác pause/timer.
            PendingResult pending = goAsync();
            // Context của receiver không được bindService; dùng owner ứng dụng cho kết nối bất đồng bộ.
            Context applicationContext = context.getApplicationContext();
            final com.google.common.util.concurrent.ListenableFuture<androidx.media3.session.MediaController> connection;
            try {
                connection = new androidx.media3.session.MediaController.Builder(applicationContext,
                    new androidx.media3.session.SessionToken(applicationContext, new ComponentName(applicationContext, DharmaPlaybackService.class))).buildAsync();
            } catch (RuntimeException error) {
                pending.finish();
                android.util.Log.w("TuTapDharmaWidget", "Không thể kết nối trình phát từ widget (" + error.getClass().getSimpleName() + ").");
                updateAll(applicationContext);
                return;
            }
            android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
            java.util.concurrent.atomic.AtomicBoolean finished = new java.util.concurrent.atomic.AtomicBoolean();
            Runnable finish = () -> { if (finished.compareAndSet(false, true)) { try { androidx.media3.session.MediaController.releaseFuture(connection); } finally { pending.finish(); } } };
            handler.postDelayed(finish, 8000);
            connection.addListener(() -> {
                try {
                    if (!finished.get() && connection.get() != null && DharmaPlaybackService.active != null)
                        DharmaPlaybackService.active.handleWidgetCommand(intent);
                } catch (Exception ignored) { updateAll(applicationContext); }
                finally { handler.removeCallbacks(finish); finish.run(); }
            }, androidx.core.content.ContextCompat.getMainExecutor(applicationContext));
            return;
        }
        if (Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) updateAll(context);
    }
}
