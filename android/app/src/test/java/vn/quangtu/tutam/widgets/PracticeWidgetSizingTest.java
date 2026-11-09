package vn.quangtu.tutam.widgets;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.lang.reflect.Method;
import org.junit.Test;

public class PracticeWidgetSizingTest {
    private int size(int width, int height) throws Exception {
        Method method = PracticeWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
        method.setAccessible(true);
        return (int) method.invoke(null, width, height);
    }

    private int[] orientations(int minWidth, int minHeight, int maxWidth, int maxHeight) throws Exception {
        Method method = PracticeWidgetProvider.class.getDeclaredMethod("legacySizesForBounds", int.class, int.class, int.class, int.class);
        method.setAccessible(true);
        return (int[]) method.invoke(null, minWidth, minHeight, maxWidth, maxHeight);
    }

    @Test public void shortHostsKeepTheActionWithoutClippingTheFullSmallLayout() throws Exception {
        assertEquals(-1, size(155, 145));
        assertEquals(-1, size(179, 179));
        assertEquals(0, size(155, 180));
        assertEquals(0, size(179, 202));
    }

    @Test public void mediumAndLargeKeepTheirToolLayoutsAtSupportedBounds() throws Exception {
        assertEquals(0, size(230, 340));
        assertEquals(-1, size(230, 150));
        assertEquals(1, size(250, 150));
        assertEquals(1, size(373, 202));
        assertEquals(1, size(250, 339));
        assertEquals(2, size(250, 340));
        assertEquals(2, size(373, 400));
    }

    @Test public void legacyHostsUseTheTwoActualOrientationPairs() throws Exception {
        // Hai giá trị min có thể thuộc hai hướng khác nhau; không làm mất bố cục Medium ở chiều dọc.
        assertArrayEquals(new int[]{-1, 1}, orientations(373, 110, 800, 202));
        assertArrayEquals(new int[]{1, 2}, orientations(373, 202, 800, 400));
        assertArrayEquals(new int[]{-1, 0}, orientations(179, 110, 400, 202));
    }

    @Test public void narrowTallHostsKeepTheSmallHierarchyInsteadOfASquareFallback() throws Exception {
        assertEquals(-2, size(110, 180));
        assertEquals(-2, size(140, 280));
        assertEquals(-1, size(110, 110));
        assertEquals(0, size(155, 180));
        assertArrayEquals(new int[]{-1, -2}, orientations(110, 110, 150, 280));
    }
}
