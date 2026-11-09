package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class DharmaAudioWidgetLinkTest {
    private Uri opening(JSONObject state) throws Exception {
        Method method = DharmaAudioWidgetProvider.class.getDeclaredMethod("openingUri", JSONObject.class);
        method.setAccessible(true);
        return (Uri) method.invoke(null, state);
    }

    @Test public void opensTheSelectedAlbumOnTheExistingRoute() throws Exception {
        Uri uri = opening(new JSONObject().put("ready", true).put("albumId", "pt_current"));
        assertEquals("vn.quangtu.tutam", uri.getScheme());
        assertEquals("/phap-thoai", uri.getPath());
        assertEquals("pt_current", uri.getQueryParameter("album"));
    }

    @Test public void queryEncodingCannotCreateAnotherParameterOrFragment() throws Exception {
        String id = "album &next=other#fragment?";
        Uri uri = opening(new JSONObject().put("ready", true).put("albumId", id));
        assertEquals(id, uri.getQueryParameter("album"));
        assertNull(uri.getQueryParameter("next"));
        assertNull(uri.getFragment());
    }

    @Test public void missingOldAndInvalidStatesKeepTheGenericRoute() throws Exception {
        StringBuilder longId = new StringBuilder();
        for (int i = 0; i < 257; i++) longId.append('a');
        JSONObject[] invalid = {
            null, new JSONObject(), new JSONObject().put("ready", true),
            new JSONObject().put("ready", false).put("albumId", "pt_old"),
            new JSONObject().put("ready", true).put("albumId", JSONObject.NULL),
            new JSONObject().put("ready", true).put("albumId", 123),
            new JSONObject().put("ready", true).put("albumId", "   "),
            new JSONObject().put("ready", true).put("albumId", "pt_\ninvalid"),
            new JSONObject().put("ready", true).put("albumId", "pt_" + (char) 127),
            new JSONObject().put("ready", true).put("albumId", longId.toString())
        };
        for (JSONObject state : invalid) {
            Uri uri = opening(state);
            assertEquals("vn.quangtu.tutam:///phap-thoai", uri.toString());
            assertNull(uri.getQueryParameter("album"));
        }
        assertNotNull(opening(new JSONObject().put("ready", true).put("albumId", longId.substring(0, 256))).getQueryParameter("album"));
    }
}
