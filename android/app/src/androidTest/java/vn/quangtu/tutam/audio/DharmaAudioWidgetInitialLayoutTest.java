package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.view.LayoutInflater;
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
public class DharmaAudioWidgetInitialLayoutTest {
    private final int[] layouts = {R.layout.dharma_audio_small, R.layout.dharma_audio_small_narrow, R.layout.dharma_audio_medium,
        R.layout.dharma_audio_medium_tall, R.layout.dharma_audio_large};

    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private void assertUnselected(View view) {
        Context context = context();
        assertEquals(context.getString(R.string.dharma_audio_choose), ((TextView) view.findViewById(R.id.dharma_title)).getText().toString());
        assertEquals(context.getString(R.string.dharma_audio_unselected), ((TextView) view.findViewById(R.id.dharma_status)).getText().toString());
        assertEquals("", ((TextView) view.findViewById(R.id.dharma_times)).getText().toString());
    }

    @Test public void initialXmlHasUsefulHonestContentBeforeTheFirstUpdate() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (int resource : layouts) {
                View view = LayoutInflater.from(context()).inflate(resource, new FrameLayout(context()), false);
                assertEquals("Mở app để cập nhật", ((TextView) view.findViewById(R.id.dharma_title)).getText().toString());
                assertEquals("Chờ cập nhật", ((TextView) view.findViewById(R.id.dharma_status)).getText().toString());
                assertEquals("", ((TextView) view.findViewById(R.id.dharma_times)).getText().toString());
                if (resource != R.layout.dharma_audio_small && resource != R.layout.dharma_audio_small_narrow) {
                    assertEquals(context().getString(R.string.dharma_audio_open), ((TextView) view.findViewById(R.id.dharma_artist)).getText().toString());
                    assertEquals(View.GONE, view.findViewById(R.id.dharma_progress).getVisibility());
                }
                if (resource == R.layout.dharma_audio_large) {
                    for (int id : new int[]{R.id.dharma_next_1, R.id.dharma_next_2, R.id.dharma_next_3}) assertEquals(View.GONE, view.findViewById(id).getVisibility());
                }
            }
        });
    }

    @Test public void applyingEmptyRemoteViewsPopulatesEveryFamily() throws Exception {
        Method method = DharmaAudioWidgetProvider.class.getDeclaredMethod("views", Context.class, int.class, JSONObject.class, int.class);
        method.setAccessible(true);
        for (int resource : layouts) {
            RemoteViews remote = (RemoteViews) method.invoke(null, context(), resource, new JSONObject(), resource == R.layout.dharma_audio_large ? 350 : 180);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> assertUnselected(remote.apply(context(), new FrameLayout(context()))));
        }
    }

    @Test public void thePackagedUpgradeReceiverCanBeResolved() throws Exception {
        ComponentName component = new ComponentName(context(), DharmaAudioWidgetProvider.class);
        assertTrue(context().getPackageManager().getReceiverInfo(component, 0).enabled);
        boolean declared = false;
        Intent intent = new Intent(Intent.ACTION_MY_PACKAGE_REPLACED).setPackage(context().getPackageName());
        for (ResolveInfo receiver : context().getPackageManager().queryBroadcastReceivers(intent, 0)) {
            if (component.getClassName().equals(receiver.activityInfo.name)) declared = true;
        }
        assertTrue("Audio upgrade action is absent from the installed manifest", declared);
    }


    @Test public void everyInitialLayoutFitsItsMinimumHostBeforeTheFirstUpdate() {
        Class<?>[] families = {DharmaAudioWidgetProvider.Small.class, DharmaAudioWidgetProvider.Medium.class, DharmaAudioWidgetProvider.Large.class};
        int[] widths = {110, 250, 250}, heights = {110, 110, 250};
        int[] expectedLayouts = {R.layout.dharma_audio_small_narrow, R.layout.dharma_audio_medium, R.layout.dharma_audio_medium};
        for (boolean dark : new boolean[]{false, true}) for (float font : new float[]{1f, 1.3f, 1.5f}) {
            android.content.res.Configuration config = new android.content.res.Configuration(context().getResources().getConfiguration());
            config.fontScale = font;
            config.uiMode = (config.uiMode & ~android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                | (dark ? android.content.res.Configuration.UI_MODE_NIGHT_YES : android.content.res.Configuration.UI_MODE_NIGHT_NO);
            Context context = context().createConfigurationContext(config);
            for (int family = 0; family < families.length; family++) {
              final int index = family;
              InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                android.appwidget.AppWidgetProviderInfo info = null;
                for (android.appwidget.AppWidgetProviderInfo candidate : android.appwidget.AppWidgetManager.getInstance(context).getInstalledProviders()) {
                    if (candidate.provider.equals(new ComponentName(context, families[index]))) { info = candidate; break; }
                }
                assertNotNull(info);
                assertEquals(expectedLayouts[index], info.initialLayout);
                View root = new RemoteViews(context.getPackageName(), info.initialLayout).apply(context, new FrameLayout(context));
                float density = context.getResources().getDisplayMetrics().density;
                int width = Math.round(widths[index] * density), height = Math.round(heights[index] * density);
                root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                root.layout(0, 0, width, height);
                int[] controls = index == 0 ? new int[]{R.id.dharma_play} : new int[]{R.id.dharma_back, R.id.dharma_play, R.id.dharma_forward};
                for (int id : controls) {
                    View control = root.findViewById(id);
                    android.graphics.Rect rect = new android.graphics.Rect(0, 0, control.getWidth(), control.getHeight());
                    ((android.view.ViewGroup) root).offsetDescendantRectToMyCoords(control, rect);
                    assertTrue(rect.left >= 0 && rect.top >= 0 && rect.right <= width && rect.bottom <= height);
                    assertTrue(control.getWidth() + 1 >= 48 * density && control.getHeight() + 1 >= 48 * density);
                }
                TextView title = root.findViewById(R.id.dharma_title);
                assertEquals("Mở app để cập nhật", title.getText().toString());
                assertTrue(title.getHeight() >= title.getLayout().getLineBottom(title.getLayout().getLineCount() - 1));
                if (index == 0) for (int id : new int[]{R.id.dharma_small_label, R.id.dharma_cover, R.id.dharma_status, R.id.dharma_times})
                    assertEquals(View.GONE, root.findViewById(id).getVisibility());
              });
            }
        }
    }
}
