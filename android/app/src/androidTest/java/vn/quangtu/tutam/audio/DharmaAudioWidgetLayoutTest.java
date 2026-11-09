package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import vn.quangtu.tutam.R;

@RunWith(AndroidJUnit4.class)
public class DharmaAudioWidgetLayoutTest {
    private JSONObject state(boolean ready) throws Exception {
        JSONObject state = new JSONObject().put("ready", ready).put("title", "Nhân quả trong đời sống và thực hành lòng từ bi mỗi ngày")
            .put("artist", "Pháp sư giảng giải thực hành").put("position", 755000).put("duration", 2700000)
            .put("queueId", "layout-test-only").put("albumId", "layout-test-album").put("sleepAtEnd", true);
        JSONArray next = new JSONArray();
        for (int i = 0; i < 3; i++) next.put(new JSONObject().put("index", i + 1)
            .put("trackId", "layout-test-" + i).put("title", "Bài giảng tiếp theo có tên rất dài để kiểm tra bố cục"));
        return state.put("next", next);
    }

    private View render(int widthDp, int heightDp, float font, boolean dark, boolean ready, boolean sleepAtEnd, int repeatMode) throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Configuration config = new Configuration(target.getResources().getConfiguration());
        config.fontScale = font;
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK)
            | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        Context context = target.createConfigurationContext(config);
        Method size = DharmaAudioWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
        size.setAccessible(true);
        Method render = DharmaAudioWidgetProvider.class.getDeclaredMethod("render", Context.class, JSONObject.class, int.class, int.class);
        render.setAccessible(true);
        RemoteViews remote = (RemoteViews) render.invoke(null, context, state(ready).put("repeat", repeatMode).put("sleepAtEnd", sleepAtEnd).put("sleepRemainingMs", 1800000), size.invoke(null, widthDp, heightDp), heightDp);
        final View[] result = new View[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View root = remote.apply(context, new FrameLayout(context));
            float density = context.getResources().getDisplayMetrics().density;
            int width = Math.round(widthDp * density), height = Math.round(heightDp * density);
            root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            root.layout(0, 0, width, height);
            result[0] = root;
        });
        return result[0];
    }

    private Rect bounds(View root, View child) {
        Rect rect = new Rect(0, 0, child.getWidth(), child.getHeight());
        ((ViewGroup) root).offsetDescendantRectToMyCoords(child, rect);
        return rect;
    }

    private void visibleInside(View root, int id, boolean touch) {
        View child = root.findViewById(id);
        assertNotNull("Missing view " + id, child);
        assertEquals("Hidden required view " + id, View.VISIBLE, child.getVisibility());
        Rect rect = bounds(root, child);
        assertTrue("Zero-area view " + id, rect.width() > 0 && rect.height() > 0);
        assertTrue("View outside host " + id + " " + rect + " in " + root.getWidth() + "x" + root.getHeight(),
            rect.left >= 0 && rect.top >= 0 && rect.right <= root.getWidth() && rect.bottom <= root.getHeight());
        if (touch) {
            float density = root.getResources().getDisplayMetrics().density;
            assertTrue("Control width below48dp " + id, rect.width() + 1 >= 48 * density);
            assertTrue("Control height below48dp " + id, rect.height() + 1 >= 48 * density);
            assertTrue("Control lost its action " + id, child.hasOnClickListeners());
        }
    }

    private void titleReadable(View root) {
        TextView title = root.findViewById(R.id.dharma_title);
        visibleInside(root, R.id.dharma_title, false);
        assertNotNull(title.getLayout());
        assertTrue("Title has no laid-out line", title.getLayout().getLineCount() > 0);
        assertTrue("Title clipped vertically", title.getHeight() - title.getCompoundPaddingTop() - title.getCompoundPaddingBottom()
            >= title.getLayout().getLineBottom(title.getLayout().getLineCount() - 1));
    }

    private boolean metadataMayEllipsize(int id) {
        return id == R.id.dharma_title || id == R.id.dharma_artist || id == R.id.dharma_times
            || id == R.id.dharma_empty_queue || id == R.id.dharma_next_1_title
            || id == R.id.dharma_next_2_title || id == R.id.dharma_next_3_title;
    }

    private void everyVisibleTextFits(View root, View node) {
        if (node.getVisibility() != View.VISIBLE) return;
        if (node instanceof TextView && ((TextView) node).getText().length() > 0) {
            TextView text = (TextView) node;
            Rect rect = bounds(root, text);
            assertTrue("Text outside host: " + text.getText() + " " + rect,
                rect.left >= 0 && rect.top >= 0 && rect.right <= root.getWidth() && rect.bottom <= root.getHeight());
            assertNotNull("Missing text layout: " + text.getText(), text.getLayout());
            int availableHeight = text.getHeight() - text.getCompoundPaddingTop() - text.getCompoundPaddingBottom();
            assertTrue("Text clipped vertically: " + text.getText() + " layoutHeight=" + text.getLayout().getHeight()
                + " availableHeight=" + availableHeight, text.getLayout().getHeight() <= availableHeight);
            if (!metadataMayEllipsize(text.getId())) {
                for (int line = 0; line < text.getLayout().getLineCount(); line++) {
                    assertEquals("Primary header/action clipped: " + text.getText(), 0, text.getLayout().getEllipsisCount(line));
                    assertTrue("Primary header/action clipped horizontally: " + text.getText(),
                        text.getLayout().getLineWidth(line) <= text.getWidth() - text.getCompoundPaddingLeft() - text.getCompoundPaddingRight() + 1);
                }
            }
        }
        if (node instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) node;
            for (int child = 0; child < group.getChildCount(); child++) everyVisibleTextFits(root, group.getChildAt(child));
        }
    }

    @Test public void allFamiliesRetainReadableTitleAndFortyEightDpControlsAtBoundarySizes() throws Exception {
        int[][] sizes = {{110,110},{110,150},{110,180},{110,280},{149,180},{150,150},{150,180},{179,202},
            {230,110},{230,145},{250,154},{250,155},{230,190},{373,202},{260,250},{260,300},{260,345},{260,400},{373,400},{600,110}};
        for (boolean dark : new boolean[]{false,true}) for (float font : new float[]{1f,1.3f,1.5f})
          for (boolean ready : new boolean[]{false,true}) for (boolean sleepAtEnd : new boolean[]{false,true}) for (int repeatMode : new int[]{0,2}) for (int[] size : sizes) {
            View root = render(size[0],size[1],font,dark,ready,sleepAtEnd,repeatMode);
            try {
                visibleInside(root,R.id.dharma_play,true);
                titleReadable(root);
                everyVisibleTextFits(root, root);
                if (size[0] >= 230) {
                    visibleInside(root,R.id.dharma_back,true);
                    visibleInside(root,R.id.dharma_forward,true);
                }
                if (size[0] >= 260 && size[1] >= 250) {
                    visibleInside(root,R.id.dharma_repeat,true);
                    visibleInside(root,R.id.dharma_sleep,true);
                    for (int id : new int[]{R.id.dharma_next_1,R.id.dharma_next_2,R.id.dharma_next_3})
                        if (root.findViewById(id).getVisibility() == View.VISIBLE) visibleInside(root,id,true);
                    View empty = root.findViewById(R.id.dharma_empty_queue);
                    if (empty.getVisibility() == View.VISIBLE) visibleInside(root,R.id.dharma_empty_queue,false);
                }
            } catch (AssertionError failure) {
                throw new AssertionError("Audio " + size[0] + "x" + size[1] + " font=" + font + " dark=" + dark + " ready=" + ready + " sleepAtEnd=" + sleepAtEnd + " repeat=" + repeatMode + ": " + failure.getMessage(), failure);
            }
          }
    }
}
