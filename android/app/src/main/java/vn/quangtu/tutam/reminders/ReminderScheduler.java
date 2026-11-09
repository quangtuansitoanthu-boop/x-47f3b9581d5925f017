package vn.quangtu.tutam.reminders;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.util.AtomicFile;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import vn.quangtu.tutam.MainActivity;
import vn.quangtu.tutam.R;

/** Private, atomically persisted rules + two OS alarms. No WebView or network required. */
public final class ReminderScheduler {
    private static final int NEXT=1510001, WATCHDOG=1510002;
    private static final String FILE="durable-reminders-v1.json";
    private static AtomicFile file(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(),FILE)); }
    private static JSONObject read(Context context) throws Exception {
        AtomicFile f=file(context);
        if(!f.getBaseFile().exists() && !new File(f.getBaseFile()+".bak").exists()) return null;
        return new JSONObject(new String(f.readFully(),StandardCharsets.UTF_8));
    }
    private static void write(Context context,JSONObject state) throws Exception {
        AtomicFile f=file(context); FileOutputStream out=null;
        try { out=f.startWrite(); out.write(state.toString().getBytes(StandardCharsets.UTF_8)); f.finishWrite(out); }
        catch(Exception error) { if(out!=null) f.failWrite(out); throw error; }
    }
    private static PendingIntent alarm(Context context,int code) {
        Intent intent=new Intent(context,ReminderReceiver.class).setAction("vn.quangtu.tutam.REMINDER_TICK");
        return PendingIntent.getBroadcast(context,code,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static synchronized void replace(Context context,JSONObject plan) throws Exception {
        // Deep copy and validate before touching the previous state. No edits to WebView storage.
        JSONObject copy=new JSONObject(plan.toString()); ReminderSchedule.validate(copy);
        if(copy.toString().getBytes(StandardCharsets.UTF_8).length>4*1024*1024) throw new IOException("Reminder plan too large");
        JSONObject previous=read(context);
        long cursor=previous!=null && previous.getJSONObject("plan").getBoolean("enabled") ? previous.optLong("cursor",System.currentTimeMillis()) : System.currentTimeMillis();
        JSONObject state=new JSONObject().put("plan",copy).put("cursor",cursor).put("delivered",previous==null?new JSONArray():previous.optJSONArray("delivered"));
        write(context,state);
        // Remove already displayed private content following edits/account changes too.
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        if(manager!=null) for(android.service.notification.StatusBarNotification notification:manager.getActiveNotifications()) if("tutam-personal".equals(notification.getTag())) manager.cancel(notification.getTag(),notification.getId());
        tick(context);
    }
    public static synchronized void clearPersonal(Context context) throws Exception {
        JSONObject state=read(context); if(state==null) return;
        JSONObject plan=state.getJSONObject("plan"); plan.put("personal",new JSONArray()); replace(context,plan);
    }
    public static synchronized JSONObject status(Context context) throws Exception {
        JSONObject state=read(context); if(state==null) return new JSONObject().put("configured",false);
        JSONObject plan=state.getJSONObject("plan"); byte[] hash=MessageDigest.getInstance("SHA-256").digest(plan.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder hex=new StringBuilder(); for(byte b:hash) hex.append(String.format(Locale.ROOT,"%02x",b));
        return new JSONObject().put("configured",true).put("ruleCount",ruleCount(plan)).put("personalCount",plan.getJSONArray("personal").length()).put("planHash",hex.toString()).put("cursor",state.optLong("cursor")).put("nextAt",state.optLong("nextAt")).put("alarmMode",state.optString("alarmMode","inexact"));
    }
    public static int ruleCount(JSONObject plan) throws JSONException { return plan.getJSONArray("daily").length()+plan.getJSONObject("lunar").length()+plan.getJSONArray("personal").length(); }
    static List<ReminderSchedule.Occurrence> nearby(JSONObject plan,long now) throws Exception {
        List<ReminderSchedule.Occurrence> items=new ArrayList<>();
        for(int offset=-1;offset<=2;offset++) items.addAll(ReminderSchedule.onDate(plan,ReminderSchedule.day(now,TimeZone.getDefault(),offset)));
        // Xét đúng các ngày lễ tương ứng với cửa sổ nhắc gần hiện tại, không quét 100 ngày.
        JSONObject timing=plan.optJSONObject("personalTiming");
        if(plan.getJSONArray("personal").length()>0 && (timing==null?plan.getBoolean("eve"):timing.getBoolean("beforeEnabled"))) {
            int lead=ReminderSchedule.personalDaysBefore(plan);
            for(int offset=Math.max(3,lead-1);offset<=lead+2;offset++) items.addAll(ReminderSchedule.personalOnDate(plan,ReminderSchedule.day(now,TimeZone.getDefault(),offset)));
        }
        Collections.sort(items,(left,right)->Long.compare(left.at,right.at)); return items;
    }
    private static void arm(Context context,JSONObject state,long now) throws Exception {
        AlarmManager alarms=context.getSystemService(AlarmManager.class); if(alarms==null) throw new IOException("AlarmManager unavailable");
        JSONObject plan=state.getJSONObject("plan");
        if(!plan.getBoolean("enabled")) { alarms.cancel(alarm(context,NEXT)); alarms.cancel(alarm(context,WATCHDOG)); state.put("nextAt",0).put("alarmMode","off"); write(context,state); return; }
        // Daily watchdog renews even when no events are due for months/years.
        long next=now+AlarmManager.INTERVAL_DAY;
        for(ReminderSchedule.Occurrence item:nearby(plan,now)) if(item.at>now) next=Math.min(next,item.at);
        alarms.setInexactRepeating(AlarmManager.ELAPSED_REALTIME_WAKEUP,android.os.SystemClock.elapsedRealtime()+AlarmManager.INTERVAL_DAY,AlarmManager.INTERVAL_DAY,alarm(context,WATCHDOG));
        // User-selected prayer/calendar times should wake a sleeping device without a WebView.
        // Special access is optional: denied/revoked access must never discard the saved plan.
        boolean exact=Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms();
        if(exact) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,alarm(context,NEXT)); }
            catch(SecurityException revoked) { exact=false; }
        }
        if(!exact) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,alarm(context,NEXT));
        state.put("nextAt",next).put("alarmMode",exact?"exact":"inexact"); write(context,state);
    }
    public static synchronized void tick(Context context) throws Exception {
        JSONObject state=read(context); if(state==null) return;
        long now=System.currentTimeMillis(), cursor=state.optLong("cursor",now);
        long since=Math.max(now-AlarmManager.INTERVAL_DAY,Math.min(cursor,now));
        JSONObject plan=state.getJSONObject("plan");
        JSONArray saved=state.optJSONArray("delivered"); LinkedHashSet<String> delivered=new LinkedHashSet<>();
        if(saved!=null) for(int i=0;i<saved.length();i++) delivered.add(saved.getString(i));
        for(ReminderSchedule.Occurrence item:nearby(plan,now)) if(item.at>since && item.at<=now && !delivered.contains(item.key)) {
            // Persist completion after notify; a crash can re-post the same ID but cannot create duplicates in the tray.
            if(show(context,plan,item)) delivered.add(item.key);
        }
        while(delivered.size()>256) delivered.remove(delivered.iterator().next());
        state.put("delivered",new JSONArray(delivered)); state.put("cursor",now); write(context,state); arm(context,state,now);
    }
    private static boolean show(Context context,JSONObject plan,ReminderSchedule.Occurrence item) throws Exception {
        return post(context,plan,item.id,item.title,item.body,item.target,item.personal,false);
    }
    /** Test cùng channel giao hàng thật, không đọc hay thay thế lịch đã lưu. */
    public static boolean testNotification(Context context,String title,String body,boolean sound,boolean vibrate) throws Exception {
        return post(context,new JSONObject().put("sound",sound).put("vibrate",vibrate),999999,title,body,"/tu-tap",false,true);
    }
    private static boolean post(Context context,JSONObject plan,int id,String title,String body,String target,boolean personal,boolean test) throws Exception {
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        if(manager==null || !androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        String channel="tutam_reminders_v2_"+(plan.getBoolean("sound")?"s":"q")+(plan.getBoolean("vibrate")?"v":"n");
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel legacy=manager.getNotificationChannel("tutam_daily");
            NotificationChannel c=new NotificationChannel(channel,"Nhắc ngày lễ và tu tập",legacy==null?NotificationManager.IMPORTANCE_HIGH:legacy.getImportance());
            c.setDescription("Ngày lễ cá nhân, vía Phật/Bồ Tát và thời khóa tự động"); c.enableVibration(plan.getBoolean("vibrate")&&(legacy==null||legacy.shouldVibrate())); c.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            if(!plan.getBoolean("sound")) c.setSound(null,null); else if(legacy!=null) c.setSound(legacy.getSound(),legacy.getAudioAttributes());
            manager.createNotificationChannel(c);
        }
        JSONObject source=new JSONObject().put("id",id).put("title",title).put("body",body).put("extra",new JSONObject().put("target",target));
        Intent launch=new Intent(context,MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY,id);
        launch.putExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY,source.toString());
        launch.putExtra(LocalNotificationManager.ACTION_INTENT_KEY,"tap");
        launch.putExtra(LocalNotificationManager.NOTIFICATION_IS_REMOVABLE_KEY,false);
        PendingIntent click=PendingIntent.getActivity(context,id,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(context,channel).setSmallIcon(R.drawable.ic_notification_small).setColor(0xffc8963e).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setAutoCancel(true).setOnlyAlertOnce(!test).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(click);
        if(Build.VERSION.SDK_INT<26) { if(plan.getBoolean("sound")) builder.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI); if(plan.getBoolean("vibrate")) builder.setVibrate(new long[]{0,250}); }
        manager.notify(test?"tutam-reminder-test":personal?"tutam-personal":"tutam-reminder",id,builder.build()); return true;
    }
}
