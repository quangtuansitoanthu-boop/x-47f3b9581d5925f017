package vn.quangtu.tutam.reminders;

import android.content.*;

public final class ReminderReceiver extends BroadcastReceiver {
    private static final java.util.concurrent.ExecutorService WORK = java.util.concurrent.Executors.newSingleThreadExecutor();
    @Override public void onReceive(Context context,Intent intent) {
        String action=intent==null?null:intent.getAction();
        if(!"vn.quangtu.tutam.REMINDER_TICK".equals(action) && !Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action) && !Intent.ACTION_TIMEZONE_CHANGED.equals(action) && !"android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)) return;
        // AlarmManager releases its CPU wake lock when onReceive returns; goAsync alone
        // only keeps the process alive. Hold the CPU briefly until private-file work ends.
        android.os.PowerManager power=context.getSystemService(android.os.PowerManager.class);
        android.os.PowerManager.WakeLock wake=power.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"TuTap:ReminderDelivery");
        wake.acquire(10000L);
        PendingResult pending=goAsync();
        WORK.execute(()-> { try { ReminderScheduler.tick(context.getApplicationContext()); }
            catch(Exception error) { android.util.Log.e("TuTapReminders","Could not restore reminders; saved plan retained",error); }
            finally { try { if(wake.isHeld()) wake.release(); } finally { pending.finish(); } }
        });
    }
}
