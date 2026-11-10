package vn.quangtu.tutam.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AtomicFile;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import vn.quangtu.tutam.MainActivity;
import vn.quangtu.tutam.R;

/** Snapshot cục bộ; lịch cá nhân chỉ hiện khi marker principal còn khớp. */
public class BuddhistCalendarWidgetProvider extends AppWidgetProvider {
    private static final String TICK = "vn.quangtu.tutam.CALENDAR_WIDGET_TICK";
    private static final TimeZone ZONE = TimeZone.getTimeZone("Asia/Ho_Chi_Minh");
    public static final class Small extends BuddhistCalendarWidgetProvider {}
    public static final class Medium extends BuddhistCalendarWidgetProvider {}
    public static final class Large extends BuddhistCalendarWidgetProvider {}

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "buddhist-calendar-widget-v1.json"));
    }

    private static AtomicFile personalOwnerFile(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "buddhist-calendar-widget-owner-v1.json"));
    }

    private static boolean validPersonalOwner(String owner) {
        if (owner == null || owner.getBytes(StandardCharsets.UTF_8).length > 256) return false;
        for (int i = 0; i < owner.length(); i++) if (Character.isISOControl(owner.charAt(i))) return false;
        return owner.isEmpty() || owner.equals("guest") || owner.startsWith("user:") && owner.length() > 5;
    }

    private static String readPersonalOwner(Context context) {
        try {
            if (personalOwnerFile(context).getBaseFile().length() > 1024) return null;
            Object owner = new JSONObject(new String(personalOwnerFile(context).readFully(), StandardCharsets.UTF_8)).opt("owner");
            return owner instanceof String && validPersonalOwner((String) owner) ? (String) owner : null;
        } catch (Exception ignored) { return null; }
    }

    private static void write(AtomicFile target, byte[] bytes) throws Exception {
        FileOutputStream output = null;
        try {
            output = target.startWrite(); output.write(bytes); target.finishWrite(output);
        } catch (Exception error) {
            if (output != null) target.failWrite(output);
            throw error;
        }
    }

    public static synchronized void setPersonalOwner(Context context, String owner) throws Exception {
        if (!validPersonalOwner(owner)) throw new IllegalArgumentException("Invalid calendar owner");
        AtomicFile marker = personalOwnerFile(context);
        if (marker.getBaseFile().exists() && owner.equals(readPersonalOwner(context))) return;
        // Ghi marker trước: nếu dọn snapshot lỗi, lần đọc kế tiếp vẫn che dữ liệu principal cũ.
        write(marker, new JSONObject().put("owner", owner).toString().getBytes(StandardCharsets.UTF_8));
        try {
            if (file(context).getBaseFile().exists()) {
                JSONObject previous = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
                write(file(context), maskPersonalTimeline(previous, "").toString().getBytes(StandardCharsets.UTF_8));
            }
        } finally { updateAll(context); }
    }

    static JSONObject maskPersonalTimeline(JSONObject timeline, String owner) throws Exception {
        JSONObject clean = new JSONObject(timeline.toString());
        boolean authorized = owner != null && !owner.isEmpty() && validPersonalOwner(owner)
            && owner.equals(clean.optString("personalOwner", ""));
        if (!authorized) {
            clean.remove("personalOwner");
            JSONArray days = clean.optJSONArray("days");
            if (days != null) for (int i = 0; i < days.length(); i++) {
                JSONObject day = days.optJSONObject(i);
                if (day != null) { day.remove("personalEvents"); day.remove("personalEventCount"); }
            }
        }
        return clean;
    }

    static JSONObject validateTimeline(JSONObject timeline, String owner) throws Exception {
        if (timeline == null || timeline.toString().getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024) throw new IllegalArgumentException("Calendar payload too large");
        Object incomingOwner = timeline.opt("personalOwner");
        if (incomingOwner != null && incomingOwner != JSONObject.NULL && !(incomingOwner instanceof String)) throw new IllegalArgumentException("Invalid calendar owner");
        String requestedOwner = incomingOwner instanceof String ? (String) incomingOwner : "";
        if (!validPersonalOwner(requestedOwner)) throw new IllegalArgumentException("Invalid calendar owner");
        if (!requestedOwner.isEmpty() && !requestedOwner.equals(owner)) throw new IllegalArgumentException("Stale calendar owner");
        JSONObject clean = maskPersonalTimeline(timeline, owner);
        Object generatedAt = clean.opt("generatedAt");
        if (generatedAt != null && (!(generatedAt instanceof String) || ((String) generatedAt).length() > 160)) throw new IllegalArgumentException("Invalid calendar timestamp");
        JSONArray days = clean.optJSONArray("days");
        if (days == null || days.length() < 1 || days.length() > 400) throw new IllegalArgumentException("Expected 1–400 calendar days");
        SimpleDateFormat validator = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        validator.setLenient(false);
        validator.setTimeZone(ZONE);
        java.util.HashSet<String> dates = new java.util.HashSet<>();
        for (int i = 0; i < days.length(); i++) {
            JSONObject day = days.optJSONObject(i);
            if (day == null || !(day.opt("date") instanceof String)) throw new IllegalArgumentException("Invalid calendar day");
            String date = day.getString("date");
            if (!civilDate(validator, date) || !dates.add(date)) throw new IllegalArgumentException("Invalid or duplicate calendar date");
            for (String key : new String[]{"solarDate", "solarDateShort", "lunarDay", "lunarMonthYear"}) {
                if (!(day.get(key) instanceof String) || day.getString(key).trim().isEmpty() || day.getString(key).length() > 160) throw new IllegalArgumentException("Invalid " + key);
            }
            for (String key : new String[]{"fastingNote", "buddhistHoliday", "thoKhangNote"}) {
                if (day.has(key) && !day.isNull(key) && (!(day.get(key) instanceof String) || day.getString(key).length() > 1200)) throw new IllegalArgumentException("Invalid " + key);
            }
            boolean hasCount = day.has("personalEventCount"), hasEvents = day.has("personalEvents");
            if (hasCount || hasEvents) {
                Object rawCount = day.opt("personalEventCount");
                if (!(rawCount instanceof Number)) throw new IllegalArgumentException("Invalid personal count");
                double count = ((Number) rawCount).doubleValue();
                JSONArray events = hasEvents ? day.optJSONArray("personalEvents") : new JSONArray();
                if (Double.isNaN(count) || Double.isInfinite(count) || count < 0 || count > 10000 || count != Math.floor(count)
                    || events == null || events.length() > 2 || count < events.length()) throw new IllegalArgumentException("Invalid personal projection");
                java.util.HashSet<String> eventIds = new java.util.HashSet<>();
                for (int j = 0; j < events.length(); j++) {
                    JSONObject event = events.optJSONObject(j);
                    if (event == null) throw new IllegalArgumentException("Invalid personal event");
                    for (String key : new String[]{"id", "title", "type"}) {
                        Object value = event.opt(key);
                        if (!(value instanceof String) || ((String) value).trim().isEmpty() || ((String) value).length() > 160) throw new IllegalArgumentException("Invalid personal event field");
                    }
                    if (!eventIds.add(event.getString("id"))) throw new IllegalArgumentException("Duplicate personal event");
                    String type = event.getString("type");
                    if (!java.util.Arrays.asList("gio-chap", "quy-y", "phat-nguyen", "gia-dinh", "khac").contains(type)) throw new IllegalArgumentException("Invalid personal event type");
                    if (event.has("note") && (!(event.opt("note") instanceof String) || event.getString("note").length() > 160)) throw new IllegalArgumentException("Invalid personal event note");
                    JSONObject projected = new JSONObject().put("id", event.getString("id")).put("title", event.getString("title")).put("type", type);
                    if (event.has("note")) projected.put("note", event.getString("note"));
                    events.put(j, projected);
                }
            }
        }
        return clean;
    }

    public static synchronized void replaceTimeline(Context context, JSONObject timeline) throws Exception {
        JSONObject clean = validateTimeline(timeline, readPersonalOwner(context));
        write(file(context), clean.toString().getBytes(StandardCharsets.UTF_8));
        updateAll(context);
    }

    private static String today() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        formatter.setTimeZone(ZONE);
        return formatter.format(new java.util.Date());
    }

    private static boolean civilDate(SimpleDateFormat validator, String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        try { return value.equals(validator.format(validator.parse(value))); }
        catch (java.text.ParseException ignored) { return false; }
    }

    static int nextIndex(String key, String[] dates, boolean[] events) {
        if (dates == null || events == null || dates.length != events.length) return -1;
        SimpleDateFormat validator = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        validator.setLenient(false);
        validator.setTimeZone(ZONE);
        if (!civilDate(validator, key)) return -1;
        boolean current = false;
        int selected = -1;
        for (int i = 0; i < dates.length; i++) {
            if (!civilDate(validator, dates[i])) continue;
            if (key.equals(dates[i])) current = true;
            if (events[i] && dates[i].compareTo(key) > 0
                && (selected < 0 || dates[i].compareTo(dates[selected]) < 0)) selected = i;
        }
        return current ? selected : -1;
    }

    private static final class CalendarData {
        final String date;
        final String locale;
        final JSONObject day;
        final JSONObject upcoming;
        CalendarData(String date, JSONObject day, JSONObject upcoming) {
            this(date, day, upcoming, "vi");
        }
        CalendarData(String date, JSONObject day, JSONObject upcoming, String locale) {
            this.date = date; this.day = day; this.upcoming = upcoming;
            this.locale = "en".equals(locale) ? "en" : "vi";
        }
    }

    // Cùng một lần đọc có khóa cho hôm nay và sắp tới; không đọc lại snapshot theo từng cỡ widget.
    private static synchronized CalendarData readCalendar(Context context) {
        String key = today();
        try {
            if (file(context).getBaseFile().length() > 2 * 1024 * 1024) return new CalendarData(key, null, null);
            JSONObject timeline = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
            JSONArray days = maskPersonalTimeline(timeline, readPersonalOwner(context)).getJSONArray("days");
            if (days.length() < 1 || days.length() > 400) return new CalendarData(key, null, null);
            String[] dates = new String[days.length()];
            boolean[] events = new boolean[days.length()];
            JSONObject current = null;
            for (int i = 0; i < days.length(); i++) {
                JSONObject day = days.getJSONObject(i);
                dates[i] = day.optString("date");
                if (key.equals(dates[i])) current = day;
                events[i] = !note(day, "fastingNote").isEmpty() || !note(day, "buddhistHoliday").isEmpty() || !note(day, "thoKhangNote").isEmpty() || personalCount(day) > 0;
            }
            int next = nextIndex(key, dates, events);
            return new CalendarData(key, current, next < 0 ? null : days.getJSONObject(next), timeline.optString("locale", "vi"));
        } catch (Exception ignored) {
            // Thiếu/hết dữ liệu phải hiện lời mời mở app, không dùng ngày cũ làm hôm nay.
        }
        return new CalendarData(key, null, null);
    }

    private static String note(JSONObject day, String field) {
        return day == null || day.isNull(field) ? "" : day.optString(field, "").trim();
    }

    static int personalCount(JSONObject day) {
        Object value = day == null ? null : day.opt("personalEventCount");
        if (!(value instanceof Number)) return -1;
        double count = ((Number) value).doubleValue();
        return Double.isNaN(count) || Double.isInfinite(count) || count < 0 || count > 10000 || count != Math.floor(count) ? -1 : (int) count;
    }

    private static JSONArray personalEvents(JSONObject day) {
        JSONArray events = day == null ? null : day.optJSONArray("personalEvents");
        return events == null ? new JSONArray() : events;
    }

    private static final Map<Integer, Bitmap> ARTWORK = new java.util.HashMap<>();
    private static synchronized Bitmap artwork(Context context, int index) {
        if (ARTWORK.containsKey(index)) return ARTWORK.get(index);
        int[][] frames = {{322,354,311,245}, {637,609,280,271}, {652,880,283,307}};
        try (java.io.InputStream input = context.getAssets().open("public/images/icons/sac-moc-anh-kim-v1.webp")) {
            Bitmap atlas = BitmapFactory.decodeStream(input);
            if (atlas == null) return null;
            int[] frame = frames[index];
            Bitmap result = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888);
            float scale = Math.min(72f / frame[2], 72f / frame[3]);
            float width = frame[2] * scale, height = frame[3] * scale;
            new Canvas(result).drawBitmap(atlas, new Rect(Math.round(frame[0] * atlas.getWidth() / 1254f), Math.round(frame[1] * atlas.getHeight() / 1254f), Math.round((frame[0] + frame[2]) * atlas.getWidth() / 1254f), Math.round((frame[1] + frame[3]) * atlas.getHeight() / 1254f)),
                new RectF((72-width)/2, (72-height)/2, (72+width)/2, (72+height)/2), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            atlas.recycle();
            ARTWORK.put(index, result);
            return result;
        } catch (Exception ignored) { return null; }
    }

    private static String labels(Context context, JSONObject day) {
        java.util.ArrayList<String> labels = new java.util.ArrayList<>();
        if (!note(day, "buddhistHoliday").isEmpty()) labels.add(note(day, "buddhistHoliday"));
        if (!note(day, "fastingNote").isEmpty()) labels.add(context.getString(R.string.calendar_widget_fasting_short));
        if (!note(day, "thoKhangNote").isEmpty()) labels.add(context.getString(R.string.calendar_widget_tho_short));
        if (personalCount(day) > 0) labels.add(context.getString(R.string.calendar_widget_personal_count, personalCount(day)));
        return android.text.TextUtils.join(" · ", labels);
    }

    private static String allNotes(Context context, JSONObject day) {
        java.util.ArrayList<String> notes = new java.util.ArrayList<>();
        for (String field : new String[]{"buddhistHoliday", "fastingNote", "thoKhangNote"}) {
            if (!note(day, field).isEmpty()) notes.add(note(day, field));
        }
        if (personalCount(day) > 0) {
            notes.add(context.getString(R.string.calendar_widget_personal_count, personalCount(day)));
            JSONArray events = personalEvents(day);
            for (int i = 0; i < Math.min(2, events.length()); i++) {
                JSONObject event = events.optJSONObject(i);
                if (event != null) notes.add(event.optString("title") + ". " + event.optString("note", ""));
            }
        }
        return android.text.TextUtils.join(". ", notes);
    }

    private static PendingIntent open(Context context, String date) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("vn.quangtu.tutam:///?calendarDate=" + date + "#home-calendar"), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, date.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews layout(Context context, JSONObject day, JSONObject upcoming, String today, int resource) {
        RemoteViews view = new RemoteViews(context.getPackageName(), resource);
        PracticeWidgetProvider.localizeStaticText(context, view, resource);
        boolean ready = day != null;
        if (!ready) upcoming = null;
        boolean narrow = resource == R.layout.buddhist_calendar_narrow;
        boolean small = narrow || resource == R.layout.buddhist_calendar_small || resource == R.layout.buddhist_calendar_compact;
        boolean compactMedium = resource == R.layout.buddhist_calendar_medium_compact;
        boolean dots = small || compactMedium;
        boolean large = resource == R.layout.buddhist_calendar_large;
        String monthYear = ready ? day.optString("lunarMonthYear") : "";
        String[] parts = monthYear.split("[•·]", 2);
        String month = parts[0].trim() + (ready ? context.getString(R.string.calendar_widget_lunar_suffix) : "");
        String year = parts.length > 1 ? parts[1].trim() : "";
        Bitmap lotus = artwork(context, 0);
        if (lotus != null) view.setImageViewBitmap(R.id.widget_title_icon, lotus);
        view.setTextViewText(R.id.widget_solar, ready ? day.optString("solarDate") : context.getString(R.string.calendar_widget_open_to_update));
        view.setTextViewText(R.id.widget_lunar_day, ready ? day.optString("lunarDay") : "—");
        view.setTextViewText(R.id.widget_lunar_month, month);
        view.setTextViewText(R.id.widget_lunar_year, year);
        String fasting = note(day, "fastingNote"), holiday = note(day, "buddhistHoliday"), tho = note(day, "thoKhangNote");
        int personal = personalCount(day);
        JSONArray events = personalEvents(day);
        int publicCount = (holiday.isEmpty() ? 0 : 1) + (fasting.isEmpty() ? 0 : 1) + (tho.isEmpty() ? 0 : 1);
        int total = publicCount + Math.max(0, personal);
        boolean busy = publicCount + Math.min(2, Math.max(0, personal)) >= 3;
        boolean largeText = context.getResources().getConfiguration().fontScale > 1.15f;
        // Số ngày vốn đã lớn; giới hạn theo dp khi chữ hệ thống lớn để chừa chỗ cho nhãn dùng sp.
        int daySize = narrow ? (largeText ? 54 : 64) : small ? resource == R.layout.buddhist_calendar_compact ? (largeText ? 40 : 48) : (largeText ? 72 : 80)
            : compactMedium ? 28 : large ? 60 : (largeText ? 56 : 70);
        view.setTextViewTextSize(R.id.widget_lunar_day, TypedValue.COMPLEX_UNIT_DIP, daySize);
        boolean showDetails = large ? !busy || !largeText : publicCount + (personal > 0 ? 1 : 0) < 3;
        int[] ids = {R.id.widget_holiday, R.id.widget_fasting, R.id.widget_tho};
        String[] details = {holiday, fasting, tho};
        String[] summaries = {dots ? context.getString(R.string.calendar_widget_holiday) : holiday,
            context.getString(R.string.calendar_widget_fasting), context.getString(R.string.calendar_widget_tho_badge)};
        if (large) summaries = new String[]{context.getString(R.string.calendar_widget_holiday), context.getString(R.string.calendar_widget_fasting_short), context.getString(R.string.calendar_widget_tho_title)};
        for (int i = 0; i < ids.length; i++) {
            boolean visible = !details[i].isEmpty();
            if (!small) {
                view.setViewVisibility(ids[i], visible ? View.VISIBLE : View.GONE);
                view.setTextViewText(ids[i], summaries[i]);
                view.setContentDescription(ids[i], details[i] + ". " + context.getString(R.string.calendar_widget_open_today));
            }
            if (dots) {
                int[] indicators = {R.id.widget_holiday_indicator, R.id.widget_fasting_indicator, R.id.widget_tho_indicator};
                int[] circles = {R.id.widget_dot_holiday, R.id.widget_dot_fasting, R.id.widget_dot_tho};
                view.setViewVisibility(indicators[i], visible ? View.VISIBLE : View.GONE);
                view.setContentDescription(circles[i], details[i]);
            } else {
                int[] cards = {R.id.widget_holiday_card, R.id.widget_fasting_card, R.id.widget_tho_card};
                int[] icons = {R.id.widget_holiday_icon, R.id.widget_fasting_icon, R.id.widget_tho_icon};
                int[] descriptions = {R.id.widget_holiday_detail, R.id.widget_fasting_detail, R.id.widget_tho_detail};
                view.setViewVisibility(cards[i], visible ? View.VISIBLE : View.GONE);
                int[] circles = {R.drawable.calendar_dot_holiday, R.drawable.calendar_dot_fasting, R.drawable.calendar_dot_tho};
                view.setImageViewResource(icons[i], circles[i]);
                String detail = details[i];
                if (i == 1) {
                    String prefix = context.getString(R.string.calendar_widget_fasting_short) + " (";
                    if (detail.startsWith(prefix) && detail.endsWith(")")) detail = detail.substring(prefix.length(), detail.length() - 1);
                }
                view.setTextViewText(descriptions[i], detail);
                view.setViewVisibility(descriptions[i], showDetails ? View.VISIBLE : View.GONE);
            }
        }
        String first = events.length() > 0 && events.optJSONObject(0) != null ? events.optJSONObject(0).optString("title", "") : "";
        String firstSummary = first.isEmpty() && personal > 0 ? context.getString(R.string.calendar_widget_personal_count, personal) : first;
        String more = personal > 1 && !first.isEmpty() ? context.getString(R.string.calendar_widget_personal_more_short, personal - 1) : "";
        if (dots) {
            view.setViewVisibility(R.id.widget_personal_indicator, personal > 0 ? View.VISIBLE : View.GONE);
            view.setViewVisibility(R.id.widget_dot_personal, personal > 0 ? View.VISIBLE : View.GONE);
            view.setContentDescription(R.id.widget_dot_personal, personal > 0 ? context.getString(R.string.calendar_widget_personal_count, personal) + ". " + allNotes(context, day) : "");
            if (small) {
                view.setViewVisibility(R.id.widget_small_dots, publicCount > 0 || personal > 0 ? View.VISIBLE : View.GONE);
            } else {
                view.setTextViewText(R.id.widget_personal, personal > 0 ? context.getString(R.string.calendar_widget_personal_count, personal) : "");
                view.setViewVisibility(R.id.widget_dot_row_one, !fasting.isEmpty() || !tho.isEmpty() ? View.VISIBLE : View.GONE);
                view.setViewVisibility(R.id.widget_dot_row_two, !holiday.isEmpty() || personal > 0 ? View.VISIBLE : View.GONE);
                view.setViewVisibility(R.id.widget_personal_first_row, personal > 0 ? View.VISIBLE : View.GONE);
                view.setTextViewText(R.id.widget_personal_first, firstSummary);
                view.setTextViewText(R.id.widget_personal_first_more, more);
                view.setContentDescription(R.id.widget_personal_first_row, allNotes(context, day));
            }
        } else {
            view.setViewVisibility(R.id.widget_personal_card, personal > 0 ? View.VISIBLE : View.GONE);
            view.setTextViewText(R.id.widget_personal, personal > 0 ? context.getString(R.string.calendar_widget_personal_count, personal) : "");
            if (!large) {
                view.setTextViewText(R.id.widget_personal_summary, firstSummary);
                view.setTextViewText(R.id.widget_personal_summary_more, more);
                view.setContentDescription(R.id.widget_personal_card, allNotes(context, day));
            } else {
                int[] rows = {R.id.widget_personal_one, R.id.widget_personal_two};
                int[] titles = {R.id.widget_personal_one_title, R.id.widget_personal_two_title};
                int[] notes = {R.id.widget_personal_one_note, R.id.widget_personal_two_note};
                for (int i = 0; i < rows.length; i++) {
                    JSONObject event = i < events.length() ? events.optJSONObject(i) : null;
                    boolean visible = personal > 0 && event != null;
                    view.setViewVisibility(rows[i], visible ? View.VISIBLE : View.GONE);
                    if (visible) {
                        view.setTextViewText(titles[i], event.optString("title"));
                        view.setTextViewText(notes[i], event.optString("note", ""));
                        view.setViewVisibility(notes[i], !event.optString("note", "").isEmpty() && (!busy || !largeText) ? View.VISIBLE : View.GONE);
                        view.setContentDescription(rows[i], event.optString("title") + ". " + event.optString("note", "") + ". " + context.getString(R.string.calendar_widget_open_today));
                        view.setOnClickPendingIntent(rows[i], open(context, today));
                    }
                }
                int extra = Math.max(0, personal - Math.min(2, events.length()));
                view.setViewVisibility(R.id.widget_personal_overflow, extra > 0 ? View.VISIBLE : View.GONE);
                view.setTextViewText(R.id.widget_personal_overflow, context.getString(R.string.calendar_widget_personal_more, extra));
            }
        }
        boolean empty = publicCount == 0 && personal <= 0;
        view.setViewVisibility(R.id.widget_empty, ready && empty && !small ? View.VISIBLE : View.GONE);
        view.setContentDescription(R.id.widget_root, (ready ? day.optString("solarDate") + ". " + day.optString("lunarDay") + " " + month + ". " + year + ". " + allNotes(context, day) : context.getString(R.string.calendar_widget_open_to_update)) + ". " + context.getString(R.string.calendar_widget_open_today));
        PendingIntent current = open(context, today);
        view.setOnClickPendingIntent(R.id.widget_root, current);
        if (!dots) {
            view.setTextViewText(R.id.widget_open_today, personal >= 0 && total > 0 ? context.getString(R.string.calendar_widget_open_count, total) : context.getString(R.string.calendar_widget_open_today));
            view.setOnClickPendingIntent(R.id.widget_open_today, current);
        }
        if (large) {
            boolean showUpcoming = upcoming != null && !busy;
            view.setViewVisibility(R.id.widget_upcoming_heading, busy || !ready ? View.GONE : View.VISIBLE);
            view.setViewVisibility(R.id.widget_upcoming, showUpcoming ? View.VISIBLE : View.GONE);
            view.setViewVisibility(R.id.widget_upcoming_empty, !showUpcoming && !busy ? View.VISIBLE : View.GONE);
            view.setTextViewText(R.id.widget_upcoming_empty, context.getString(ready ? R.string.calendar_widget_no_upcoming : R.string.calendar_widget_open_to_update));
            if (showUpcoming) {
                String date = upcoming.optString("date");
                String[] nextParts = upcoming.optString("lunarMonthYear").split("[•·]", 2);
                String lunar = upcoming.optString("lunarDay") + " · " + nextParts[0].trim() + context.getString(R.string.calendar_widget_lunar_suffix);
                String shortDate = upcoming.optString("solarDateShort");
                view.setTextViewText(R.id.widget_upcoming_date, shortDate.length() >= 5 ? shortDate.substring(0, 5) : shortDate);
                view.setTextViewText(R.id.widget_upcoming_title, labels(context, upcoming));
                view.setTextViewText(R.id.widget_upcoming_lunar, lunar);
                int circle = !note(upcoming, "buddhistHoliday").isEmpty() ? R.drawable.calendar_dot_holiday
                    : !note(upcoming, "fastingNote").isEmpty() ? R.drawable.calendar_dot_fasting : R.drawable.calendar_dot_tho;
                boolean personalOnly = note(upcoming, "buddhistHoliday").isEmpty() && note(upcoming, "fastingNote").isEmpty()
                    && note(upcoming, "thoKhangNote").isEmpty() && personalCount(upcoming) > 0;
                view.setViewVisibility(R.id.widget_upcoming_personal_icon, personalOnly ? View.VISIBLE : View.GONE);
                view.setViewVisibility(R.id.widget_upcoming_icon, personalOnly ? View.GONE : View.VISIBLE);
                if (!personalOnly) {
                    view.setImageViewResource(R.id.widget_upcoming_icon, circle);
                }
                view.setContentDescription(R.id.widget_upcoming, upcoming.optString("solarDate") + ". " + lunar + ". " + allNotes(context, upcoming));
                view.setOnClickPendingIntent(R.id.widget_upcoming, open(context, date));
            }
        }
        return view;
    }
    private static int sizeForBounds(int width, int height) {
        // Launcher grids can be narrow and tall: reserve compact for genuinely short hosts.
        return width >= 230 ? (height >= 340 ? 2 : height >= 200 ? 1 : -2) : height >= 180 && width >= 110 ? (width >= 155 ? 0 : -3) : -1;
    }

    private static int[] legacySizesForBounds(int minWidth, int minHeight, int maxWidth, int maxHeight) {
        return new int[]{sizeForBounds(Math.max(minWidth, maxWidth), minHeight), sizeForBounds(minWidth, Math.max(minHeight, maxHeight))};
    }

    private static int resourceForSize(int size) {
        return size == -3 ? R.layout.buddhist_calendar_narrow : size == 2 ? R.layout.buddhist_calendar_large : size == 1 ? R.layout.buddhist_calendar_medium
            : size == 0 ? R.layout.buddhist_calendar_small : size == -2 ? R.layout.buddhist_calendar_medium_compact : R.layout.buddhist_calendar_compact;
    }

    private static RemoteViews render(Context context, CalendarData data, int size) {
        return layout(PracticeWidgetProvider.localizedContext(context, data.locale), data.day, data.upcoming, data.date, resourceForSize(size));
    }

    private static void update(Context context, AppWidgetManager manager, int id, Class<?> owner, CalendarData data) {
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> sizes = new LinkedHashMap<>();
            sizes.put(new SizeF(110, 110), render(context, data, -1));
            sizes.put(new SizeF(110, 180), render(context, data, -3));
            sizes.put(new SizeF(155, 180), render(context, data, 0));
            sizes.put(new SizeF(250, 110), render(context, data, -2));
            sizes.put(new SizeF(250, 200), render(context, data, 1));
            sizes.put(new SizeF(250, 340), render(context, data, 2));
            manager.updateAppWidget(id, new RemoteViews(sizes));
        } else {
            Bundle options = manager.getAppWidgetOptions(id);
            int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, owner == Small.class ? 110 : 250);
            int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, owner == Large.class ? 300 : 110);
            int[] sizes = legacySizesForBounds(minWidth, minHeight,
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidth),
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeight));
            manager.updateAppWidget(id, new RemoteViews(render(context, data, sizes[0]), render(context, data, sizes[1])));
        }
    }
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean active = false;
        CalendarData data = readCalendar(context);
        for (Class<?> owner : new Class<?>[]{Small.class, Medium.class, Large.class}) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, owner))) {
                active = true;
                update(context, manager, id, owner, data);
            }
        }
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent tick = PendingIntent.getBroadcast(context, 1510301,
            new Intent(context, BuddhistCalendarWidgetProvider.class).setAction(TICK), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (!active) { alarms.cancel(tick); return; }
        Calendar next = Calendar.getInstance(ZONE);
        next.add(Calendar.DATE, 1);
        next.set(Calendar.HOUR_OF_DAY, 0); next.set(Calendar.MINUTE, 0); next.set(Calendar.SECOND, 1); next.set(Calendar.MILLISECOND, 0);
        // Không xin exact-alarm cho widget; launcher có thể cập nhật trễ khi hệ thống tiết kiệm pin.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, next.getTimeInMillis(), tick);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { update(context, manager, id, getClass(), readCalendar(context)); }
    @Override public void onDeleted(Context context, int[] ids) { updateAll(context); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (TICK.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) || Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) updateAll(context);
    }
}
