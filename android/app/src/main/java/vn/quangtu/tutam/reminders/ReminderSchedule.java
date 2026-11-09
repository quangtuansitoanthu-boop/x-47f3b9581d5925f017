package vn.quangtu.tutam.reminders;

import org.json.*;
import java.util.*;

/** Calendar calculations only: no Activity, network, storage, or OS timers. */
public final class ReminderSchedule {
    public static final class Occurrence {
        public final long at;
        public final int id;
        public final String key, title, body, target;
        public final boolean personal;
        Occurrence(Calendar at, int slot, String title, String body, String target, boolean personal) {
            this(at,Integer.toString(slot),title,body,target,personal);
        }
        Occurrence(Calendar at, String slot, String title, String body, String target, boolean personal) {
            this.at=at.getTimeInMillis(); this.title=title; this.body=body; this.target=target; this.personal=personal;
            String date=at.get(Calendar.YEAR)+"-"+(at.get(Calendar.MONTH)+1)+"-"+at.get(Calendar.DAY_OF_MONTH);
            this.key=date+":"+slot;
            // Date hash is not used for deduplication; key is persisted separately.
            this.id=1500000000 + Math.floorMod(key.hashCode(), 400000000);
        }
    }
    public static Calendar day(long time, TimeZone zone, int offset) {
        Calendar c=Calendar.getInstance(zone); c.setTimeInMillis(time); c.add(Calendar.DATE,offset);
        c.set(Calendar.HOUR_OF_DAY,0); c.set(Calendar.MINUTE,0); c.set(Calendar.SECOND,0); c.set(Calendar.MILLISECOND,0); return c;
    }
    private static Calendar at(Calendar date,int hour,int minute,int offset) {
        Calendar c=(Calendar)date.clone(); c.add(Calendar.DATE,offset); c.set(Calendar.HOUR_OF_DAY,hour); c.set(Calendar.MINUTE,minute); return c;
    }
    private static int[] lunar(Calendar c) { return LunarCalendar.fromSolar(c.get(Calendar.DAY_OF_MONTH),c.get(Calendar.MONTH)+1,c.get(Calendar.YEAR)); }
    public static List<Occurrence> onDate(JSONObject plan, Calendar date) throws JSONException {
        List<Occurrence> result=new ArrayList<>(); if (!plan.getBoolean("enabled")) return result;
        JSONArray daily=plan.getJSONArray("daily");
        for(int i=0;i<daily.length();i++) {
            JSONObject rule=daily.getJSONObject(i); JSONArray days=rule.getJSONArray("days");
            for(int j=0;j<days.length();j++) if(days.getInt(j)==date.get(Calendar.DAY_OF_WEEK)-1) {
                // Giờ mới là lượt nhắc mới, không bị mốc đã gửi của giờ cũ chặn trong cùng ngày.
                result.add(new Occurrence(at(date,rule.getInt("hour"),rule.getInt("minute"),0),"daily:"+rule.optString("key",Integer.toString(rule.optInt("id",i)))+"@"+rule.getInt("hour")+":"+rule.getInt("minute"),rule.getString("title"),rule.getString("body"),"/tu-tap",false)); break;
            }
        }
        int[] lunar=lunar(date);
        Calendar last=(Calendar)date.clone(); last.add(Calendar.DATE,30-lunar[0]);
        int length=lunar(last)[0]==30?30:29;
        JSONObject template=plan.getJSONObject("lunar").optJSONObject(lunar[1]+"-"+lunar[0]+"-"+length+"-"+lunar[3]);
        if(template!=null) for(String slot:new String[]{"eve","morning"}) {
            JSONObject message=template.optJSONObject(slot); if(message==null) continue;
            boolean eve=slot.equals("eve");
            result.add(new Occurrence(at(date,eve?19:6,eve?30:0,eve?-1:0),eve?1:2,message.getString("title"),message.getString("body"),"/tu-tap",false));
        }
        result.addAll(personalOnDate(plan,date,lunar));
        return result;
    }
    public static List<Occurrence> personalOnDate(JSONObject plan,Calendar date) throws JSONException {
        if(!plan.getBoolean("enabled")) return new ArrayList<>();
        return personalOnDate(plan,date,lunar(date));
    }
    public static int personalDaysBefore(JSONObject plan) throws JSONException {
        return plan.has("personalTiming")?plan.getJSONObject("personalTiming").getInt("daysBefore"):1;
    }
    private static List<Occurrence> personalOnDate(JSONObject plan,Calendar date,int[] lunar) throws JSONException {
        List<Occurrence> result=new ArrayList<>();
        JSONArray personal=plan.getJSONArray("personal"); List<String> titles=new ArrayList<>();
        for(int i=0;i<personal.length();i++) {
            JSONObject event=personal.getJSONObject(i); boolean monthly="monthly".equals(event.optString("frequency"));
            boolean match;
            if("solar".equals(event.optString("calendarMode"))) match=event.optInt("solarDay")==date.get(Calendar.DAY_OF_MONTH) && (monthly||event.optInt("solarMonth")==date.get(Calendar.MONTH)+1);
            else match=event.getInt("lunarDay")==lunar[0] && (monthly||event.optInt("lunarMonth")==0||event.optInt("lunarMonth")==lunar[1]);
            if(match) titles.add(event.getString("title"));
        }
        JSONObject timing=plan.optJSONObject("personalTiming");
        int daysBefore=personalDaysBefore(plan);
        if(!titles.isEmpty()) for(boolean eve:new boolean[]{true,false}) {
            if(!(timing==null?plan.getBoolean(eve?"eve":"morning"):timing.getBoolean(eve?"beforeEnabled":"dayEnabled"))) continue;
            String time=timing==null?(eve?"19:30":"06:00"):timing.getString(eve?"beforeTime":"dayTime");
            int hour=Integer.parseInt(time.substring(0,2)), minute=Integer.parseInt(time.substring(3,5));
            boolean en="en".equals(plan.optString("locale"));
            String title=en?(eve?(daysBefore==1?"🗓️ Tomorrow: Personal anniversary":"🗓️ In "+daysBefore+" days: Personal anniversary"):"🗓️ Today: Personal anniversary"):(eve?(daysBefore==1?"🗓️ Ngày mai: Ngày lễ cá nhân":"🗓️ Còn "+daysBefore+" ngày: Ngày lễ cá nhân"):"🗓️ Hôm nay: Ngày lễ cá nhân");
            // Giữ khóa mặc định cũ khi nâng cấp; giờ/khoảng nhắc mới cần receipt riêng.
            boolean legacy=eve?daysBefore==1&&time.equals("19:30"):time.equals("06:00");
            String slot=legacy?Integer.toString(eve?3:4):"personal:"+(eve?"before":"day")+"@"+time+":"+(eve?daysBefore:0)+":"+date.get(Calendar.YEAR)+"-"+(date.get(Calendar.MONTH)+1)+"-"+date.get(Calendar.DAY_OF_MONTH);
            result.add(new Occurrence(at(date,hour,minute,eve?-daysBefore:0),slot,title,android.text.TextUtils.join("; ",titles),"/",true));
        }
        return result;
    }
    public static void validate(JSONObject plan) throws JSONException {
        if(plan.getInt("version")!=1) throw new JSONException("Unsupported reminder plan");
        plan.getBoolean("enabled"); plan.getBoolean("eve"); plan.getBoolean("morning"); plan.getBoolean("sound"); plan.getBoolean("vibrate");
        if(plan.has("personalTiming")) {
            JSONObject timing=plan.getJSONObject("personalTiming");
            if(!(timing.get("beforeEnabled") instanceof Boolean)||!(timing.get("dayEnabled") instanceof Boolean)) throw new JSONException("Invalid personal reminder flags");
            Object days=timing.get("daysBefore");
            if(!(days instanceof Number)||((Number)days).doubleValue()!=timing.getInt("daysBefore")||timing.getInt("daysBefore")<1||timing.getInt("daysBefore")>100) throw new JSONException("Invalid personal reminder days");
            for(String field:new String[]{"beforeTime","dayTime"}) if(!(timing.get(field) instanceof String)||!timing.getString(field).matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) throw new JSONException("Invalid personal reminder time");
        }
        JSONArray daily=plan.getJSONArray("daily"), personal=plan.getJSONArray("personal");
        if(daily.length()>700||personal.length()>5000||plan.getJSONObject("lunar").length()>1440) throw new JSONException("Reminder plan too large");
        for(int i=0;i<daily.length();i++) { JSONObject d=daily.getJSONObject(i);
            if(d.getInt("hour")<0||d.getInt("hour")>23||d.getInt("minute")<0||d.getInt("minute")>59) throw new JSONException("Invalid reminder time");
            d.getString("title"); d.getString("body"); JSONArray days=d.getJSONArray("days");
            for(int j=0;j<days.length();j++) if(days.getInt(j)<0||days.getInt(j)>6) throw new JSONException("Invalid weekday");
        }
        for(int i=0;i<personal.length();i++) { JSONObject e=personal.getJSONObject(i); e.getString("title");
            boolean solar="solar".equals(e.optString("calendarMode")); int day=e.getInt(solar?"solarDay":"lunarDay"), month=e.getInt(solar?"solarMonth":"lunarMonth");
            if(day<1||day>(solar?31:30)||month<0||month>12||solar&&month<1) throw new JSONException("Invalid personal date");
        }
        // Parse every template now, before replacing an existing file.
        JSONObject lunar=plan.getJSONObject("lunar"); Iterator<String> keys=lunar.keys();
        while(keys.hasNext()) { JSONObject entry=lunar.getJSONObject(keys.next()); for(String slot:new String[]{"eve","morning"}) if(entry.has(slot)) { entry.getJSONObject(slot).getString("title"); entry.getJSONObject(slot).getString("body"); } }
    }
}
