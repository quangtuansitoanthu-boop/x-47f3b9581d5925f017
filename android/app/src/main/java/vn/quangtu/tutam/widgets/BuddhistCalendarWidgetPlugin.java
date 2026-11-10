package vn.quangtu.tutam.widgets;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "BuddhistCalendarWidget")
public final class BuddhistCalendarWidgetPlugin extends Plugin {
    @PluginMethod public void setPersonalOwner(PluginCall call) {
        try {
            String owner = call.getString("owner");
            if (owner == null) { call.reject("Expected calendar owner"); return; }
            BuddhistCalendarWidgetProvider.setPersonalOwner(getContext(), owner);
            call.resolve();
        } catch (Exception error) { call.reject("Could not update calendar owner"); }
    }

    @PluginMethod public void replaceTimeline(PluginCall call) {
        try {
            JSArray days = call.getArray("days");
            if (days == null || days.length() == 0 || days.length() > 400) {
                call.reject("Expected 1–400 calendar days");
                return;
            }
            JSONObject timeline = new JSONObject().put("days", days)
                .put("generatedAt", call.getString("generatedAt", ""))
                .put("locale", "en".equals(call.getString("locale")) ? "en" : "vi");
            String owner = call.getString("personalOwner");
            if (owner != null) timeline.put("personalOwner", owner);
            BuddhistCalendarWidgetProvider.replaceTimeline(getContext(), timeline);
            call.resolve();
        } catch (Exception error) {
            // Không chuyển thông điệp parse có thể chứa dữ liệu cá nhân sang console WebView.
            call.reject("Could not update calendar widgets");
        }
    }
}
