package vn.quangtu.tutam.widgets;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.res.Configuration;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import vn.quangtu.tutam.R;

@RunWith(AndroidJUnit4.class)
public class CalendarWidgetRenderingTest {
    // Fixture chỉ áp dụng lên View trong test, không ghi snapshot hay thay lịch đang dùng.
    private JSONObject day(String date) throws Exception {
        return new JSONObject().put("date", date).put("solarDate", "Thứ Hai, 02/11/2026")
            .put("solarDateShort", "02/11/2026").put("lunarDay", "24")
            .put("lunarMonthYear", "Tháng 09 • Bính Ngọ");
    }

    private View render(int resource, JSONObject day, JSONObject upcoming, boolean dark) throws Exception {
        return render(resource, day, upcoming, dark, 1f);
    }

    private View render(int resource, JSONObject day, JSONObject upcoming, boolean dark, float fontScale) throws Exception {
        return render(resource, day, upcoming, dark, fontScale,
            resource == R.layout.buddhist_calendar_small ? 179 : 373,
            resource == R.layout.buddhist_calendar_large ? 414 : 202);
    }

    private View render(int resource, JSONObject day, JSONObject upcoming, boolean dark, float fontScale,
        int widthDp, int heightDp) throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Configuration configuration = new Configuration(target.getResources().getConfiguration());
        configuration.fontScale = fontScale;
        configuration.uiMode = (configuration.uiMode & ~Configuration.UI_MODE_NIGHT_MASK)
            | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        Context context = target.createConfigurationContext(configuration);
        Method method = BuddhistCalendarWidgetProvider.class.getDeclaredMethod("layout", Context.class,
            JSONObject.class, JSONObject.class, String.class, int.class);
        method.setAccessible(true);
        RemoteViews remote = (RemoteViews) method.invoke(null, context, day, upcoming, "2026-11-02", resource);
        final View[] result = new View[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View view = remote.apply(context, new FrameLayout(context));
            float density = context.getResources().getDisplayMetrics().density;
            int width = Math.round(widthDp * density);
            int height = Math.round(heightDp * density);
            view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            view.layout(0, 0, width, height);
            result[0] = view;
        });
        return result[0];
    }

    private void assertVisible(View view, int id) {
        View target = view.findViewById(id);
        assertNotNull(target);
        assertEquals(View.VISIBLE, target.getVisibility());
        assertTrue("Notice has no measured height", target.getHeight() > 0);
        int top = target.getTop();
        android.view.ViewParent parent = target.getParent();
        while (parent instanceof View && parent != view) {
            top += ((View) parent).getTop();
            parent = parent.getParent();
        }
        assertTrue("Notice extends below the widget", top + target.getHeight() <= view.getHeight());
    }

    @Test public void retainsEveryNoticeCategoryInAllFamiliesAndThemes() throws Exception {
        JSONObject today = day("2026-11-02").put("fastingNote", "Ngày Thập Trai (Ăn chay, làm lành)")
            .put("buddhistHoliday", "Ngày vía kiểm thử")
            .put("thoKhangNote", "Chỉ dẫn Thọ Khang kiểm thử đầy đủ, không được mất khi cùng có ngày vía.");
        for (boolean dark : new boolean[]{false, true}) {
          for (float fontScale : new float[]{1f, 1.3f}) {
            for (int family : new int[]{R.layout.buddhist_calendar_small, R.layout.buddhist_calendar_medium, R.layout.buddhist_calendar_large}) {
                View view = render(family, today, null, dark, fontScale);
                if (family == R.layout.buddhist_calendar_small) {
                    assertVisible(view, view.getContext().getResources().getIdentifier("widget_dot_fasting", "id", view.getContext().getPackageName()));
                    assertVisible(view, view.getContext().getResources().getIdentifier("widget_dot_holiday", "id", view.getContext().getPackageName()));
                    assertVisible(view, view.getContext().getResources().getIdentifier("widget_dot_tho", "id", view.getContext().getPackageName()));
                    assertTrue(view.getContentDescription().toString().contains("Chỉ dẫn Thọ Khang kiểm thử đầy đủ"));
                } else {
                    assertVisible(view, R.id.widget_fasting);
                    assertVisible(view, R.id.widget_holiday);
                    assertVisible(view, R.id.widget_tho);
                }
            }
          }
        }
    }

    @Test public void upcomingRowHasItsOwnActionAndUsesTheSelectedFutureDate() throws Exception {
        JSONObject future = day("2026-11-06").put("solarDateShort", "06/11/2026")
            .put("lunarDay", "28").put("fastingNote", "Ngày Thập Trai (Ăn chay, làm lành)");
        for (float fontScale : new float[]{1f, 1.3f}) {
            View view = render(R.layout.buddhist_calendar_large, day("2026-11-02"), future, false, fontScale);
            assertVisible(view, R.id.widget_upcoming);
            assertTrue(view.findViewById(R.id.widget_upcoming).hasOnClickListeners());
            TextView date = view.findViewById(R.id.widget_upcoming_date);
            assertTrue(date.getText().toString().contains("06/11"));
            assertEquals(1, date.getLayout().getLineCount());
            assertEquals(0, date.getLayout().getEllipsisCount(0));
            assertTrue(view.findViewById(R.id.widget_open_today).hasOnClickListeners());
        }
    }

    @Test public void ordinaryDayDoesNotInventNotices() throws Exception {
        View view = render(R.layout.buddhist_calendar_large, day("2026-11-02"), null, true);
        assertEquals(View.GONE, view.findViewById(R.id.widget_fasting).getVisibility());
        assertEquals(View.GONE, view.findViewById(R.id.widget_holiday).getVisibility());
        assertEquals(View.GONE, view.findViewById(R.id.widget_tho).getVisibility());
        assertVisible(view, R.id.widget_empty);
    }

    @Test public void missingTodayKeepsTheUpdateActionWithoutShowingAnotherDaysEvent() throws Exception {
        View view = render(R.layout.buddhist_calendar_large, null, null, false);
        assertTrue(((TextView) view.findViewById(R.id.widget_solar)).getText().toString().contains("cập nhật"));
        assertEquals(View.GONE, view.findViewById(R.id.widget_upcoming).getVisibility());
        assertTrue(view.findViewById(R.id.widget_open_today).hasOnClickListeners());
    }

    private View named(View root, String name) {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        int id = context.getResources().getIdentifier(name, "id", context.getPackageName());
        assertTrue("Missing personal calendar view " + name, id != 0);
        View result = root.findViewById(id);
        assertNotNull("Missing family view " + name, result);
        return result;
    }

    @Test public void personalCountsKeepEveryCategoryAndPrioritizeTodayBeforeUpcoming() throws Exception {
        JSONObject today = day("2026-11-02").put("fastingNote", "Ngày Thập Trai (Ăn chay, làm lành)")
            .put("buddhistHoliday", "Ngày vía kiểm thử").put("thoKhangNote", "Kiêng hành dâm")
            .put("personalEventCount", 5).put("personalEvents", new org.json.JSONArray()
                .put(new JSONObject().put("id", "one").put("title", "Giỗ gia đình").put("note", "Tưởng niệm ông bà").put("type", "gio-chap"))
                .put(new JSONObject().put("id", "two").put("title", "Ngày quy y").put("type", "quy-y")));
        for (boolean dark : new boolean[]{false, true}) {
            View small = render(R.layout.buddhist_calendar_small, today, null, dark);
            assertEquals(View.VISIBLE, named(small, "widget_dot_personal").getVisibility());
            assertTrue(small.getContentDescription().toString().contains("Cá nhân · 5"));
            assertTrue(small.getContentDescription().toString().contains("Giỗ gia đình"));
            View medium = render(R.layout.buddhist_calendar_medium, today, null, dark);
            assertTrue(((TextView) medium.findViewById(R.id.widget_open_today)).getText().toString().contains("8"));
            assertTrue(((TextView) named(medium, "widget_personal_summary_more")).getText().toString().contains("+4"));
            View large = render(R.layout.buddhist_calendar_large, today, day("2026-11-06"), dark);
            assertEquals("Giỗ gia đình", ((TextView) named(large, "widget_personal_one_title")).getText().toString());
            assertEquals("Ngày quy y", ((TextView) named(large, "widget_personal_two_title")).getText().toString());
            assertTrue(((TextView) named(large, "widget_personal_overflow")).getText().toString().contains("3"));
            assertEquals(View.GONE, large.findViewById(R.id.widget_upcoming).getVisibility());
            assertTrue(((TextView) large.findViewById(R.id.widget_open_today)).getText().toString().contains("8"));
        }
    }

    private String visibleText(View root) {
        if (root.getVisibility() != View.VISIBLE) return "";
        String text = root instanceof TextView ? ((TextView) root).getText().toString() : "";
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) text += " " + visibleText(group.getChildAt(i));
        }
        return text;
    }

    private int topInRoot(View item, View root) {
        int top = item.getTop();
        android.view.ViewParent parent = item.getParent();
        while (parent instanceof View && parent != root) {
            top += ((View) parent).getTop();
            parent = parent.getParent();
        }
        return top;
    }

    @Test public void smallShowsOnlyLargeDateAndOneHorizontalRowOfActiveDots() throws Exception {
        JSONObject today = day("2026-11-02").put("fastingNote", "Ngày Thập Trai")
            .put("buddhistHoliday", "Ngày vía kiểm thử").put("thoKhangNote", "Thọ Khang đầy đủ")
            .put("personalEventCount", 2).put("personalEvents", new org.json.JSONArray()
                .put(new JSONObject().put("id", "one").put("title", "Tên cá nhân riêng tư").put("type", "gio-chap")));
        for (boolean dark : new boolean[]{false, true}) {
            View view = render(R.layout.buddhist_calendar_small, today, null, dark);
            String shown = visibleText(view);
            for (String hidden : new String[]{"Thập Trai", "Thọ Khang", "Ngày vía", "Cá nhân", "Tên cá nhân riêng tư"}) {
                assertFalse("Small must not show event labels/count/name", shown.contains(hidden));
            }
            float sp = ((TextView) view.findViewById(R.id.widget_lunar_day)).getTextSize() / view.getResources().getDisplayMetrics().scaledDensity;
            assertTrue("Small date must use the approved giant type", sp >= 79f);
            int top = topInRoot(named(view, "widget_dot_fasting"), view);
            for (String name : new String[]{"widget_dot_fasting", "widget_dot_tho", "widget_dot_holiday", "widget_dot_personal"}) {
                View dot = named(view, name);
                assertVisible(view, dot.getId());
                assertEquals("All dots belong to one horizontal row", top, topInRoot(dot, view));
            }
            assertTrue(view.getContentDescription().toString().contains("Tên cá nhân riêng tư"));
        }
    }

    @Test public void mediumAndLargeUseGiantDatesAndCirclesInsteadOfCategoryArtwork() throws Exception {
        JSONObject today = day("2026-11-02").put("fastingNote", "Ngày Thập Trai");
        for (int family : new int[]{R.layout.buddhist_calendar_medium, R.layout.buddhist_calendar_large}) {
            View view = render(family, today, null, false);
            float sp = ((TextView) view.findViewById(R.id.widget_lunar_day)).getTextSize() / view.getResources().getDisplayMetrics().scaledDensity;
            assertTrue("Approved larger day type", sp >= (family == R.layout.buddhist_calendar_medium ? 69f : 59f));
            android.widget.ImageView icon = view.findViewById(R.id.widget_fasting_icon);
            assertTrue("Use the category circle, not artwork", icon.getDrawable() instanceof android.graphics.drawable.GradientDrawable);
        }
    }

    @Test public void quietCompactKeepsAllActiveDotsInsideMinimum110DpHost() throws Exception {
        JSONObject today = day("2026-11-02").put("fastingNote", "Ngày Thập Trai")
            .put("buddhistHoliday", "Ngày vía kiểm thử").put("thoKhangNote", "Thọ Khang đầy đủ")
            .put("personalEventCount", 2).put("personalEvents", new org.json.JSONArray()
                .put(new JSONObject().put("id", "one").put("title", "Tên cá nhân riêng tư").put("type", "gio-chap")));
        for (boolean dark : new boolean[]{false, true}) {
          for (float fontScale : new float[]{1f, 1.3f}) {
            View view = render(R.layout.buddhist_calendar_compact, today, null, dark, fontScale, 110, 110);
            assertEquals("24", ((TextView) view.findViewById(R.id.widget_lunar_day)).getText().toString());
            int rowTop = topInRoot(named(view, "widget_dot_fasting"), view);
            for (String name : new String[]{"widget_dot_fasting", "widget_dot_tho", "widget_dot_holiday", "widget_dot_personal"}) {
                View dot = named(view, name);
                assertVisible(view, dot.getId());
                assertTrue("Dot must stay below the top edge", topInRoot(dot, view) >= 0);
                assertEquals("Compact dots must remain on one horizontal line", rowTop, topInRoot(dot, view));
                int left = dot.getLeft();
                android.view.ViewParent parent = dot.getParent();
                while (parent instanceof View && parent != view) {
                    left += ((View) parent).getLeft(); parent = parent.getParent();
                }
                assertTrue("Dot must fit horizontally", left >= 0 && left + dot.getWidth() <= view.getWidth());
            }
            assertFalse(visibleText(view).contains("Tên cá nhân riêng tư"));
            assertFalse(visibleText(view).contains("Cá nhân"));
            assertTrue(view.getContentDescription().toString().contains("02/11/2026"));
            assertTrue(view.getContentDescription().toString().contains("Tên cá nhân riêng tư"));
            assertTrue("Compact keeps the dated open action", view.hasOnClickListeners());
          }
        }
    }

    @Test public void narrowTallKeepsAlmanacAndLargeDayWithoutClippedTitle() throws Exception {
        JSONObject today = day("2026-11-03").put("solarDate", "Thứ Ba, 03/11/2026").put("lunarDay", "25")
            .put("thoKhangNote", "Thọ Khang").put("personalEventCount", 1);
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        int resource = target.getResources().getIdentifier("buddhist_calendar_narrow", "layout", target.getPackageName());
        assertTrue("Narrow/tall host needs its own responsive layout", resource != 0);
        for (boolean dark : new boolean[]{false, true}) {
          for (float fontScale : new float[]{1f, 1.3f}) {
            for (int height : new int[]{180, 280}) {
                View view = render(resource, today, null, dark, fontScale, 110, height);
                for (int id : new int[]{R.id.widget_solar, R.id.widget_lunar_month, R.id.widget_lunar_year,
                        R.id.widget_lunar_day, R.id.widget_dot_tho, R.id.widget_dot_personal}) assertVisible(view, id);
                for (int id : new int[]{R.id.widget_solar, R.id.widget_lunar_month, R.id.widget_lunar_year}) {
                    TextView text = view.findViewById(id);
                    for (int line = 0; line < text.getLayout().getLineCount(); line++)
                        assertEquals("Almanac must not be ellipsized", 0, text.getLayout().getEllipsisCount(line));
                }
                TextView title = findTitle(view);
                assertNotNull(title);
                for (int line = 0; line < title.getLayout().getLineCount(); line++)
                    assertEquals("Full title must fit a narrow host", 0, title.getLayout().getEllipsisCount(line));
                assertTrue("Keep the giant day", ((TextView)view.findViewById(R.id.widget_lunar_day)).getTextSize()
                    / view.getResources().getDisplayMetrics().density >= 54f);
                assertTrue("Keep dated navigation", view.hasOnClickListeners());
                if (fontScale == 1f && "true".equals(InstrumentationRegistry.getArguments().getString("exportNarrowPreviews"))) {
                    android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(view.getWidth(), view.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
                    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view.draw(new android.graphics.Canvas(bitmap)));
                    java.io.File file = new java.io.File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),
                        "calendar-narrow-" + height + "-" + (dark ? "dark" : "light") + ".png");
                    try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output);
                    }
                }
            }
          }
        }
    }

    private TextView findTitle(View view) {
        if (view instanceof TextView && ((TextView)view).getText().toString().equals(view.getContext().getString(R.string.calendar_widget_title_plain))) return (TextView)view;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup)view;
            for (int child = 0; child < group.getChildCount(); child++) {
                TextView found = findTitle(group.getChildAt(child));
                if (found != null) return found;
            }
        }
        return null;
    }
}
