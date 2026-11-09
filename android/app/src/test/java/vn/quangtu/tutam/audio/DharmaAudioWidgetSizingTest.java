package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;
import java.lang.reflect.Method;
import org.junit.Test;

public class DharmaAudioWidgetSizingTest {
    private int size(int width, int height) throws Exception {
        Method method = DharmaAudioWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
        method.setAccessible(true);
        return (int) method.invoke(null, width, height);
    }

    @Test public void smallMediumAndLargeKeepTheirUsableLayouts() throws Exception {
        assertEquals(0, size(179, 202));
        assertEquals(-2, size(373, 110));
        assertEquals(1, size(373, 155));
        assertEquals(2, size(373, 250));
        assertEquals(2, size(373, 414));
        assertEquals(1, size(250, 350));
    }

    @Test public void queueRowsKeepFortyEightDpTargetsWithinTheHost() throws Exception {
        Method method = DharmaAudioWidgetProvider.class.getDeclaredMethod("visibleQueueRows", int.class);
        method.setAccessible(true);
        assertEquals(0, (int) method.invoke(null, 250));
        assertEquals(1, (int) method.invoke(null, 300));
        assertEquals(2, (int) method.invoke(null, 345));
        assertEquals(3, (int) method.invoke(null, 400));
        assertEquals(3, (int) method.invoke(null, 500));
    }

    @Test public void oldHostsUseBothRealOrientationPairs() throws Exception {
        Method method = DharmaAudioWidgetProvider.class.getDeclaredMethod("legacySizesForBounds", int.class, int.class, int.class, int.class);
        method.setAccessible(true);
        assertArrayEquals(new int[]{-2, 1}, (int[]) method.invoke(null, 373, 110, 800, 202));
        assertArrayEquals(new int[]{1, 2}, (int[]) method.invoke(null, 373, 202, 800, 414));
        assertArrayEquals(new int[]{-2, 0}, (int[]) method.invoke(null, 179, 110, 400, 202));
    }

    @Test public void tallMediumStartsOnlyWhenItsHeaderAndMetadataFit() throws Exception {
        assertEquals(-2, size(230, 145));
        assertEquals(-2, size(250, 154));
        assertEquals(1, size(230, 155));
        assertEquals(1, size(250, 155));
    }
}
