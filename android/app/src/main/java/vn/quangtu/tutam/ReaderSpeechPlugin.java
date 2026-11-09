package vn.quangtu.tutam;

import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

/** Device TTS only: no application server or D1 requests. */
@CapacitorPlugin(name = "ReaderSpeech")
public class ReaderSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<PluginCall> preparing = new ArrayList<>();
    private TextToSpeech engine;
    private boolean ready;
    private boolean destroyed;
    private long engineGeneration;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private PluginCall speaking;
    private String utteranceId;

    @PluginMethod
    public void prepare(PluginCall call) {
        main.post(() -> {
            if (destroyed) { call.reject("Reader closed", "CLOSED"); return; }
            if (ready) { call.resolve(); return; }
            preparing.add(call);
            if (engine != null) return;
            final long generation = ++engineGeneration;
            try {
                engine = new TextToSpeech(getContext(), status -> main.post(() -> {
                    if (destroyed || engine == null || generation != engineGeneration) return;
                    ready = status == TextToSpeech.SUCCESS;
                    if (ready) {
                        engine.setAudioAttributes(readerAudioAttributes());
                        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override public void onStart(String id) { main.post(() -> {
                                if (id.equals(utteranceId)) { JSObject data = new JSObject(); data.put("id", id); notifyListeners("speechStart", data); }
                            }); }
                            @Override public void onDone(String id) { main.post(() -> complete(id, null)); }
                            @Override public void onError(String id) { main.post(() -> complete(id, "SYNTHESIS_FAILED")); }
                            @Override public void onError(String id, int error) { main.post(() -> complete(id,
                                error == TextToSpeech.ERROR_NOT_INSTALLED_YET ? "MISSING_VOICE" :
                                error == TextToSpeech.ERROR_NETWORK || error == TextToSpeech.ERROR_NETWORK_TIMEOUT ? "NETWORK_ERROR" : "SYNTHESIS_FAILED")); }
                        });
                    }
                    finishPreparing(ready);
                    if (!ready) { engine.shutdown(); engine = null; }
                }));
                final TextToSpeech initializing = engine;
                main.postDelayed(() -> {
                    if (!ready && generation == engineGeneration && engine == initializing) {
                        engineGeneration++;
                        finishPreparing(false);
                        engine.shutdown(); engine = null;
                    }
                }, 10000);
            } catch (Exception error) { engineGeneration++; finishPreparing(false); engine = null; }
        });
    }

    private void finishPreparing(boolean success) {
        for (PluginCall call : preparing) {
            if (success) call.resolve(); else call.reject("No speech engine available", "MISSING_ENGINE");
        }
        preparing.clear();
    }

    private AudioAttributes readerAudioAttributes() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    }

    private boolean acquireAudioFocus(String id) {
        try {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return false;
            audioFocusListener = change -> main.post(() -> {
                if (change < 0 && id.equals(utteranceId)) stopCurrent();
            });
            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(readerAudioAttributes())
                    .setOnAudioFocusChangeListener(audioFocusListener, main).build();
                result = audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                result = audioManager.requestAudioFocus(audioFocusListener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN);
            }
            if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return true;
        } catch (Exception unavailable) {
            // Không phát khi hệ điều hành không cấp quyền sở hữu âm thanh.
        }
        releaseAudioFocus();
        return false;
    }

    private void releaseAudioFocus() {
        AudioFocusRequest request = audioFocusRequest;
        AudioManager.OnAudioFocusChangeListener listener = audioFocusListener;
        audioFocusRequest = null; audioFocusListener = null;
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && request != null) {
                audioManager.abandonAudioFocusRequest(request);
            } else if (listener != null) {
                audioManager.abandonAudioFocus(listener);
            }
        } catch (Exception unavailable) {
            // Dọn lượt đọc vẫn hoàn tất khi dịch vụ âm thanh đã đóng.
        }
    }

    private static Voice selectOfflineVoice(Set<Voice> voices, Locale language, Voice current) {
        Voice selected = null;
        int selectedPriority = Integer.MAX_VALUE;
        if (voices == null) return null;
        // Stream/Comparator cần API 24; vòng lặp giữ cùng thứ tự ưu tiên trên API 23.
        for (Voice voice : voices) {
            if (!voice.getLocale().getLanguage().equals(language.getLanguage())
                || voice.isNetworkConnectionRequired()
                || (voice.getFeatures() != null && voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) continue;
            int priority = (voice.getLocale().equals(language) ? 0 : 2) + (voice.equals(current) ? 0 : 1);
            if (selected == null || priority < selectedPriority
                || (priority == selectedPriority && voice.getName().compareTo(selected.getName()) < 0)) {
                selected = voice;
                selectedPriority = priority;
            }
        }
        return selected;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        main.post(() -> {
            if (!ready || engine == null) { call.reject("Speech engine unavailable", "MISSING_ENGINE"); return; }
            String text = call.getString("text", "");
            String id = call.getString("id", "");
            if (text.trim().isEmpty() || text.length() > TextToSpeech.getMaxSpeechInputLength() || id.isEmpty()) {
                call.reject("Invalid speech text", "INVALID_TEXT"); return;
            }
            stopCurrent();
            Locale language = Locale.forLanguageTag(call.getString("language", "vi-VN"));
            int result = engine.setLanguage(language);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("Voice data is not installed for this language", "MISSING_VOICE"); return;
            }
            // Ưu tiên giọng đã cài để không phụ thuộc mạng hoặc tải dữ liệu ngầm khi đọc.
            if (engine.getVoices() != null) {
                Voice offline = selectOfflineVoice(engine.getVoices(), language, engine.getVoice());
                if (offline != null && engine.setVoice(offline) == TextToSpeech.ERROR) {
                    call.reject("Offline voice unavailable", "MISSING_VOICE"); return;
                }
            }
            // Giữ giọng mặc định của bộ đọc theo ngôn ngữ, không giả lập giới tính bằng cao độ.
            engine.setSpeechRate(Math.max(0.3f, Math.min(2f, call.getFloat("rate", 1f))));
            engine.setPitch(1f);
            if (!acquireAudioFocus(id)) { call.reject("Audio focus unavailable", "AUDIO_FOCUS_DENIED"); return; }
            speaking = call;
            utteranceId = id;
            try {
                if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id) == TextToSpeech.ERROR) complete(id, "SYNTHESIS_FAILED");
            } catch (Exception unavailable) { complete(id, "SYNTHESIS_FAILED"); }
        });
    }

    private void complete(String id, String error) {
        if (!id.equals(utteranceId) || speaking == null) return;
        PluginCall call = speaking;
        speaking = null; utteranceId = null;
        releaseAudioFocus();
        if (error == null) call.resolve(); else call.reject("Cannot synthesize speech", error);
    }

    private void stopCurrent() {
        PluginCall call = speaking;
        speaking = null; utteranceId = null;
        try { if (engine != null) engine.stop(); } catch (Exception unavailable) { /* Engine đã đóng. */ }
        releaseAudioFocus();
        if (call != null) { JSObject result = new JSObject(); result.put("canceled", true); call.resolve(result); }
    }

    @PluginMethod
    public void openSettings(PluginCall call) { main.post(() -> {
        try {
            getActivity().startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
            call.resolve();
        } catch (Exception unavailable) {
            try { getActivity().startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); call.resolve(); }
            catch (Exception error) { call.reject("Cannot open speech settings", "SETTINGS_UNAVAILABLE"); }
        }
    }); }

    @PluginMethod
    public void stop(PluginCall call) { main.post(() -> {
        String id = call.getString("id");
        if (id == null || id.equals(utteranceId)) stopCurrent();
        call.resolve();
    }); }

    @Override protected void handleOnDestroy() {
        main.post(() -> {
            destroyed = true;
            engineGeneration++;
            stopCurrent(); finishPreparing(false);
            if (engine != null) engine.shutdown();
            engine = null; ready = false;
        });
    }
}
