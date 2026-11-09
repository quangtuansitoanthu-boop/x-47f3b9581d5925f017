package vn.quangtu.tutam;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.view.WindowManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.HashSet;
import java.util.Set;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.xmlpull.v1.XmlPullParser;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AndroidAuditTest {
    private Context context;

    @Before public void setup() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Chỉ đọc resource trên gói QA riêng, không mở Activity hay gửi request API.
        assertTrue(context.getPackageName().endsWith(".securityqa"));
    }

    @Test public void notificationVectorHasTransparentCornersAndWhiteInk() {
        Drawable icon = context.getDrawable(R.drawable.ic_notification_small);
        assertNotNull(icon);
        Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        icon.setBounds(0, 0, 96, 96);
        icon.draw(new Canvas(bitmap));
        assertEquals(0, Color.alpha(bitmap.getPixel(0, 0)));
        assertEquals(0, Color.alpha(bitmap.getPixel(95, 95)));
        int whitePixels = 0;
        for (int y = 0; y < 96; y++) for (int x = 0; x < 96; x++) {
            int color = bitmap.getPixel(x, y);
            if (Color.alpha(color) > 0) {
                assertEquals(255, Color.red(color));
                assertEquals(255, Color.green(color));
                assertEquals(255, Color.blue(color));
                whitePixels++;
            }
        }
        assertTrue(whitePixels > 100);
        assertTrue(whitePixels < 96 * 96);
        bitmap.recycle();
    }

    @Test public void ordinaryWarmIntentReplacesTheRetainedLaunchIntent() {
        // Exercise the real override without launching a WebView/SDK or accessing any account.
        // This verifies retained intent ownership; it does not simulate process recreation.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            MainActivity activity = new MainActivity();
            android.content.Intent cold = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse("vn.quangtu.tutam://tu-tap?action=rosary"));
            activity.setIntent(cold);
            android.content.Intent warm = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse("vn.quangtu.tutam://phap-thoai?album=local-audit"));
            warm.putExtra("local-audit-notification", 42);
            assertFalse(warm.hasExtra(StartupArtworkView.EXTRA_INDEX));
            activity.onNewIntent(warm);
            assertSame("Ordinary warm links must become the retained Activity intent", warm, activity.getIntent());
            assertEquals(42, activity.getIntent().getIntExtra("local-audit-notification", -1));
            android.content.Intent notification = new android.content.Intent(android.content.Intent.ACTION_MAIN);
            notification.putExtra(com.capacitorjs.plugins.localnotifications.LocalNotificationManager.NOTIFICATION_INTENT_KEY, 73);
            activity.onNewIntent(notification);
            assertSame("Notification actions must retain their own extras rather than an older deep link", notification, activity.getIntent());
        });
    }

    @Test public void mergedManifestRequestsVibrationAndResizesMainActivity() throws Exception {
        ActivityInfo info = context.getPackageManager().getActivityInfo(new ComponentName(context, MainActivity.class), 0);
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
            info.softInputMode & WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
        assertEquals(PackageManager.PERMISSION_GRANTED, context.checkSelfPermission(Manifest.permission.VIBRATE));
    }

    @Test public void compiledBackupRulesExcludeCookiesButNotDraftStores() throws Exception {
        for (int resource : new int[] { R.xml.backup_rules, R.xml.data_extraction_rules }) {
            Set<String> excluded = new HashSet<>();
            try (XmlResourceParser parser = context.getResources().getXml(resource)) {
                for (int event = parser.getEventType(); event != XmlPullParser.END_DOCUMENT; event = parser.next()) {
                    if (event == XmlPullParser.START_TAG && "exclude".equals(parser.getName())) {
                        assertEquals("root", parser.getAttributeValue(null, "domain"));
                        String path = parser.getAttributeValue(null, "path");
                        assertFalse(path.contains("IndexedDB"));
                        assertFalse(path.contains("Local Storage"));
                        excluded.add(path);
                    }
                }
            }
            assertTrue(excluded.contains("app_webview/Default/Cookies"));
            assertTrue(excluded.contains("app_webview/Default/Cookies-wal"));
            assertTrue(excluded.contains("app_webview/Default/Network/"));
            assertFalse(excluded.contains("app_webview/"));
        }
    }
}
