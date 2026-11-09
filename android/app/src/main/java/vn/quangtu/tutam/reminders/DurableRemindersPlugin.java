package vn.quangtu.tutam.reminders;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="DurableReminders")
public final class DurableRemindersPlugin extends Plugin {
    @PluginMethod public void testNotification(PluginCall call) {
        try {
            String title=call.getString("title"), body=call.getString("body");
            Boolean sound=call.getBoolean("sound"), vibrate=call.getBoolean("vibrate");
            if(title==null || body==null || sound==null || vibrate==null) throw new IllegalArgumentException("Missing test notification settings");
            call.resolve(new JSObject().put("shown",ReminderScheduler.testNotification(getContext(),title,body,sound,vibrate)));
        } catch(Exception error) { call.reject("Could not show test reminder",error); }
    }
    @PluginMethod public void replacePlan(PluginCall call) {
        try { JSObject plan=call.getObject("plan"); if(plan==null) throw new IllegalArgumentException("Missing plan");
            ReminderScheduler.replace(getContext(),plan); call.resolve(JSObject.fromJSONObject(ReminderScheduler.status(getContext())));
        } catch(Exception error) { call.reject("Could not persist reminder plan; previous saved events retained",error); }
    }
    @PluginMethod public void clearPersonal(PluginCall call) {
        try { ReminderScheduler.clearPersonal(getContext()); call.resolve(); } catch(Exception error) { call.reject("Could not clear personal reminder plan",error); }
    }
    @PluginMethod public void getStatus(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(ReminderScheduler.status(getContext()))); } catch(Exception error) { call.reject("Could not read reminder plan",error); }
    }
}
