package vn.quangtu.tutam.widgets;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.res.Configuration;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import vn.quangtu.tutam.R;

@RunWith(AndroidJUnit4.class)
public class PracticeWidgetLayoutTest {
    private View render(int widthDp, int heightDp, boolean dark, float font, JSONObject data) throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Configuration config = new Configuration(target.getResources().getConfiguration());
        config.fontScale = font;
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK)
            | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        Context context = target.createConfigurationContext(config);
        Method select = PracticeWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
        Method render = PracticeWidgetProvider.class.getDeclaredMethod("render", Context.class, JSONObject.class, int.class);
        select.setAccessible(true); render.setAccessible(true);
        RemoteViews remote = (RemoteViews)render.invoke(null, context, data, (int)select.invoke(null, widthDp, heightDp));
        View[] result = new View[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View view = remote.apply(context, new FrameLayout(context));
            float density = context.getResources().getDisplayMetrics().density;
            int width = Math.round(widthDp * density), height = Math.round(heightDp * density);
            view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            view.layout(0, 0, width, height); view.setTag(widthDp+"x"+heightDp+" font="+font+" dark="+dark); result[0] = view;
        });
        return result[0];
    }

    private List<View> all(View root, int id) {
        List<View> result = new ArrayList<>();
        if (root.getId() == id) result.add(root);
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)root;
            for (int i=0; i<group.getChildCount(); i++) result.addAll(all(group.getChildAt(i), id));
        }
        return result;
    }

    private void inside(View root, View view) {
        assertEquals(View.VISIBLE, view.getVisibility());
        int left=view.getLeft(), top=view.getTop();
        android.view.ViewParent parent=view.getParent();
        while(parent instanceof View && parent!=root) {left+=((View)parent).getLeft(); top+=((View)parent).getTop(); parent=parent.getParent();}
        assertTrue("View left outside host "+root.getTag(), left>=0);
        assertTrue("View above host "+root.getTag(), top>=0);
        assertTrue("View right outside host "+root.getTag(), left+view.getWidth()<=root.getWidth());
        assertTrue("View below host "+root.getTag(), top+view.getHeight()<=root.getHeight());
        assertTrue("View has no height "+root.getTag(), view.getHeight()>0);
    }

    private void uncut(TextView view) {
        assertNotNull(view.getLayout());
        for(int line=0;line<view.getLayout().getLineCount();line++)
            assertEquals("Primary text clipped: "+view.getText()+" "+view.getRootView().getTag(),0,view.getLayout().getEllipsisCount(line));
        assertTrue("Primary text height clipped: "+view.getText()+" "+view.getRootView().getTag(), view.getLayout().getHeight()<=view.getHeight()-view.getCompoundPaddingTop()-view.getCompoundPaddingBottom());
    }

    private void standardTextFits(View root, View node) {
        if(node.getVisibility()!=View.VISIBLE) return;
        if(node instanceof TextView) {
            TextView text=(TextView)node;
            inside(root,text);
            assertNotNull(text.getLayout());
            assertTrue("Standard label height clipped: "+text.getText()+" "+root.getTag()+" layoutHeight="+text.getLayout().getHeight()+" availableHeight="+(text.getHeight()-text.getCompoundPaddingTop()-text.getCompoundPaddingBottom()), text.getLayout().getHeight()<=text.getHeight()-text.getCompoundPaddingTop()-text.getCompoundPaddingBottom());
            if(text.getId()!=R.id.practice_widget_summary) uncut(text);
        }
        if(node instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)node;
            for(int i=0;i<group.getChildCount();i++) standardTextFits(root,group.getChildAt(i));
        }
    }

    @Test public void smallActionFitsNarrowSquareAndTallHostsInBothThemesAndLargeText() throws Exception {
        for(boolean dark:new boolean[]{false,true}) for(float font:new float[]{1f,1.3f,1.5f}) {
            for(int[] host:new int[][]{{110,110},{110,180},{140,280},{155,180},{179,202},{230,150},{230,340},{373,110},{800,110}}) {
                View root=render(host[0],host[1],dark,font,null);
                View action=root.findViewById(R.id.practice_widget_start);
                assertNotNull(action); inside(root,action);
                assertTrue("Action must retain48dp at "+host[0]+"x"+host[1]+" font="+font,action.getHeight()/root.getResources().getDisplayMetrics().density>=47.5f);
                assertTrue(action.hasOnClickListeners()); uncut((TextView)action);
                inside(root,root.findViewById(R.id.practice_widget_summary));
                standardTextFits(root,root);
            }
        }
    }

    @Test public void mediumAndLargeKeepFourReadableToolsAndTouchTargets() throws Exception {
        for(boolean dark:new boolean[]{false,true}) for(float font:new float[]{1f,1.3f,1.5f}) {
            for(int[] host:new int[][]{{250,150},{250,180},{373,202},{600,150},{250,340},{373,400},{600,400}}) {
                View root=render(host[0],host[1],dark,font,null);
                List<View> tools=all(root,R.id.practice_widget_item);
                assertEquals("Keep all4tools",4,tools.size());
                for(View tool:tools) {
                    inside(root,tool);
                    assertTrue("Tool must retain48dp at "+host[0]+"x"+host[1]+" font="+font+" actualDp="+(tool.getHeight()/root.getResources().getDisplayMetrics().density),tool.getHeight()/root.getResources().getDisplayMetrics().density>=47.5f);
                    assertTrue(tool.hasOnClickListeners());
                    uncut(tool.findViewById(R.id.practice_widget_item_title));
                }
                inside(root,root.findViewById(R.id.practice_widget_summary));
                standardTextFits(root,root);
            }
        }
    }

    @Test public void longOwnerTitlesRetainCompleteAccessibilityAndOpenAction() throws Exception {
        String title="Tên công cụ tu tập kiểm thử có nội dung rất dài để kiểm tra bố cục";
        JSONObject data=new JSONObject().put("hasData",true).put("completedCount",2).put("totalCount",4)
            .put("items",new JSONArray().put(new JSONObject().put("id","meditation").put("title",title)));
        for(int[] host:new int[][]{{250,150},{373,202},{250,340},{373,400}}) {
            View root=render(host[0],host[1],true,1.3f,data);
            List<View> tools=all(root,R.id.practice_widget_item);
            assertEquals(4,tools.size());
            assertTrue(tools.get(0).getContentDescription().toString().contains(title));
            for(View tool:tools) {inside(root,tool);assertTrue(tool.hasOnClickListeners());}
            assertEquals("2/4 hoàn thành",((TextView)root.findViewById(R.id.practice_widget_summary)).getText().toString());
        }
    }
}
