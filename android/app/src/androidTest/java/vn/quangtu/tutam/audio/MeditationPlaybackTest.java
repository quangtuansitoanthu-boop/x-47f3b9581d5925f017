package vn.quangtu.tutam.audio;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class MeditationPlaybackTest {
    private <T> T onMain(Supplier<T> action) {
        AtomicReference<T> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> value.set(action.get()));
        return value.get();
    }

    private void await(Supplier<Boolean> condition, long limitMs) {
        long deadline = SystemClock.elapsedRealtime() + limitMs;
        while (!onMain(condition) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
        assertTrue(onMain(condition));
    }

    @Test public void bundledMusicAndSleepTimerRunWithoutWebViewAndPauseTogether() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".securityqa"));
        // Test không mở Activity/WebView hay gọi mạng; shell cho phép khởi tạo service từ instrumentation.
        InstrumentationRegistry.getInstrumentation().getUiAutomation().adoptShellPermissionIdentity();
        MediaController controller = null;
        try {
            ListenableFuture<MediaController> future = onMain(() -> new MediaController.Builder(context,
                new SessionToken(context, new ComponentName(context, DharmaPlaybackService.class))).buildAsync());
            controller = future.get(10, TimeUnit.SECONDS);
            final MediaController player = controller;
            onMain(() -> {
                player.setVolume(0);
                player.setMediaItem(MediaItem.fromUri("asset:///public/assets/audio/nhac-thien-01.m4a"));
                player.setRepeatMode(Player.REPEAT_MODE_ONE);
                player.prepare();
                player.play();
                return null;
            });
            await(player::isPlaying, 10_000);
            onMain(() -> { DharmaPlaybackService.active.setSleep(2_500, false); return null; });
            SystemClock.sleep(600);
            onMain(() -> { player.pause(); return null; });
            await(() -> !player.isPlaying(), 2_000);
            long remaining = onMain(() -> DharmaPlaybackService.active.getSleepRemainingMs());
            assertTrue(remaining > 0 && remaining <= 2_500);
            SystemClock.sleep(1_500);
            assertEquals(remaining, (long) onMain(() -> DharmaPlaybackService.active.getSleepRemainingMs()));
            onMain(() -> { player.play(); return null; });
            await(() -> DharmaPlaybackService.active.getSleepRemainingMs() == 0 && !player.getPlayWhenReady(), 6_000);
        } finally {
            final MediaController release = controller;
            onMain(() -> {
                if (release != null) { release.stop(); release.release(); }
                context.stopService(new Intent(context, DharmaPlaybackService.class));
                return null;
            });
            InstrumentationRegistry.getInstrumentation().getUiAutomation().dropShellPermissionIdentity();
        }
    }
}
