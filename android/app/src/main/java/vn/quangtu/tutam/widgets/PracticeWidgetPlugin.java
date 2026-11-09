package vn.quangtu.tutam.widgets;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "PracticeWidget")
public final class PracticeWidgetPlugin extends Plugin {
    @PluginMethod public void replaceSnapshot(PluginCall call) {
        try {
            JSONObject snapshot = new JSONObject(call.getData().toString());
            PracticeWidgetProvider.replaceSnapshot(getContext(), snapshot);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not update practice widgets; previous snapshot retained", error);
        }
    }
}
