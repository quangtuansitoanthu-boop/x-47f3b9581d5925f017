package vn.quangtu.tutam.audio;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.os.Handler;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** Âm phụ trộn cùng player chính, không xin audio focus riêng như WebView. */
final class PracticeSounds {
    private final Context context;
    private final Handler handler;
    private MediaPlayer ambient;
    private boolean ambientPrepared;
    private boolean suspended;
    private final Set<AudioTrack> cues = new HashSet<>();
    private final Set<AudioTrack> bowls = new HashSet<>();
    private final Set<MediaPlayer> beats = new HashSet<>();
    private final Map<Runnable, String> pending = new HashMap<>();

    PracticeSounds(Context context, Handler handler) { this.context = context; this.handler = handler; }

    void ambient(String source, float volume) throws Exception {
        if (!source.matches("/assets/audio/ambient/(tieng-mua-roi|tieng-on-trang|tieng-nuoc-chay|tieng-troi-mua-lon|tieng-troi-mua-nhe|am-thanh-mua-gio-va-sam-set)\\.mp3")) {
            throw new IllegalArgumentException("Invalid ambient source");
        }
        if (ambient != null) { ambient.release(); ambient = null; }
        ambientPrepared = false;
        MediaPlayer next = new MediaPlayer();
        ambient = next;
        try (AssetFileDescriptor asset = context.getAssets().openFd("public" + source)) {
            next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build());
            next.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
            next.setLooping(true);
            next.setVolume(volume, volume);
            next.setOnPreparedListener(player -> { if (ambient == player) { ambientPrepared = true; if (!suspended) player.start(); } });
            next.setOnErrorListener((player, what, extra) -> {
                if (ambient == player) { ambient = null; player.release(); }
                android.util.Log.w("PracticeSounds", "Ambient playback error: " + what);
                return true;
            });
            next.prepareAsync();
        } catch (Exception error) { next.release(); ambient = null; throw error; }
    }

    void cue(String kind, int delayMs) {
        if (!kind.equals("bell") && !kind.equals("bowl") && !kind.equals("khánh") && !kind.equals("wooden-fish")) throw new IllegalArgumentException("Invalid cue");
        if (suspended || pending.size() + cues.size() + bowls.size() + beats.size() >= 12) return;
        Runnable task = new Runnable() {
            @Override public void run() {
                pending.remove(this);
                if (kind.equals("wooden-fish")) { beat(); return; }
                try {
                    int rate = 22050;
                    double duration = kind.equals("bell") ? 1.8 : kind.equals("bowl") ? 10 : 0.75;
                    short[] samples = samples(kind, rate, duration);
                    AudioTrack track = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
                        .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                        .setBufferSizeInBytes(samples.length * 2).setTransferMode(AudioTrack.MODE_STATIC).build();
                    Set<AudioTrack> group = kind.equals("bowl") ? bowls : cues;
                    group.add(track);
                    track.write(samples, 0, samples.length);
                    track.play();
                    handler.postDelayed(() -> { if (group.remove(track)) track.release(); }, (long) (duration * 1000) + 100);
                } catch (RuntimeException error) {
                    stop("cue");
                    android.util.Log.w("PracticeSounds", "Cue playback unavailable", error);
                }
            }
        };
        pending.put(task, kind);
        handler.postDelayed(task, delayMs);
    }

    // Cùng tần số, hòa âm và đường bao của ambient-sound.ts/practice-audio.ts.
    static short[] samples(String kind, int rate, double duration) {
        boolean bowl = kind.equals("bowl");
        double[] frequencies = bowl ? new double[] {216, 216 * 2.76, 216 * 5.4, 216 * 8.9}
            : new double[] {kind.equals("bell") ? 660 : 880, (kind.equals("bell") ? 660 : 880) * 2.01};
        double[] peaks = bowl ? new double[] {0.45, 0.22, 0.12, 0.05} : new double[] {0.18, 0.05};
        double[] lengths = bowl ? new double[] {10, 7, 5, 3.5} : new double[] {duration, duration * 0.72};
        double attack = bowl ? 0.08 : 0.02;
        short[] result = new short[(int) (rate * duration)];
        for (int i = 0; i < result.length; i++) {
            double t = i / (double) rate;
            double value = 0;
            for (int h = 0; h < frequencies.length; h++) {
                if (t >= lengths[h]) continue;
                double envelope = t < attack ? 0.0001 + (peaks[h] - 0.0001) * t / attack
                    : peaks[h] * Math.pow(0.0001 / peaks[h], (t - attack) / (lengths[h] - attack));
                double cycles = bowl ? frequencies[h] * t
                    : frequencies[h] * Math.expm1(Math.log(0.86) * t / lengths[h]) / (Math.log(0.86) / lengths[h]);
                double wave = kind.equals("khánh") ? 2 * Math.asin(Math.sin(2 * Math.PI * cycles)) / Math.PI : Math.sin(2 * Math.PI * cycles);
                value += envelope * wave;
            }
            result[i] = (short) (32767 * (bowl ? 0.5 : 1) * Math.max(-1, Math.min(1, value)));
        }
        return result;
    }

    void suspend(boolean value) {
        suspended = value;
        if (value) stop("cue");
        if (ambient != null && ambientPrepared) {
            if (value) ambient.pause();
            else ambient.start();
        }
    }

    void volume(float value) { if (ambient != null) ambient.setVolume(value, value); }

    private void beat() {
        MediaPlayer next = new MediaPlayer();
        beats.add(next);
        try (AssetFileDescriptor asset = context.getAssets().openFd("public/assets/audio/tieng-mo.m4a")) {
            next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build());
            next.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
            next.setVolume(0.8f, 0.8f);
            next.setOnPreparedListener(player -> { if (beats.contains(player)) player.start(); });
            next.setOnCompletionListener(player -> { if (beats.remove(player)) player.release(); });
            next.setOnErrorListener((player, what, extra) -> { if (beats.remove(player)) player.release(); return true; });
            next.prepareAsync();
        } catch (Exception error) {
            if (beats.remove(next)) next.release();
            android.util.Log.w("PracticeSounds", "Wooden fish unavailable", error);
        }
    }

    void stop(String channel) {
        if (channel.equals("ambient")) {
            if (ambient != null) { ambient.release(); ambient = null; }
            ambientPrepared = false;
            pending.entrySet().removeIf(entry -> {
                if (!entry.getValue().equals("bowl")) return false;
                handler.removeCallbacks(entry.getKey()); return true;
            });
            for (AudioTrack track : bowls) track.release();
            bowls.clear();
        } else if (channel.equals("cue")) {
            for (Runnable task : pending.keySet()) handler.removeCallbacks(task);
            pending.clear();
            for (AudioTrack track : cues) track.release();
            cues.clear();
            for (AudioTrack track : bowls) track.release();
            bowls.clear();
            for (MediaPlayer player : beats) player.release();
            beats.clear();
        } else throw new IllegalArgumentException("Invalid sound channel");
    }

    void release() { stop("ambient"); stop("cue"); }
}
