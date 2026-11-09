package vn.quangtu.tutam.reminders;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DurableReminderTest {
    private Context context;
    private JSONObject fixture;
    @Before public void setup() throws Exception {
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        // These tests must never alter the real app's native plan.
        assertTrue(context.getPackageName().endsWith(".securityqa")
            || context.getPackageName().equals("vn.quangtu.tutam.auditcontentqa"));
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("durable-reminder-fixtures.json"); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] bytes=new byte[8192]; int n; while((n=input.read(bytes))!=-1) output.write(bytes,0,n);
            fixture=new JSONObject(output.toString("UTF-8"));
        }
    }
    @Test public void testNotificationsHonorAllSoundVibrationModesWithoutChangingTheSavedPlan() throws Exception {
        android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);
        assertNotNull(manager);
        assertTrue("Controlled QA must grant notification delivery before this test",
            androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled());
        File[] files=new File[]{
            new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json"),
            new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json.bak"),
            new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json.new")
        };
        byte[][] saved=new byte[files.length][];
        for(int i=0;i<files.length;i++) saved[i]=files[i].exists()?java.nio.file.Files.readAllBytes(files[i].toPath()):null;
        try {
            for(boolean sound:new boolean[]{false,true}) for(boolean vibrate:new boolean[]{false,true}) {
                String channelId="tutam_reminders_v2_"+(sound?"s":"q")+(vibrate?"v":"n");
                android.app.NotificationChannel previous=android.os.Build.VERSION.SDK_INT>=26?manager.getNotificationChannel(channelId):null;
                assertTrue(ReminderScheduler.testNotification(context,"QA test "+channelId,"Sound and vibration test",sound,vibrate));
                android.app.Notification posted=null;
                long deadline=android.os.SystemClock.elapsedRealtime()+2000;
                while(android.os.SystemClock.elapsedRealtime()<deadline && posted==null) {
                    for(android.service.notification.StatusBarNotification entry:manager.getActiveNotifications()) {
                        if("tutam-reminder-test".equals(entry.getTag()) && entry.getId()==999999
                            && (android.os.Build.VERSION.SDK_INT<26 || channelId.equals(entry.getNotification().getChannelId()))) {
                            posted=entry.getNotification(); break;
                        }
                    }
                    if(posted==null) android.os.SystemClock.sleep(25);
                }
                assertNotNull("Test notification must reach its selected native channel",posted);
                assertEquals("Each explicit test click must be allowed to alert again",0,
                    posted.flags & android.app.Notification.FLAG_ONLY_ALERT_ONCE);
                if(android.os.Build.VERSION.SDK_INT>=26) {
                    android.app.NotificationChannel channel=manager.getNotificationChannel(channelId);
                    assertNotNull(channel);
                    if(!sound) assertNull("Sound OFF must select a silent channel",channel.getSound());
                    if(!vibrate) assertFalse("Vibration OFF must select a non-vibrating channel",channel.shouldVibrate());
                    if(previous==null) {
                        android.app.NotificationChannel legacy=manager.getNotificationChannel("tutam_daily");
                        if(sound) {
                            if(legacy==null) assertNotNull("Sound ON must retain the OS default",channel.getSound());
                            else assertEquals("Keep existing OS sound preferences",legacy.getSound(),channel.getSound());
                        }
                        assertEquals("Vibration ON must respect existing OS preferences",
                            vibrate && (legacy==null || legacy.shouldVibrate()),channel.shouldVibrate());
                    }
                } else {
                    assertEquals(sound?android.provider.Settings.System.DEFAULT_NOTIFICATION_URI:null,posted.sound);
                    assertArrayEquals(vibrate?new long[]{0,250}:null,posted.vibrate);
                }
                for(int i=0;i<files.length;i++) assertArrayEquals("Test delivery must preserve saved plan bytes",
                    saved[i],files[i].exists()?java.nio.file.Files.readAllBytes(files[i].toPath()):null);
            }
        } finally { manager.cancel("tutam-reminder-test",999999); }
    }
    @Test public void lunarCalendarMatchesWebAcross101Years() throws Exception {
        JSONArray cases=fixture.getJSONArray("calendar");
        for(int i=0;i<cases.length();i++) {
            JSONObject c=cases.getJSONObject(i); int[] actual=LunarCalendar.fromSolar(c.getInt("day"),c.getInt("month"),c.getInt("year"));
            JSONArray expected=c.getJSONArray("lunar"); for(int j=0;j<4;j++) assertEquals("case "+i+" field "+j,expected.getInt(j),actual[j]);
        }
    }
    @Test public void changingDailyTimeCreatesANewOccurrenceWithoutChangingWeekdays() throws Exception {
        JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString()).put("lunar",new JSONObject()).put("personal",new JSONArray());
        JSONObject rule=new JSONObject().put("id",1000).put("key","morning:all").put("title","QA daily").put("body","QA daily practice").put("hour",5).put("minute",30).put("days",new JSONArray("[1]"));
        plan.put("daily",new JSONArray().put(rule));
        Calendar monday=date(2026,11,2);
        ReminderSchedule.Occurrence original=ReminderSchedule.onDate(plan,monday).get(0);
        rule.put("hour",6);
        ReminderSchedule.Occurrence edited=ReminderSchedule.onDate(plan,monday).get(0);
        assertNotEquals("A changed time must not match an already delivered daily reminder",original.key,edited.key);
        assertEquals(3600000L,edited.at-original.at);
        assertEquals(original.title,edited.title);
        assertEquals(edited.key,ReminderSchedule.onDate(plan,monday).get(0).key);
        rule.put("minute",31);
        ReminderSchedule.Occurrence minuteEdited=ReminderSchedule.onDate(plan,monday).get(0);
        assertNotEquals(edited.key,minuteEdited.key);
        assertEquals(60000L,minuteEdited.at-edited.at);
        assertTrue(ReminderSchedule.onDate(plan,date(2026,11,3)).isEmpty());
    }
    @Test public void editedDailyAlarmReachesTheOsWithoutAWebView() throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json");
        byte[] backup=file.exists()?java.nio.file.Files.readAllBytes(file.toPath()):null;
        android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);
        assertTrue(androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled());
        android.app.AlarmManager alarms=context.getSystemService(android.app.AlarmManager.class);
        assertTrue(android.os.Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());
        String title="QA daily edited "+System.currentTimeMillis();
        try {
            Calendar due=Calendar.getInstance(); due.add(Calendar.MINUTE,1); due.set(Calendar.SECOND,0); due.set(Calendar.MILLISECOND,0);
            if(due.getTimeInMillis()-System.currentTimeMillis()<5000) due.add(Calendar.MINUTE,1);
            JSONObject rule=new JSONObject().put("id",1000).put("key","qa:daily-edit").put("title",title).put("body","QA daily background delivery").put("hour",(due.get(Calendar.HOUR_OF_DAY)+23)%24).put("minute",due.get(Calendar.MINUTE)).put("days",new JSONArray("[0,1,2,3,4,5,6]"));
            JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString()).put("lunar",new JSONObject()).put("personal",new JSONArray()).put("daily",new JSONArray().put(rule));
            Calendar date=ReminderSchedule.day(due.getTimeInMillis(),TimeZone.getDefault(),0);
            String oldKey=ReminderSchedule.onDate(plan,date).get(0).key;
            ReminderScheduler.replace(context,plan);
            JSONObject state=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8"));
            state.put("delivered",new JSONArray().put(oldKey));
            java.nio.file.Files.write(file.toPath(),state.toString().getBytes("UTF-8"));
            rule.put("hour",due.get(Calendar.HOUR_OF_DAY));
            String editedKey=ReminderSchedule.onDate(plan,date).get(0).key;
            ReminderScheduler.replace(context,plan);
            assertEquals(due.getTimeInMillis(),ReminderScheduler.status(context).getLong("nextAt"));
            boolean shown=false;
            while(System.currentTimeMillis()<due.getTimeInMillis()+10000L&&!shown) {
                for(android.service.notification.StatusBarNotification n:manager.getActiveNotifications()) if(title.contentEquals(n.getNotification().extras.getCharSequence("android.title",""))) shown=true;
                if(!shown) Thread.sleep(500);
            }
            assertTrue("Edited daily alarm must arrive without opening a WebView",shown);
            // notify() becomes visible before tick commits its receipt. This passive,
            // synchronized read waits for that same-process receiver tick to finish.
            ReminderScheduler.status(context);
            JSONArray receipts=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8")).getJSONArray("delivered");
            assertEquals("Keep the seeded old receipt and commit the edited occurrence",2,receipts.length());
            int editedReceipts=0;
            for(int i=0;i<receipts.length();i++) if(editedKey.equals(receipts.getString(i))) editedReceipts++;
            assertEquals("The receiver must persist the edited occurrence exactly once",1,editedReceipts);
            int delivered=receipts.length();
            ReminderScheduler.tick(context);
            receipts=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8")).getJSONArray("delivered");
            assertEquals(delivered,receipts.length());
            editedReceipts=0;
            for(int i=0;i<receipts.length();i++) if(editedKey.equals(receipts.getString(i))) editedReceipts++;
            assertEquals("A repeated tick must retain exactly one edited receipt",1,editedReceipts);
        } finally {
            for(android.service.notification.StatusBarNotification n:manager.getActiveNotifications()) if(title.contentEquals(n.getNotification().extras.getCharSequence("android.title",""))) manager.cancel(n.getTag(),n.getId());
            ReminderScheduler.replace(context,new JSONObject(fixture.getJSONObject("plan").toString()).put("enabled",false));
            if(backup==null) file.delete(); else { java.nio.file.Files.write(file.toPath(),backup); ReminderScheduler.tick(context); }
        }
    }
    @Test public void lunarSchedulesMatchWebAcross800Days() throws Exception {
        JSONArray cases=fixture.getJSONArray("messages"); JSONObject plan=fixture.getJSONObject("plan");
        for(int i=0;i<cases.length();i++) {
            JSONObject c=cases.getJSONObject(i); Calendar date=date(c.getInt("year"),c.getInt("month"),c.getInt("day"));
            List<ReminderSchedule.Occurrence> actual=ReminderSchedule.onDate(plan,date); JSONArray expected=c.getJSONArray("expected");
            assertEquals("day "+i,expected.length(),actual.size());
            for(int j=0;j<expected.length();j++) {
                JSONObject e=expected.getJSONObject(j); boolean found=false;
                for(ReminderSchedule.Occurrence occurrence:actual) if(occurrence.at==e.getLong("at") && occurrence.title.equals(e.getString("title")) && occurrence.body.equals(e.getString("body"))) found=true;
                assertTrue("unmatched message day "+i+" title "+e.getString("title"),found);
            }
        }
    }
    @Test public void personalSolarAndLunarContinueFarBeyond45Days() throws Exception {
        JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString()); plan.put("lunar",new JSONObject());
        JSONArray personal=new JSONArray().put(new JSONObject().put("title","Solar family anniversary").put("calendarMode","solar").put("solarDay",20).put("solarMonth",10));
        Calendar date=date(2096,10,20); int[] lunar=LunarCalendar.fromSolar(20,10,2096);
        personal.put(new JSONObject().put("title","Monthly lunar memorial").put("lunarDay",lunar[0]).put("lunarMonth",0).put("frequency","monthly"));
        plan.put("personal",personal); ReminderSchedule.validate(plan);
        List<ReminderSchedule.Occurrence> items=ReminderSchedule.onDate(plan,date); assertEquals(2,items.size());
        assertTrue(items.get(0).body.contains("Solar family")); assertTrue(items.get(0).body.contains("Monthly lunar"));
        assertEquals(19,hour(items.get(0).at)); assertEquals(6,hour(items.get(1).at));
        plan.put("personal",new JSONArray()); assertEquals(0,ReminderSchedule.onDate(plan,date).size());
    }
    @Test public void customPersonalTimesAreIndependentOfLunarAndKeepLegacyDefaults() throws Exception {
        JSONObject plan=personalPlan(2027,1,1);
        Calendar event=date(2027,1,1);
        List<ReminderSchedule.Occurrence> legacy=ReminderSchedule.onDate(plan,event);
        assertEquals(2,legacy.size());
        plan.put("eve",false).put("morning",false);
        assertTrue(ReminderSchedule.onDate(plan,event).isEmpty());
        plan.put("personalTiming",timing(100,"18:45","08:15"));
        ReminderSchedule.validate(plan);
        List<ReminderSchedule.Occurrence> custom=ReminderSchedule.onDate(plan,event);
        assertEquals(2,custom.size());
        Calendar before=date(2027,1,1); before.add(Calendar.DATE,-100); before.set(Calendar.HOUR_OF_DAY,18); before.set(Calendar.MINUTE,45);
        assertEquals(before.getTimeInMillis(),custom.get(0).at);
        assertEquals(8,hour(custom.get(1).at));
        assertEquals(15,minute(custom.get(1).at));
        assertTrue(custom.get(0).title.contains("100"));
        assertFalse(custom.get(0).title.contains("Ngày mai"));
        assertEquals("/",custom.get(0).target);
        assertNotEquals(legacy.get(0).key,custom.get(0).key);
        assertNotEquals(legacy.get(1).key,custom.get(1).key);
        plan.put("personalTiming",timing(1,"19:30","06:00"));
        List<ReminderSchedule.Occurrence> defaults=ReminderSchedule.onDate(plan,event);
        assertEquals(legacy.get(0).key,defaults.get(0).key);
        assertEquals(legacy.get(1).key,defaults.get(1).key);
    }
    @Test public void hundredDayReminderIsFoundNearNowWithoutScanningEveryDate() throws Exception {
        TimeZone previous=TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Ho_Chi_Minh"));
            JSONObject plan=personalPlan(2027,1,1).put("personalTiming",timing(100,"18:45","08:15"));
            Calendar before=date(2027,1,1); before.add(Calendar.DATE,-100); before.set(Calendar.HOUR_OF_DAY,18); before.set(Calendar.MINUTE,45);
            List<ReminderSchedule.Occurrence> nearby=ReminderScheduler.nearby(plan,before.getTimeInMillis()-60000);
            int found=0;
            for(ReminderSchedule.Occurrence item:nearby) if(item.at==before.getTimeInMillis()) found++;
            assertEquals("Future event must produce exactly one near reminder across the year boundary",1,found);
            String original=ReminderSchedule.onDate(plan,date(2027,1,1)).get(0).key;
            plan.getJSONObject("personalTiming").put("beforeTime","18:46");
            assertNotEquals(original,ReminderSchedule.onDate(plan,date(2027,1,1)).get(0).key);
            plan.getJSONObject("personalTiming").put("daysBefore",99);
            assertNotEquals(original,ReminderSchedule.onDate(plan,date(2027,1,1)).get(0).key);
            plan.getJSONObject("personalTiming").put("beforeEnabled",false);
            for(ReminderSchedule.Occurrence item:ReminderScheduler.nearby(plan,before.getTimeInMillis())) assertFalse(item.at==before.getTimeInMillis());
        } finally { TimeZone.setDefault(previous); }
    }
    @Test public void invalidPersonalTimingIsRejectedBeforeReplacingThePlan() throws Exception {
        JSONObject plan=personalPlan(2027,1,1);
        for(Object days:new Object[]{0,101,1.5,"1",JSONObject.NULL}) {
            plan.put("personalTiming",timing(1,"19:30","06:00").put("daysBefore",days));
            try { ReminderSchedule.validate(plan); fail("accepted invalid days "+days); } catch(JSONException expected) {}
        }
        for(String time:new String[]{"24:00","19:60","6:00","","19:30:00"}) {
            plan.put("personalTiming",timing(1,time,"06:00"));
            try { ReminderSchedule.validate(plan); fail("accepted invalid time "+time); } catch(JSONException expected) {}
            plan.put("personalTiming",timing(1,"19:30",time));
            try { ReminderSchedule.validate(plan); fail("accepted invalid day time "+time); } catch(JSONException expected) {}
        }
        plan.put("personalTiming",timing(1,"19:30","06:00").put("beforeEnabled","true"));
        try { ReminderSchedule.validate(plan); fail("accepted string flag"); } catch(JSONException expected) {}
        plan.put("personalTiming",JSONObject.NULL);
        try { ReminderSchedule.validate(plan); fail("accepted null config"); } catch(JSONException expected) {}
    }
    private JSONObject personalPlan(int year,int month,int day) throws Exception {
        return new JSONObject(fixture.getJSONObject("plan").toString()).put("daily",new JSONArray()).put("lunar",new JSONObject())
            .put("personal",new JSONArray().put(new JSONObject().put("title","QA anniversary").put("calendarMode","solar").put("solarDay",day).put("solarMonth",month)));
    }
    private JSONObject timing(int days,String beforeTime,String dayTime) throws Exception {
        return new JSONObject().put("beforeEnabled",true).put("dayEnabled",true).put("daysBefore",days).put("beforeTime",beforeTime).put("dayTime",dayTime);
    }
    @Test public void reportsAlarmModeAndCancelsWhenDisabled() throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json");
        byte[] backup=file.exists()?java.nio.file.Files.readAllBytes(file.toPath()):null;
        try {
            JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString());
            ReminderScheduler.replace(context,plan);
            android.app.AlarmManager alarms=context.getSystemService(android.app.AlarmManager.class);
            boolean exact=android.os.Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms();
            assertEquals(exact?"exact":"inexact",ReminderScheduler.status(context).getString("alarmMode"));
            assertTrue(ReminderScheduler.status(context).getLong("nextAt")>System.currentTimeMillis());
            ReminderScheduler.replace(context,plan.put("enabled",false));
            assertEquals("off",ReminderScheduler.status(context).getString("alarmMode"));
            assertEquals(0,ReminderScheduler.status(context).getLong("nextAt"));
        } finally {
            if(backup==null) { ReminderScheduler.replace(context,new JSONObject(fixture.getJSONObject("plan").toString()).put("enabled",false)); file.delete(); }
            else { java.nio.file.Files.write(file.toPath(),backup); ReminderScheduler.tick(context); }
        }
    }
    @Test public void invalidReplacementRetainsSavedPlan() throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json");
        byte[] backup=file.exists()?java.nio.file.Files.readAllBytes(file.toPath()):null;
        try {
            JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString()); ReminderScheduler.replace(context,plan);
            String hash=ReminderScheduler.status(context).getString("planHash");
            JSONObject invalid=new JSONObject(plan.toString()).put("version",999);
            try { ReminderScheduler.replace(context,invalid); fail("accepted invalid plan"); } catch(JSONException expected) {}
            assertEquals(hash,ReminderScheduler.status(context).getString("planHash"));
            ReminderScheduler.tick(context); assertEquals(hash,ReminderScheduler.status(context).getString("planHash"));
            plan.put("personal",new JSONArray().put(new JSONObject().put("title","private").put("lunarDay",1).put("lunarMonth",1)));
            ReminderScheduler.replace(context,plan); ReminderScheduler.clearPersonal(context);
            assertEquals(0,ReminderScheduler.status(context).getInt("personalCount"));
        } finally {
            if(backup==null) { JSONObject disabled=new JSONObject(fixture.getJSONObject("plan").toString()).put("enabled",false); ReminderScheduler.replace(context,disabled); file.delete(); }
            else { java.nio.file.Files.write(file.toPath(),backup); ReminderScheduler.tick(context); }
        }
    }
    @Test public void missedReminderSurvivesLongAbsenceAndRefreshWithoutDuplicates() throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json");
        byte[] backup=file.exists()?java.nio.file.Files.readAllBytes(file.toPath()):null;
        android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);
        try {
            Calendar due=Calendar.getInstance(); due.add(Calendar.MINUTE,-1);
            JSONObject plan=new JSONObject(fixture.getJSONObject("plan").toString()).put("lunar",new JSONObject());
            plan.put("daily",new JSONArray().put(new JSONObject().put("id",1000).put("title","QA long absence").put("body","QA persisted reminder").put("hour",due.get(Calendar.HOUR_OF_DAY)).put("minute",due.get(Calendar.MINUTE)).put("days",new JSONArray("[0,1,2,3,4,5,6]"))));
            ReminderScheduler.replace(context,plan);
            JSONObject saved=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8"));
            saved.put("cursor",System.currentTimeMillis()-60L*24*3600000); saved.put("delivered",new JSONArray());
            java.nio.file.Files.write(file.toPath(),saved.toString().getBytes("UTF-8"));
            // Refreshing the app must not advance past a delayed alarm before delivery.
            ReminderScheduler.replace(context,plan);
            JSONObject after=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8"));
            assertTrue(after.getJSONArray("delivered").length()>0);
            int count=after.getJSONArray("delivered").length();
            ReminderScheduler.tick(context);
            after=new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),"UTF-8"));
            assertEquals(count,after.getJSONArray("delivered").length());
            boolean shown=false; for(android.service.notification.StatusBarNotification n:manager.getActiveNotifications()) if("QA long absence".contentEquals(n.getNotification().extras.getCharSequence("android.title",""))) { shown=true; manager.cancel(n.getTag(),n.getId()); }
            assertTrue("OS must receive the delayed reminder",shown);
        } finally {
            if(backup==null) { ReminderScheduler.replace(context,new JSONObject(fixture.getJSONObject("plan").toString()).put("enabled",false)); file.delete(); }
            else { java.nio.file.Files.write(file.toPath(),backup); ReminderScheduler.tick(context); }
        }
    }
    @Test public void interruptedAtomicWriteRecoversThePreviousFile() throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"durable-reminders-v1.json");
        byte[] backup=file.exists()?java.nio.file.Files.readAllBytes(file.toPath()):null;
        try {
            ReminderScheduler.replace(context,fixture.getJSONObject("plan"));
            String hash=ReminderScheduler.status(context).getString("planHash");
            File rollback=new File(file+".bak"); assertTrue(file.renameTo(rollback));
            java.nio.file.Files.write(file.toPath(),"interrupted".getBytes("UTF-8"));
            assertEquals(hash,ReminderScheduler.status(context).getString("planHash"));
        } finally {
            if(backup==null) { ReminderScheduler.replace(context,new JSONObject(fixture.getJSONObject("plan").toString()).put("enabled",false)); file.delete(); }
            else { java.nio.file.Files.write(file.toPath(),backup); ReminderScheduler.tick(context); }
        }
    }
    private Calendar date(int year,int month,int day) { Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Asia/Ho_Chi_Minh")); c.clear(); c.set(year,month-1,day); return c; }
    private int hour(long time) { Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Asia/Ho_Chi_Minh")); c.setTimeInMillis(time); return c.get(Calendar.HOUR_OF_DAY); }
    private int minute(long time) { Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Asia/Ho_Chi_Minh")); c.setTimeInMillis(time); return c.get(Calendar.MINUTE); }
}
