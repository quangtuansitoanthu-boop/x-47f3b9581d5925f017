import {
  isReadingActivityCapacityError,
  type ReadingAnnotationRecord,
} from '$lib/browser/reading-activity-client';

interface AnnotationReconciliationClient {
  enqueueAnnotationUpdate(
    annotationId: string,
    input: {
      anchorStatus: 'orphaned';
      baseUpdatedAt: string;
      color: ReadingAnnotationRecord['color'];
      contentVersion: string | null;
      locator: ReadingAnnotationRecord['locator'];
      note: string;
    },
  ): unknown;
}

export function enqueueOrphanAnnotationReconciliation(
  client: AnnotationReconciliationClient,
  annotation: ReadingAnnotationRecord,
  contentVersion: string | null,
): { error: string; queued: boolean } {
  annotation.anchorStatus = 'orphaned';
  try {
    client.enqueueAnnotationUpdate(annotation.id, {
      anchorStatus: 'orphaned',
      baseUpdatedAt: annotation.updatedAt,
      color: annotation.color,
      contentVersion,
      locator: annotation.locator,
      note: annotation.note,
    });
    return { error: '', queued: true };
  } catch (cause) {
    return {
      error: isReadingActivityCapacityError(cause)
        ? 'Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ.'
        : 'Không thể lưu trạng thái trích dẫn trên thiết bị.',
      queued: false,
    };
  }
}
