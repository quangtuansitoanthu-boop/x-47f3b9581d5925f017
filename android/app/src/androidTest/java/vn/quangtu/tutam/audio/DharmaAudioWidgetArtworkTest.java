package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import androidx.media3.common.util.BitmapLoader;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.SettableFuture;
import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class DharmaAudioWidgetArtworkTest {
    private Context context;
    private File directory;
    private static final String REMOTE = "https://media.quangtu.vn/covers/__widget_cover_test_missing__.png";

    @Before public void setup() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        directory = new File(target.getCacheDir(), "widget-cover-test-" + System.nanoTime());
        assertTrue(directory.mkdir());
        context = new ContextWrapper(target) {
            @Override public File getNoBackupFilesDir() { return directory; }
        };
    }

    private Class<?> owner() throws Exception { return Class.forName("vn.quangtu.tutam.audio.DharmaAudioWidgetArtwork"); }
    private Object invoke(String name, Class<?>[] types, Object... values) throws Exception {
        Method method = owner().getDeclaredMethod(name, types); method.setAccessible(true);
        return method.invoke(null, values);
    }
    private void clear() throws Exception { invoke("clear", new Class<?>[]{Context.class}, context); }
    private String safe(String value) throws Exception { return (String) invoke("safeUri", new Class<?>[]{Context.class, String.class}, context, value); }
    private JSONObject state(String album, String artwork) throws Exception {
        return new JSONObject().put("ready", true).put("albumId", album).put("artwork", artwork).put("originalArtwork", artwork);
    }
    private Bitmap image(JSONObject state) throws Exception { return (Bitmap) invoke("bitmap", new Class<?>[]{Context.class, JSONObject.class}, context, state); }
    private void request(String queue, String album, String artwork, DeferredLoader loader, CountDownLatch changed) throws Exception {
        Class<?> guard = Class.forName("vn.quangtu.tutam.audio.DharmaAudioWidgetArtwork$Guard");
        Object alive = Proxy.newProxyInstance(guard.getClassLoader(), new Class<?>[]{guard}, (proxy, method, args) -> true);
        invoke("request", new Class<?>[]{Context.class, String.class, String.class, String.class, String.class, BitmapLoader.class, guard, Runnable.class},
            context, queue, album, artwork, artwork, loader, alive, (Runnable) changed::countDown);
    }
    private static final class DeferredLoader implements BitmapLoader {
        final SettableFuture<Bitmap> result = SettableFuture.create();
        final CountDownLatch started = new CountDownLatch(1);
        volatile int calls;
        public boolean supportsMimeType(String mimeType) { return true; }
        public ListenableFuture<Bitmap> decodeBitmap(byte[] data) { return result; }
        public ListenableFuture<Bitmap> loadBitmap(Uri uri) { calls++; started.countDown(); return result; }
    }
    private Bitmap solid(int color) {
        Bitmap image = Bitmap.createBitmap(1024, 768, Bitmap.Config.ARGB_8888); image.eraseColor(color); return image;
    }

    @After public void cleanup() throws Exception {
        try { clear(); } catch (ClassNotFoundException ignored) { }
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) assertTrue(file.delete());
        assertTrue(directory.delete());
    }

    @Test public void rejectsBrandingCredentialsAndQueryUrls() throws Exception {
        assertEquals("", safe("asset:///public/assets/branding/tu-tap-logo.png"));
        assertEquals("", safe("/assets/branding/tu-tap-logo.png"));
        assertEquals("", safe("https://media.quangtu.vn/covers/a.png?token=secret"));
        assertEquals("", safe("https://user:password@example.test/a.png"));
        assertEquals("", safe("file:///sdcard/private-cover.png"));
        assertEquals("asset:///public/covers/a.webp", safe("/covers/a.webp"));
        String wordpress = "https://i0.wp.com/tinhtan.org/wp-content/uploads/2019/08/HT.-Th%C3%ADch-H%E1%BA%A3i-Quang.jpg";
        assertEquals(wordpress, safe(wordpress + "?resize=699%2C1024&ssl=1#pos=53%25%2014%25"));
        assertEquals("", safe(wordpress + "?resize=699%2C1024&token=secret"));
        assertEquals("", safe(wordpress + "?resize=699x1024&ssl=1"));
        assertEquals("", safe(wordpress + "?resize=699%2C1024&ssl=0"));
        assertEquals("", safe("https://example.test/a.jpg?resize=699%2C1024&ssl=1"));
    }

    @Test public void oldSnapshotsStayNeutralAndLocalPreviewDoesNotPersistOrLoadHttp() throws Exception {
        JSONObject old = new JSONObject().put("ready", true).put("albumId", "old-album");
        String before = old.toString(); assertNull(image(old)); assertEquals(before, old.toString());
        String[] covers = context.getAssets().list("public/covers");
        String cover = null;
        for (String candidate : covers) if (candidate.endsWith(".png") || candidate.endsWith(".webp") || candidate.endsWith(".jpg")) { cover = candidate; break; }
        assertNotNull(cover);
        Bitmap decoded = image(state("preview-album", "asset:///public/covers/" + cover));
        assertNotNull(decoded); assertTrue(decoded.getWidth() <= 256); assertTrue(decoded.getHeight() <= 256);
        assertEquals(0, directory.listFiles().length);
    }

    @Test public void sharesOneRequestAndPersistsABoundedCurrentThumbnail() throws Exception {
        clear(); DeferredLoader loader = new DeferredLoader(); CountDownLatch changed = new CountDownLatch(1);
        request("queue", "album", REMOTE, loader, changed);
        assertTrue(loader.started.await(5, TimeUnit.SECONDS));
        request("queue", "album", REMOTE, loader, changed);
        loader.result.set(solid(Color.BLUE));
        assertTrue(changed.await(5, TimeUnit.SECONDS)); assertEquals(1, loader.calls);
        Bitmap result = image(state("album", REMOTE));
        assertNotNull(result); assertTrue(result.getWidth() <= 256); assertTrue(result.getHeight() <= 256);
        File[] files = directory.listFiles(); assertEquals(1, files.length); assertTrue(files[0].length() <= 512 * 1024);
    }

    @Test public void latePreviousQueueArtworkCannotReplaceTheCurrentAlbum() throws Exception {
        clear(); DeferredLoader old = new DeferredLoader(); DeferredLoader next = new DeferredLoader();
        CountDownLatch oldChanged = new CountDownLatch(1); CountDownLatch nextChanged = new CountDownLatch(1);
        request("old-queue", "old-album", REMOTE, old, oldChanged);
        assertTrue(old.started.await(5, TimeUnit.SECONDS));
        request("next-queue", "next-album", REMOTE + ".other", next, nextChanged);
        assertTrue(next.started.await(5, TimeUnit.SECONDS));
        old.result.set(solid(Color.RED)); next.result.set(solid(Color.BLUE));
        assertTrue(nextChanged.await(5, TimeUnit.SECONDS));
        assertFalse(oldChanged.await(200, TimeUnit.MILLISECONDS));
        assertEquals(Color.BLUE, image(state("next-album", REMOTE + ".other")).getPixel(0, 0));
        assertNull(image(state("old-album", REMOTE)));
    }

    @Test public void clearingThePrincipalRejectsThePendingCover() throws Exception {
        clear(); DeferredLoader loader = new DeferredLoader(); CountDownLatch changed = new CountDownLatch(1);
        request("queue", "album", REMOTE, loader, changed);
        assertTrue(loader.started.await(5, TimeUnit.SECONDS)); clear(); loader.result.set(solid(Color.RED));
        assertFalse(changed.await(300, TimeUnit.MILLISECONDS));
        assertNull(image(state("album", REMOTE))); assertEquals(0, directory.listFiles().length);
    }
}
