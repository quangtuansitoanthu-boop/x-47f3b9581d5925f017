package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class DharmaAudioWidgetResumeTest {
    @Test public void widgetPlayRetriesIdleSourceErrorWithoutDiscardingQueueOrPosition() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(target.getCacheDir(), "widget-retry-test-" + System.nanoTime());
        assertTrue(directory.mkdir());
        Context isolated = new ContextWrapper(target) {
            @Override public File getNoBackupFilesDir() { return directory; }
            @Override public File getCacheDir() { return directory; }
        };
        File source = new File(directory, "retry-source.m4a");
        AtomicReference<ExoPlayer> playerRef = new AtomicReference<>();
        AtomicReference<DharmaPlaybackService> serviceRef = new AtomicReference<>();
        CountDownLatch failed = new CountDownLatch(1), ready = new CountDownLatch(1);
        String queueId = "widget-retry-local-only";
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                ExoPlayer player = new ExoPlayer.Builder(isolated)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(isolated)
                        .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(0)))
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), false)
                    .build();
                playerRef.set(player);
                player.setVolume(0);
                player.addListener(new Player.Listener() {
                    @Override public void onPlayerError(PlaybackException error) { failed.countDown(); }
                    @Override public void onPlaybackStateChanged(int state) {
                        if (state == Player.STATE_READY) ready.countDown();
                    }
                });
                // Không khởi động Service thật hoặc ghi snapshot vào owner đang chạy.
                DharmaPlaybackService service = new DharmaPlaybackService() {{ attachBaseContext(isolated); }};
                try {
                    java.lang.reflect.Field field = DharmaPlaybackService.class.getDeclaredField("player");
                    field.setAccessible(true); field.set(service, player);
                } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
                serviceRef.set(service);
                Bundle extras = new Bundle(); extras.putString("queueId", queueId); extras.putString("albumId", "widget-retry-local-album");
                MediaItem item = new MediaItem.Builder().setMediaId(Uri.fromFile(source).toString())
                    .setUri(Uri.fromFile(source)).setMediaMetadata(new MediaMetadata.Builder()
                        .setTitle("Local widget retry fixture").setExtras(extras).build()).build();
                player.setMediaItem(item, 35000);
                player.prepare(); player.play();
                DharmaAudioWidgetStore.invalidateQueue();
                Intent toggle = new Intent(DharmaAudioWidgetProvider.ACTION).putExtra("command", "toggle").putExtra("queueId", queueId);
                assertEquals(Player.STATE_BUFFERING, player.getPlaybackState());
                service.handleWidgetCommand(toggle);
                assertFalse("A repeated tap while buffering must still cancel playback", player.getPlayWhenReady());
                service.handleWidgetCommand(toggle);
                assertTrue(player.getPlayWhenReady());
            });
            assertTrue("The absent local source must produce an actual playback error", failed.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                ExoPlayer player = playerRef.get();
                assertEquals(Player.STATE_IDLE, player.getPlaybackState());
                assertNotNull(player.getPlayerError());
                assertTrue("Media3 retains playback intent after a source error", player.getPlayWhenReady());
                assertFalse("The widget currently displays a Play button", player.isPlaying());
                assertEquals(35000, player.getCurrentPosition());
                serviceRef.get().handleWidgetCommand(new Intent(DharmaAudioWidgetProvider.ACTION)
                    .putExtra("command", "toggle").putExtra("queueId", "stale-widget-queue"));
                assertTrue("A stale widget must not alter the current playback intent", player.getPlayWhenReady());
                assertEquals(35000, player.getCurrentPosition());
            });
            // Cùng URL nay có dữ liệu hợp lệ: retry không cần HTTP, tài khoản hay thay queue.
            try (InputStream input = target.getAssets().open("public/assets/audio/nhac-thien-02.m4a");
                 FileOutputStream output = new FileOutputStream(source)) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                ExoPlayer player = playerRef.get();
                DharmaAudioWidgetStore.invalidateQueue();
                serviceRef.get().handleWidgetCommand(new Intent(DharmaAudioWidgetProvider.ACTION)
                    .putExtra("command", "toggle").putExtra("queueId", queueId));
                assertTrue("One widget Play must retry an IDLE error, not pause retained playback intent", player.getPlayWhenReady());
                assertTrue("Widget retry must prepare the existing player", player.getPlaybackState() == Player.STATE_BUFFERING || player.getPlaybackState() == Player.STATE_READY);
                assertEquals(1, player.getMediaItemCount());
                assertEquals(queueId, player.getCurrentMediaItem().mediaMetadata.extras.getString("queueId"));
                assertEquals(35000, player.getCurrentPosition());
            });
            assertTrue("The same local file must become ready after one widget Play", ready.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                ExoPlayer player = playerRef.get();
                Intent toggle = new Intent(DharmaAudioWidgetProvider.ACTION).putExtra("command", "toggle").putExtra("queueId", queueId);
                serviceRef.get().handleWidgetCommand(toggle);
                assertFalse("An ordinary ready player must still pause", player.getPlayWhenReady());
                serviceRef.get().handleWidgetCommand(toggle);
                assertTrue("An ordinary paused player must still resume", player.getPlayWhenReady());
                assertEquals(queueId, player.getCurrentMediaItem().mediaMetadata.extras.getString("queueId"));
            });
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                if (playerRef.get() != null) playerRef.get().release();
                DharmaAudioWidgetStore.clear(isolated);
            });
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) assertTrue(file.delete());
            assertTrue(directory.delete());
        }
    }

    @Test public void unchangedPrincipalRefreshesWidgetsWithoutClearingTheSavedOwner() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(target.getCacheDir(), "widget-resume-test-" + System.nanoTime());
        assertTrue(directory.mkdir());
        File marker = new File(directory, "dharma-audio-principal-v1.txt");
        AtomicInteger lookups = new AtomicInteger();
        Context context = new ContextWrapper(target) {
            @Override public File getNoBackupFilesDir() { return directory; }
            @Override public Object getSystemService(String name) {
                if (Context.APPWIDGET_SERVICE.equals(name)) lookups.incrementAndGet();
                return super.getSystemService(name);
            }
        };
        try {
            try (FileOutputStream stream = new FileOutputStream(marker)) { stream.write("guest".getBytes(StandardCharsets.UTF_8)); }
            CountDownLatch resolved = new CountDownLatch(1);
            PluginCall call = new PluginCall(null, "DharmaAudio", "widget-resume-test", "selectPrincipal", new JSObject().put("principalKey", "guest")) {
                @Override public void resolve() { resolved.countDown(); }
            };
            DharmaAudioPlugin plugin = new DharmaAudioPlugin() {
                @Override public Context getContext() { return context; }
            };
            plugin.selectPrincipal(call);
            assertTrue("Unchanged principal selection did not resolve", resolved.await(5, TimeUnit.SECONDS));
            assertTrue("Reopening the app must refresh the existing widgets", lookups.get() > 0);
            int firstRefreshLookups = lookups.get();
            CountDownLatch repeated = new CountDownLatch(1);
            PluginCall repeatedCall = new PluginCall(null, "DharmaAudio", "widget-resume-repeat", "selectPrincipal", new JSObject().put("principalKey", "guest")) {
                @Override public void resolve() { repeated.countDown(); }
            };
            plugin.selectPrincipal(repeatedCall);
            assertTrue("Repeated principal selection did not resolve", repeated.await(5, TimeUnit.SECONDS));
            assertEquals("The same bridge must refresh a principal only once", firstRefreshLookups, lookups.get());
            assertTrue(marker.isFile());
            assertEquals(1, directory.listFiles().length);
            java.lang.reflect.Field generation = DharmaAudioPlugin.class.getDeclaredField("principalGeneration");
            generation.setAccessible(true); assertEquals(0, generation.getInt(plugin));
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {});
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) assertTrue(file.delete());
            assertTrue(directory.delete());
        }
    }
}
