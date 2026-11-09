import {
  isReadingActivityCapacityError,
  type ReadingProgressRecord,
} from '$lib/browser/reading-activity-client';

interface ContinueReadingRemovalClient {
  enqueueProgressDelete(input: {
    baseRevision: number;
    contentId: string;
    contentKind: ReadingProgressRecord['contentKind'];
    epoch: number;
  }): unknown;
  flush(): Promise<unknown>;
}

export interface ContinueReadingRemovalResult {
  error: string;
  removed: boolean;
  syncDeferred: boolean;
}

export async function removeContinueReadingProgress(
  client: ContinueReadingRemovalClient,
  row: ReadingProgressRecord,
): Promise<ContinueReadingRemovalResult> {
  try {
    client.enqueueProgressDelete({
      baseRevision: Math.max(1, row.revision),
      contentId: row.contentId,
      contentKind: row.contentKind,
      epoch: Math.max(1, row.epoch),
    });
  } catch (cause) {
    return {
      error: isReadingActivityCapacityError(cause)
        ? 'Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ rồi thử lại.'
        : 'Không thể lưu yêu cầu xóa trên thiết bị. Mục này vẫn được giữ lại.',
      removed: false,
      syncDeferred: false,
    };
  }

  try {
    await client.flush();
    return { error: '', removed: true, syncDeferred: false };
  } catch {
    return { error: '', removed: true, syncDeferred: true };
  }
}

export async function removeContinueReadingProgressIfCurrent(
  client: ContinueReadingRemovalClient,
  row: ReadingProgressRecord,
  isCurrent: () => boolean,
  publish: (result: ContinueReadingRemovalResult) => void,
): Promise<boolean> {
  const result = await removeContinueReadingProgress(client, row);
  if (!isCurrent()) return false;
  publish(result);
  return true;
}
