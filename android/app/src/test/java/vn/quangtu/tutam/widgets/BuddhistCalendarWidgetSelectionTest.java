package vn.quangtu.tutam.widgets;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import java.lang.reflect.Method;
import org.junit.Test;

public class BuddhistCalendarWidgetSelectionTest {
    private int next(String today, String[] dates, boolean[] events) throws Exception {
        Method method = BuddhistCalendarWidgetProvider.class.getDeclaredMethod("nextIndex", String.class, String[].class, boolean[].class);
        method.setAccessible(true);
        return (int) method.invoke(null, today, dates, events);
    }

    @Test public void selectsEarliestStrictlyFutureEventInUnsortedTimeline() throws Exception {
        assertEquals(3, next("2026-11-02", new String[]{"2026-11-01", "2026-11-02", "2026-12-01", "2026-11-06", "2026-11-03"}, new boolean[]{true, true, true, true, false}));
    }

    @Test public void ignoresEmptyMissingAndMalformedCandidates() throws Exception {
        assertEquals(-1, next("2026-11-02", new String[]{"2026-11-01", "2026-11-02", null, "invalid"}, new boolean[]{true, true, true, true}));
        assertEquals(-1, next("2026-11-02", new String[0], new boolean[0]));
        assertEquals(-1, next("2026-11-02", null, null));
        assertEquals(-1, next("2026-11-02", new String[]{"2026-11-06"}, new boolean[0]));
    }

    @Test public void crossesYearAndKeepsFirstDuplicateCandidate() throws Exception {
        assertEquals(1, next("2026-12-31", new String[]{"2026-12-31", "2027-01-01", "2027-01-01", "2027-01-03"}, new boolean[]{false, true, true, true}));
    }

    @Test public void requiresCurrentDayAndRejectsImpossibleCivilDates() throws Exception {
        assertEquals(-1, next("2026-11-02", new String[]{"2026-11-06"}, new boolean[]{true}));
        assertEquals(2, next("2026-02-28", new String[]{"2026-02-28", "2026-02-30", "2026-03-01"}, new boolean[]{false, true, true}));
        assertEquals(-1, next("2026-02-30", new String[]{"2026-02-30", "2026-03-01"}, new boolean[]{false, true}));
    }

    @Test public void legacyBoundsUsePortraitAndLandscapePairs() throws Exception {
        Method method = BuddhistCalendarWidgetProvider.class.getDeclaredMethod("legacySizesForBounds", int.class, int.class, int.class, int.class);
        method.setAccessible(true);
        assertArrayEquals(new int[]{-2, 2}, (int[]) method.invoke(null, 250, 150, 390, 400));
        assertArrayEquals(new int[]{-1, 0}, (int[]) method.invoke(null, 170, 110, 210, 202));
    }

    @Test public void narrowTallHostMustNotUseSquareCompactLayout() throws Exception {
        Method method = BuddhistCalendarWidgetProvider.class.getDeclaredMethod("sizeForBounds", int.class, int.class);
        method.setAccessible(true);
        assertEquals(-3, (int) method.invoke(null, 110, 180));
        assertEquals(-3, (int) method.invoke(null, 140, 300));
        assertEquals(-1, (int) method.invoke(null, 110, 110));
        assertEquals(0, (int) method.invoke(null, 155, 180));
        assertEquals(1, (int) method.invoke(null, 250, 200));
    }
}
