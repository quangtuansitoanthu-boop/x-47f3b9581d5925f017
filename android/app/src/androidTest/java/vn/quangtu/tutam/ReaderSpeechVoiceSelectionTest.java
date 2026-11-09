package vn.quangtu.tutam;

import static org.junit.Assert.*;

import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ReaderSpeechVoiceSelectionTest {
    private final Locale language = Locale.forLanguageTag("vi-VN");

    private Voice voice(String name, Locale locale, boolean network, Set<String> features) {
        return new Voice(name, locale, Voice.QUALITY_NORMAL, Voice.LATENCY_NORMAL, network, features);
    }

    private Voice select(Voice current, Voice... voices) throws Exception {
        Method method = ReaderSpeechPlugin.class.getDeclaredMethod("selectOfflineVoice", Set.class, Locale.class, Voice.class);
        method.setAccessible(true);
        return (Voice) method.invoke(null, new LinkedHashSet<>(Arrays.asList(voices)), language, current);
    }

    @Test public void exactLocaleWinsBeforeCurrentVoice() throws Exception {
        Voice current = voice("a-current", Locale.forLanguageTag("vi-US"), false, Collections.emptySet());
        Voice exact = voice("z-exact", language, false, Collections.emptySet());
        assertSame(exact, select(current, current, exact));
    }

    @Test public void currentVoiceWinsBeforeLexicalNameForTheSameLocale() throws Exception {
        Voice current = voice("z-current", language, false, Collections.emptySet());
        Voice other = voice("a-other", language, false, Collections.emptySet());
        assertSame(current, select(current, other, current));
    }

    @Test public void lexicalTieBreakDoesNotDependOnSetOrder() throws Exception {
        Voice first = voice("a-offline", language, false, Collections.emptySet());
        Voice last = voice("z-offline", language, false, Collections.emptySet());
        assertSame(first, select(null, last, first));
        assertSame(first, select(null, first, last));
    }

    @Test public void excludesNetworkUninstalledAndOtherLanguages() throws Exception {
        Voice network = voice("a-network", language, true, Collections.emptySet());
        Voice missing = voice("a-missing", language, false, Collections.singleton(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
        Voice english = voice("a-english", Locale.US, false, Collections.emptySet());
        Voice offline = voice("z-offline", language, false, Collections.emptySet());
        assertSame(offline, select(network, network, missing, english, offline));
        assertNull(select(network, network, missing, english));
        assertNull(select(null));
    }
}
