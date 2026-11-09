package vn.quangtu.tutam.audio;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/** Ranh giới phục hồi queue độc lập với Android để kiểm tra các tình huống ghi dở. */
final class DharmaAudioRecoveryPolicy {
    static boolean isPractice(String albumId, String queueId) {
        return "practice:meditation".equals(albumId) || isRosary(albumId, queueId)
            || (queueId != null && queueId.startsWith("practice:meditation:"));
    }

    static boolean isRosary(String albumId, String queueId) {
        return "practice:rosary".equals(albumId)
            || (queueId != null && queueId.startsWith("practice:rosary:"));
    }

    static boolean canRecover(String stateFingerprint, String queueFingerprint, String albumId, String queueId) {
        return stateFingerprint != null && !stateFingerprint.isEmpty()
            && stateFingerprint.equals(queueFingerprint) && !isPractice(albumId, queueId);
    }

    static String fingerprint(String payload) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte value : bytes) out.append(String.format(Locale.ROOT, "%02x", value));
            return out.toString();
        } catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    static long recoveryPosition(long position, boolean ended) {
        // Queue khôi phục ở STATE_IDLE; không chờ STATE_ENDED của process cũ để phát lại.
        return ended ? 0 : Math.max(0, position);
    }

    static boolean matchesEndedCheckpoint(String queueId, String trackId, long position,
            String savedQueueId, String savedTrackId, long endPosition, boolean ended) {
        return ended && queueId != null && !queueId.isEmpty() && queueId.equals(savedQueueId)
            && trackId != null && !trackId.isEmpty() && trackId.equals(savedTrackId)
            && endPosition >= 0 && position >= endPosition;
    }
}
