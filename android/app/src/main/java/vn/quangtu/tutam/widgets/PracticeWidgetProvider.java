package vn.quangtu.tutam.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.util.AtomicFile;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import vn.quangtu.tutam.MainActivity;
import vn.quangtu.tutam.R;

/** Chỉ phản chiếu dữ liệu owner; mọi hành động mở công cụ, không tự ghi nhận công phu. */
public class PracticeWidgetProvider extends AppWidgetProvider {
    private static final String LOCALE_PREFS = "tutam-widget-locale-v1";
    public static Context localizedContext(Context context) {
        String language = context.getSharedPreferences(LOCALE_PREFS, Context.MODE_PRIVATE).getString("locale", "vi");
        return localizedContext(context, language);
    }
    public static Context localizedContext(Context context, String language) {
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.setLocale(new Locale("en".equals(language) ? "en" : "vi"));
        return context.createConfigurationContext(configuration);
    }
    // XML vẫn giữ bố cục/cỡ chữ cũ; chỉ áp bản dịch vào nhãn tĩnh của RemoteViews.
    public static void localizeStaticText(Context context, RemoteViews view, int layout) {
        try (XmlResourceParser parser = context.getResources().getLayout(layout)) {
            final String namespace = "http://schemas.android.com/apk/res/android";
            while (parser.next() != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
                if (parser.getEventType() != org.xmlpull.v1.XmlPullParser.START_TAG) continue;
                int id = parser.getAttributeResourceValue(namespace, "id", 0);
                int text = parser.getAttributeResourceValue(namespace, "text", 0);
                int description = parser.getAttributeResourceValue(namespace, "contentDescription", 0);
                if (id != 0 && text != 0) view.setTextViewText(id, context.getText(text));
                if (id != 0 && description != 0) view.setContentDescription(id, context.getText(description));
            }
        } catch (Exception ignored) { /* Nhãn gốc của layout vẫn hiển thị nếu resource không đọc được. */ }
    }
    private static final String[] IDS = {"meditation", "chanting_beads", "sutra", "mantra"};
    private static final int[] TITLES = {R.string.practice_widget_meditation, R.string.practice_widget_rosary,
        R.string.practice_widget_sutra, R.string.practice_widget_mantra};
    private static final int[] SUBTITLES = {R.string.practice_widget_meditation_open, R.string.practice_widget_rosary_open,
        R.string.practice_widget_sutra_open, R.string.practice_widget_mantra_open};
    private static final String[] PATHS = {"/tu-tap?action=meditation", "/tu-tap?action=rosary", "/tu-tap?muc=kinh", "/tu-tap?muc=tri-chu"};
    private static final int[][] FRAMES = {{322,354,311,245}, {652,310,258,299}, {947,658,285,222}, {652,880,283,307}};

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "practice-widget-v1.json"));
    }

    public static synchronized void replaceSnapshot(Context context, JSONObject incoming) throws Exception {
        String date = incoming.optString("date");
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("Invalid practice date");
        JSONObject snapshot = new JSONObject().put("date", date).put("hasData", incoming.optBoolean("hasData"))
            .put("generatedAt", incoming.optString("generatedAt")).put("locale", "en".equals(incoming.optString("locale")) ? "en" : "vi");
        for (String field : new String[]{"completionPercent", "completedCount", "totalCount", "streakDays"}) {
            if (incoming.isNull(field) || !incoming.has(field)) snapshot.put(field, JSONObject.NULL);
            else {
                double value = incoming.getDouble(field);
                if (Double.isNaN(value) || Double.isInfinite(value) || value < 0 || value != Math.floor(value)
                    || (field.equals("completionPercent") && value > 100)) throw new IllegalArgumentException("Invalid " + field);
                snapshot.put(field, (int) value);
            }
        }
        JSONArray source = incoming.optJSONArray("items");
        if (source == null || source.length() > 4) throw new IllegalArgumentException("Expected at most four practice items");
        JSONArray items = new JSONArray();
        for (String id : IDS) {
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.getJSONObject(i);
                if (!id.equals(item.optString("id"))) continue;
                String title = item.optString("title"), subtitle = item.optString("subtitle");
                if (title.length() > 100 || subtitle.length() > 200) throw new IllegalArgumentException("Practice copy too long");
                JSONObject clean = new JSONObject().put("id", id).put("title", title).put("subtitle", subtitle)
                    .put("hasData", item.optBoolean("hasData")).put("isCompleted", item.optBoolean("isCompleted"));
                if (item.isNull("progress") || !item.has("progress")) clean.put("progress", JSONObject.NULL);
                else {
                    double progress = item.getDouble("progress");
                    if (Double.isNaN(progress) || Double.isInfinite(progress) || progress < 0 || progress > 1) throw new IllegalArgumentException("Invalid practice progress");
                    clean.put("progress", progress);
                }
                items.put(clean);
                break;
            }
        }
        snapshot.put("items", items);
        AtomicFile target = file(context);
        FileOutputStream output = null;
        try {
            output = target.startWrite();
            output.write(snapshot.toString().getBytes(StandardCharsets.UTF_8));
            target.finishWrite(output);
        } catch (Exception error) {
            if (output != null) target.failWrite(output);
            throw error;
        }
        String locale = snapshot.optString("locale", "vi");
        boolean localeChanged = !locale.equals(context.getSharedPreferences(LOCALE_PREFS, Context.MODE_PRIVATE).getString("locale", "vi"));
        context.getSharedPreferences(LOCALE_PREFS, Context.MODE_PRIVATE).edit().putString("locale", locale).apply();
        updateAll(context);
        if (localeChanged) {
            BuddhistCalendarWidgetProvider.updateAll(context);
            vn.quangtu.tutam.audio.DharmaAudioWidgetProvider.updateAll(context);
        }
    }

    private static String today() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        formatter.setTimeZone(TimeZone.getTimeZone("Asia/Ho_Chi_Minh"));
        return formatter.format(new java.util.Date());
    }

    private static JSONObject current(Context context) {
        try {
            JSONObject snapshot = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
            // Qua ngày mới không biến snapshot hôm qua thành tiến độ hôm nay.
            return today().equals(snapshot.optString("date")) ? snapshot : null;
        } catch (Exception ignored) { return null; }
    }

    private static PendingIntent open(Context context, String path) {
        Intent intent = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("vn.quangtu.tutam://" + path))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, path.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String summary(Context context, JSONObject data) {
        if (data == null || !data.optBoolean("hasData") || data.isNull("completedCount") || data.isNull("totalCount")) {
            return context.getString(R.string.practice_widget_missing_progress);
        }
        return context.getString(R.string.practice_widget_completion, data.optInt("completedCount"), data.optInt("totalCount"));
    }

    private static Bitmap artwork(Context context, int index) {
        try (java.io.InputStream input = context.getAssets().open("public/images/icons/sac-moc-anh-kim-v1.webp")) {
            Bitmap atlas = BitmapFactory.decodeStream(input);
            if (atlas == null) return null;
            int[] frame = FRAMES[index];
            Bitmap result = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(result);
            float scale = Math.min(96f / frame[2], 96f / frame[3]);
            float width = frame[2] * scale, height = frame[3] * scale;
            canvas.drawBitmap(atlas, new Rect(Math.round(frame[0] * atlas.getWidth() / 1254f), Math.round(frame[1] * atlas.getHeight() / 1254f), Math.round((frame[0] + frame[2]) * atlas.getWidth() / 1254f), Math.round((frame[1] + frame[3]) * atlas.getHeight() / 1254f)),
                new RectF((96-width)/2,(96-height)/2,(96+width)/2,(96+height)/2),new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            atlas.recycle();
            return result;
        } catch (Exception ignored) { return null; }
    }

    private static JSONObject item(JSONObject data, String id) {
        JSONArray items = data == null ? null : data.optJSONArray("items");
        if (items != null) for (int i = 0; i < items.length(); i++) {
            JSONObject candidate = items.optJSONObject(i);
            if (candidate != null && id.equals(candidate.optString("id"))) return candidate;
        }
        return null;
    }

    private static RemoteViews itemView(Context context, JSONObject data, int index, boolean large) {
        RemoteViews view = new RemoteViews(context.getPackageName(), large ? R.layout.practice_widget_item : R.layout.practice_widget_grid_item);
        JSONObject item = item(data, IDS[index]);
        String title = item != null && !item.optString("title").isEmpty() ? item.optString("title") : context.getString(TITLES[index]);
        String subtitle = context.getString(SUBTITLES[index]);
        view.setTextViewText(R.id.practice_widget_item_title, title);
        if (large) {
            view.setTextViewText(R.id.practice_widget_item_subtitle, subtitle);
            view.setViewVisibility(R.id.practice_widget_item_subtitle, context.getResources().getConfiguration().fontScale > 1.4f ? android.view.View.GONE : android.view.View.VISIBLE);
        } else {
            // Decorative chevrons/artwork yield space to readable tool labels at large system font sizes.
            view.setViewVisibility(R.id.practice_widget_item_check, context.getResources().getConfiguration().fontScale > 1.15f ? android.view.View.GONE : android.view.View.VISIBLE);
            view.setViewVisibility(R.id.practice_widget_item_icon, context.getResources().getConfiguration().fontScale > 1.4f ? android.view.View.GONE : android.view.View.VISIBLE);
        }
        view.setContentDescription(R.id.practice_widget_item, title + ". " + subtitle + ". " + context.getString(R.string.practice_widget_open));
        view.setOnClickPendingIntent(R.id.practice_widget_item, open(context, PATHS[index]));
        Bitmap icon = artwork(context, index);
        if (icon != null) view.setImageViewBitmap(R.id.practice_widget_item_icon, icon);
        return view;
    }

    private static RemoteViews render(Context context, JSONObject data, int size) {
        context = localizedContext(context);
        int layout = size == 2 ? R.layout.practice_widget_large : size == 1 ? R.layout.practice_widget_medium
            : size == -2 ? R.layout.practice_widget_narrow : size < 0 ? R.layout.practice_widget_compact : R.layout.practice_widget_small;
        RemoteViews view = new RemoteViews(context.getPackageName(), layout);
        localizeStaticText(context, view, layout);
        view.setOnClickPendingIntent(R.id.practice_widget_root, open(context, "/tu-tap"));
        if (size <= 0) {
            if (size == 0 && context.getResources().getConfiguration().fontScale > 1.4f) {
                // Keep the full progress text for accessibility while reserving height for the main phrase/action.
                view.setInt(R.id.practice_widget_summary, "setMaxLines", 1);
            }
            if ((size == 0 || size == -2) && context.getResources().getConfiguration().fontScale > 1.15f) {
                // Cap only the decorative phrase; progress and action labels still follow system font scaling.
                view.setTextViewTextSize(R.id.practice_widget_peace, android.util.TypedValue.COMPLEX_UNIT_DIP, size == -2 ? 16 : 20);
            }
            Bitmap lotus = artwork(context, 0);
            if (lotus != null) view.setImageViewBitmap(R.id.practice_widget_lotus, lotus);
            view.setTextViewText(R.id.practice_widget_summary, summary(context,data));
            view.setOnClickPendingIntent(R.id.practice_widget_start, open(context, "/tu-tap"));
        } else {
            view.setTextViewText(R.id.practice_widget_summary, summary(context,data));
            if (size == 2) {
                // Preserve four 48dp tool targets when the system font grows; footer is only a repeated opening hint.
                view.setViewVisibility(R.id.practice_widget_footer, context.getResources().getConfiguration().fontScale > 1.15f ? android.view.View.GONE : android.view.View.VISIBLE);
                view.removeAllViews(R.id.practice_widget_items);
                for (int i = 0; i < IDS.length; i++) view.addView(R.id.practice_widget_items,itemView(context,data,i,true));
            } else {
                if (context.getResources().getConfiguration().fontScale > 1.4f) view.setInt(R.id.practice_widget_summary, "setMaxLines", 1);
                view.removeAllViews(R.id.practice_widget_row_one); view.removeAllViews(R.id.practice_widget_row_two);
                for (int i = 0; i < IDS.length; i++) view.addView(i < 2 ? R.id.practice_widget_row_one : R.id.practice_widget_row_two,itemView(context,data,i,false));
            }
        }
        return view;
    }

    private static int sizeForBounds(int width, int height) {
        return width >= 250 && height >= 340 ? 2 : width >= 250 && height >= 150 ? 1 : height >= 180 ? (width >= 155 ? 0 : -2) : -1;
    }

    private static int[] legacySizesForBounds(int minWidth, int minHeight, int maxWidth, int maxHeight) {
        int landscape = sizeForBounds(Math.max(minWidth, maxWidth), minHeight);
        int portrait = sizeForBounds(minWidth, Math.max(minHeight, maxHeight));
        return new int[]{landscape, portrait};
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        JSONObject data = current(context);
        if (Build.VERSION.SDK_INT >= 31) {
            // Min-width/min-height có thể thuộc hai hướng màn hình khác nhau; để host chọn đúng cặp kích thước.
            Map<SizeF, RemoteViews> sizes = new LinkedHashMap<>();
            sizes.put(new SizeF(110, 110), render(context, data, -1));
            // Chừa đủ chỗ cho lời nhắc hai dòng và nút 48dp; khung ngắn dùng bản compact cùng hành động.
            sizes.put(new SizeF(110, 180), render(context, data, -2));
            sizes.put(new SizeF(155, 180), render(context, data, 0));
            sizes.put(new SizeF(250, 150), render(context, data, 1));
            sizes.put(new SizeF(250, 340), render(context, data, 2));
            manager.updateAppWidget(id, new RemoteViews(sizes));
            return;
        }
        Bundle options = manager.getAppWidgetOptions(id);
        int[] sizes = legacySizesForBounds(
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,0),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,0),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,0),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,0));
        // API cũ báo cặp dọc=minWidth/maxHeight và ngang=maxWidth/minHeight; không ghép hai giá trị min.
        manager.updateAppWidget(id, new RemoteViews(render(context,data,sizes[0]), render(context,data,sizes[1])));
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> type : new Class<?>[]{PracticeSmallWidgetProvider.class,PracticeMediumWidgetProvider.class,PracticeLargeWidgetProvider.class}) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context,type))) update(context,manager,id);
        }
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context,manager,id);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { update(context,manager,id); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context,intent);
        String action = intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCALE_CHANGED.equals(action) || Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) updateAll(context);
    }
}
