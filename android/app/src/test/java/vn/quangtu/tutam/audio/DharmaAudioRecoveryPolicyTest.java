package vn.quangtu.tutam.audio;

import org.junit.Test;
import static org.junit.Assert.*;

public class DharmaAudioRecoveryPolicyTest {
    private static final String QUEUE_A = "[{\"queueId\":\"talks:a:123\",\"uri\":\"https://media.example/a.mp3\"}]";
    private static final String QUEUE_B = "[{\"queueId\":\"talks:b:456\",\"uri\":\"https://media.example/b.mp3\"}]";

    @Test public void matchingCheckpointResumesNormalTalk() {
        String hash = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_A);
        assertTrue(DharmaAudioRecoveryPolicy.canRecover(hash, hash, "talks:a", "talks:a:123"));
    }

    @Test public void crashAfterQueueCommitCannotApplyOldTrackPositionToNewQueue() {
        String oldState = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_A);
        String committedQueue = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_B);
        assertFalse(DharmaAudioRecoveryPolicy.canRecover(oldState, committedQueue, "talks:b", "talks:b:456"));
    }

    @Test public void orphanAndPrePairingCheckpointsAreNotRecoverable() {
        String hash = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_A);
        assertFalse(DharmaAudioRecoveryPolicy.canRecover("", hash, "talks:a", "talks:a:123"));
        assertFalse(DharmaAudioRecoveryPolicy.canRecover(hash, "", "talks:a", "talks:a:123"));
        assertFalse(DharmaAudioRecoveryPolicy.canRecover(null, null, "talks:a", "talks:a:123"));
    }

    @Test public void meditationNeverRecoversEvenWithMatchingFiles() {
        String hash = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_A);
        assertFalse(DharmaAudioRecoveryPolicy.canRecover(hash, hash, "practice:meditation", "practice:meditation:123"));
        assertTrue(DharmaAudioRecoveryPolicy.isPractice("practice:meditation", "other"));
        assertTrue(DharmaAudioRecoveryPolicy.isPractice("other", "practice:meditation:123"));
    }

    @Test public void ordinaryAlbumNamesDoNotAccidentallyMatchPracticeOwner() {
        assertFalse(DharmaAudioRecoveryPolicy.isPractice("meditation-talk", "talk:meditation:123"));
        assertFalse(DharmaAudioRecoveryPolicy.isPractice(null, null));
    }

    @Test public void rosaryIsNotDharmaRecoveryOrWidgetContent() {
        String hash = DharmaAudioRecoveryPolicy.fingerprint(QUEUE_A);
        assertFalse(DharmaAudioRecoveryPolicy.canRecover(hash, hash, "practice:rosary", "practice:rosary:123"));
        assertTrue(DharmaAudioRecoveryPolicy.isPractice("practice:rosary", "other"));
        assertTrue(DharmaAudioRecoveryPolicy.isRosary("other", "practice:rosary:123"));
        assertFalse(DharmaAudioRecoveryPolicy.isRosary("practice:meditation", "practice:meditation:123"));
    }

    @Test public void completedFinalTrackReplaysFromStartAfterColdRecovery() {
        assertEquals(0, DharmaAudioRecoveryPolicy.recoveryPosition(2700000, true));
    }

    @Test public void pausedMidTrackKeepsPositionAndInvalidNegativePositionIsClamped() {
        assertEquals(755000, DharmaAudioRecoveryPolicy.recoveryPosition(755000, false));
        assertEquals(0, DharmaAudioRecoveryPolicy.recoveryPosition(-1, false));
    }

    @Test public void coldCompletedTrackMatchesOnlyBeforeUserSeeksBack() {
        assertTrue(DharmaAudioRecoveryPolicy.matchesEndedCheckpoint("q", "track", 2700000, "q", "track", 2700000, true));
        assertFalse(DharmaAudioRecoveryPolicy.matchesEndedCheckpoint("q", "track", 2685000, "q", "track", 2700000, true));
        assertFalse(DharmaAudioRecoveryPolicy.matchesEndedCheckpoint("q", "track", 755000, "q", "track", 755000, false));
    }

    @Test public void completedCheckpointCannotRewindAnotherQueueOrTrack() {
        assertFalse(DharmaAudioRecoveryPolicy.matchesEndedCheckpoint("new", "track", 2700000, "old", "track", 2700000, true));
        assertFalse(DharmaAudioRecoveryPolicy.matchesEndedCheckpoint("q", "new-track", 2700000, "q", "old-track", 2700000, true));
    }
}
