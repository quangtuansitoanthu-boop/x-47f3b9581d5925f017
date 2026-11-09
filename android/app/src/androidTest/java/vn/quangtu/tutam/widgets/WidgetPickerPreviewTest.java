package vn.quangtu.tutam.widgets;

import static org.junit.Assert.*;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import vn.quangtu.tutam.R;
import vn.quangtu.tutam.audio.DharmaAudioWidgetProvider;

@RunWith(AndroidJUnit4.class)
public class WidgetPickerPreviewTest {
    @Test public void everyFamilyHasOldAndroidImageAndScalablePickerPreview() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        int count = 0;
        for (AppWidgetProviderInfo info : AppWidgetManager.getInstance(context).getInstalledProviders()) {
            if (!context.getPackageName().equals(info.provider.getPackageName())) continue;
            count++;
            assertTrue("Missing legacy picker image: " + info.provider, info.previewImage != 0);
            Bitmap image = BitmapFactory.decodeResource(context.getResources(), info.previewImage);
            assertNotNull("Unreadable picker image: " + info.provider, image);
            assertTrue(image.getWidth() >= 300 && image.getHeight() >= 300);
            image.recycle();
            if (Build.VERSION.SDK_INT >= 31) {
                assertTrue("Missing picker layout: " + info.provider, info.previewLayout != 0);
                assertNotEquals("Picker must not depend on empty runtime bindings", info.initialLayout, info.previewLayout);
                new RemoteViews(context.getPackageName(), info.previewLayout)
                    .apply(context, new FrameLayout(context));
            }
        }
        assertEquals("All three families and sizes must be registered", 9, count);
    }

    @Test public void exportNativePickerAssetsWhenRequested() throws Exception {
        if (!"true".equals(InstrumentationRegistry.getArguments().getString("exportPickerPreviews"))) return;
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Mẫu chỉ render trong test để xuất asset; không ghi snapshot hoặc đọc thông tin tài khoản.
        JSONObject day = new JSONObject().put("date", "2026-11-02")
            .put("solarDate", "Xem trước · 02/11/2026").put("solarDateShort", "02/11/2026")
            .put("lunarDay", "24").put("lunarMonthYear", "Tháng 09 • Bính Ngọ")
            .put("fastingNote", "Ăn chay, làm lành").put("thoKhangNote", "Kiêng hành dâm")
            .put("buddhistHoliday", "Ngày vía (mẫu)").put("personalEventCount", 2)
            .put("personalEvents", new JSONArray().put(new JSONObject().put("id", "preview-event")
                .put("title", "Ngày kỷ niệm (mẫu)").put("note", "Kỷ niệm tu học").put("type", "khac"))
                .put(new JSONObject().put("id", "preview-event-2").put("title", "Nhắc việc (mẫu)")
                    .put("note", "Tinh tấn mỗi ngày").put("type", "khac")));
        JSONObject audio = new JSONObject().put("ready", true).put("playing", false)
            .put("title", "Ngọc Lịch Bửu Phiêu (mẫu)").put("artist", "Xem trước · Đạm Si")
            .put("albumId", "preview-album")
            .put("artwork", "asset:///public/covers/07547976-75b1-4e3b-955d-059ba9f8417a-Anh-chup-man-hinh-2026-09-07-162538.png")
            .put("originalArtwork", "/covers/07547976-75b1-4e3b-955d-059ba9f8417a-Anh-chup-man-hinh-2026-09-07-162538.png")
            .put("queueId", "picker-preview-only").put("position", 755000).put("duration", 2700000)
            .put("repeat", 0).put("sleepRemainingMs", 1800000)
            .put("next", new JSONArray().put(new JSONObject().put("index", 1)
                .put("trackId", "preview-track").put("title", "Giữ tâm an lành (mẫu)"))
                .put(new JSONObject().put("index", 2).put("trackId", "preview-track-2").put("title", "Thực hành lòng từ bi (mẫu)"))
                .put(new JSONObject().put("index", 3).put("trackId", "preview-track-3").put("title", "Tinh tấn mỗi ngày (mẫu)")));
        Method calendar = BuddhistCalendarWidgetProvider.class.getDeclaredMethod("layout", Context.class,
            JSONObject.class, JSONObject.class, String.class, int.class);
        Method practice = PracticeWidgetProvider.class.getDeclaredMethod("render", Context.class, JSONObject.class, int.class);
        Method dharma = DharmaAudioWidgetProvider.class.getDeclaredMethod("views", Context.class, int.class, JSONObject.class, int.class);
        calendar.setAccessible(true); practice.setAccessible(true); dharma.setAccessible(true);
        String[] sizes = {"small", "medium", "large"};
        // Kích thước native hợp lệ: Medium đủ chỗ footer48dp, Large đủ ba hàng48dp.
        int[] widths = {172, 360, 360}, heights = {180, 202, 400};
        int[] calendars = {R.layout.buddhist_calendar_small, R.layout.buddhist_calendar_medium, R.layout.buddhist_calendar_large};
        int[] audios = {R.layout.dharma_audio_small, R.layout.dharma_audio_medium_tall, R.layout.dharma_audio_large};
        for (boolean dark : new boolean[]{false, true}) {
            Configuration configuration = new Configuration(target.getResources().getConfiguration());
            configuration.densityDpi = 320;
            configuration.fontScale = 1f;
            configuration.uiMode = (configuration.uiMode & ~Configuration.UI_MODE_NIGHT_MASK)
                | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
            Context context = target.createConfigurationContext(configuration);
            File directory = new File(target.getFilesDir(), "picker-previews/" + (dark ? "dark" : "light"));
            assertTrue(directory.isDirectory() || directory.mkdirs());
            for (int i = 0; i < sizes.length; i++) {
                render(context, (RemoteViews) calendar.invoke(null, context, day, null, "2026-11-02", calendars[i]),
                    widths[i], heights[i], new File(directory, "widget_preview_calendar_" + sizes[i] + ".png"));
                render(context, (RemoteViews) practice.invoke(null, context, null, i),
                    widths[i], heights[i], new File(directory, "widget_preview_practice_" + sizes[i] + ".png"));
                render(context, (RemoteViews) dharma.invoke(null, context, audios[i], audio, heights[i]),
                    widths[i], heights[i], new File(directory, "widget_preview_audio_" + sizes[i] + ".png"));
            }
            if ("true".equals(InstrumentationRegistry.getArguments().getString("exportResponsivePreviews"))) {
                Method practiceSize = PracticeWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
                Method audioSize = DharmaAudioWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
                Method audioRender = DharmaAudioWidgetProvider.class.getDeclaredMethod("render", Context.class, JSONObject.class, int.class, int.class);
                practiceSize.setAccessible(true); audioSize.setAccessible(true); audioRender.setAccessible(true);
                for (float font : new float[]{1f, 1.5f}) {
                    configuration.fontScale = font;
                    Context sized = target.createConfigurationContext(configuration);
                    for (int[] bounds : new int[][]{{110,110},{110,180},{250,150},{260,340}}) {
                        String name = "responsive_" + bounds[0] + "x" + bounds[1] + "_font" + Math.round(font * 100);
                        render(sized, (RemoteViews)practice.invoke(null, sized, null, (int)practiceSize.invoke(null, bounds[0], bounds[1])),
                            bounds[0], bounds[1], new File(directory, name + "_practice.png"));
                        render(sized, (RemoteViews)audioRender.invoke(null, sized, audio, (int)audioSize.invoke(null, bounds[0], bounds[1]), bounds[1]),
                            bounds[0], bounds[1], new File(directory, name + "_audio.png"));
                    }
                }
            }
        }
    }

    private void render(Context context, RemoteViews remote, int width, int height, File file) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(width * 2, height * 2, Bitmap.Config.ARGB_8888);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View view = remote.apply(context, new FrameLayout(context));
            view.measure(View.MeasureSpec.makeMeasureSpec(width * 2, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height * 2, View.MeasureSpec.EXACTLY));
            view.layout(0, 0, width * 2, height * 2);
            view.draw(new Canvas(bitmap));
        });
        try (FileOutputStream output = new FileOutputStream(file)) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)); }
        finally { bitmap.recycle(); }
    }
}
