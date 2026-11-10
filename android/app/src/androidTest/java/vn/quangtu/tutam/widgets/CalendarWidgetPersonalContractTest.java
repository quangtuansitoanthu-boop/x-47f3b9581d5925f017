package vn.quangtu.tutam.widgets;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class CalendarWidgetPersonalContractTest {
    // Chỉ kiểm tra projection trong bộ nhớ; không ghi fixture vào snapshot đang dùng.
    private JSONObject timeline() throws Exception {
        return new JSONObject().put("generatedAt", "2026-11-02T00:00:00Z").put("days", new JSONArray().put(
            new JSONObject().put("date", "2026-11-02").put("solarDate", "Thứ Hai, 02/11/2026")
                .put("solarDateShort", "02/11/2026").put("lunarDay", "24")
                .put("lunarMonthYear", "Tháng 09 • Bính Ngọ").put("fastingNote", "Ngày Thập Trai")));
    }

    private JSONObject personal() throws Exception {
        JSONObject value = timeline().put("personalOwner", "user:alpha");
        value.getJSONArray("days").getJSONObject(0).put("personalEventCount", 5).put("personalEvents", new JSONArray()
            .put(new JSONObject().put("id", "event-1").put("title", "Giỗ gia đình").put("note", "Tưởng niệm ông bà").put("type", "gio-chap"))
            .put(new JSONObject().put("id", "event-2").put("title", "Ngày quy y").put("type", "quy-y")));
        return value;
    }

    private JSONObject call(String methodName, JSONObject value, String owner) throws Exception {
        Method method = BuddhistCalendarWidgetProvider.class.getDeclaredMethod(methodName, JSONObject.class, String.class);
        method.setAccessible(true);
        return (JSONObject) method.invoke(null, value, owner);
    }

    private void rejected(JSONObject value, String owner) throws Exception {
        try { call("validateTimeline", value, owner); fail("Invalid or stale private snapshot accepted"); }
        catch (InvocationTargetException error) { assertTrue(error.getCause() instanceof IllegalArgumentException); }
    }

    @Test public void acceptsLegacyPublicAndBoundedCurrentOwnerProjection() throws Exception {
        assertEquals("24", call("validateTimeline", timeline(), "").getJSONArray("days").getJSONObject(0).getString("lunarDay"));
        JSONObject value = call("validateTimeline", personal(), "user:alpha");
        assertEquals(5, value.getJSONArray("days").getJSONObject(0).getInt("personalEventCount"));
        assertEquals(2, value.getJSONArray("days").getJSONObject(0).getJSONArray("personalEvents").length());
    }

    @Test public void preservesSnapshotLocaleWhileMaskingPreviousOwnerAndAcceptsLegacyLocale() throws Exception {
        JSONObject legacy = call("validateTimeline", timeline(), "");
        assertFalse(legacy.has("locale"));
        JSONObject original = personal().put("locale", "en");
        JSONObject current = call("validateTimeline", original, "user:alpha");
        assertEquals("en", current.getString("locale"));
        JSONObject masked = call("maskPersonalTimeline", original, "user:beta");
        assertEquals("en", masked.getString("locale"));
        assertFalse(masked.has("personalOwner"));
        assertFalse(masked.getJSONArray("days").getJSONObject(0).has("personalEvents"));
        assertEquals("en", original.getString("locale"));
        assertTrue(original.getJSONArray("days").getJSONObject(0).has("personalEvents"));
    }

    @Test public void rejectsLatePreviousOwnerAndStripsUnscopedPrivateData() throws Exception {
        rejected(personal(), "user:beta");
        rejected(personal(), "");
        JSONObject missing = personal(); missing.remove("personalOwner");
        JSONObject clean = call("validateTimeline", missing, "user:alpha");
        assertFalse(clean.getJSONArray("days").getJSONObject(0).has("personalEvents"));
        assertFalse(clean.getJSONArray("days").getJSONObject(0).has("personalEventCount"));
    }

    @Test public void masksPrivateFieldsWithoutMutatingPublicOrOriginalData() throws Exception {
        JSONObject original = personal();
        for (String owner : new String[]{"", "guest", "user:beta"}) {
            JSONObject masked = call("maskPersonalTimeline", original, owner);
            JSONObject day = masked.getJSONArray("days").getJSONObject(0);
            assertFalse(day.has("personalEvents")); assertFalse(day.has("personalEventCount"));
            assertEquals("Ngày Thập Trai", day.getString("fastingNote"));
        }
        assertEquals(5, original.getJSONArray("days").getJSONObject(0).getInt("personalEventCount"));
        assertEquals(5, call("maskPersonalTimeline", original, "user:alpha").getJSONArray("days").getJSONObject(0).getInt("personalEventCount"));
    }

    @Test public void rejectsInvalidCountOversizedProjectionAndUnknownTypes() throws Exception {
        JSONObject value = personal(); value.getJSONArray("days").getJSONObject(0).put("personalEventCount", 1); rejected(value, "user:alpha");
        value = personal(); value.getJSONArray("days").getJSONObject(0).put("personalEventCount", 2.5); rejected(value, "user:alpha");
        value = personal(); value.getJSONArray("days").getJSONObject(0).getJSONArray("personalEvents").put(new JSONObject().put("id", "third").put("title", "Third").put("type", "khac")); rejected(value, "user:alpha");
        value = personal(); value.getJSONArray("days").getJSONObject(0).getJSONArray("personalEvents").getJSONObject(0).put("type", "unknown"); rejected(value, "user:alpha");
        value = personal(); value.getJSONArray("days").getJSONObject(0).getJSONArray("personalEvents").getJSONObject(0).put("note", new String(new char[161]).replace('\0', 'x')); rejected(value, "user:alpha");
        value = timeline().put("padding", new String(new char[2 * 1024 * 1024]).replace('\0', 'x')); rejected(value, "");
    }
}
