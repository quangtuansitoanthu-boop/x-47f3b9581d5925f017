import type { PracticeLog } from './logs';

export interface PracticeLogGroup extends PracticeLog {
  memberIds: number[];
}

/** Chỉ gộp để hiển thị; giữ ID gốc để xóa/đồng bộ không sinh thêm công phu. */
export function groupPracticeLogs(logs: readonly PracticeLog[]): PracticeLogGroup[] {
  const groups = new Map<string, PracticeLogGroup>();
  for (const log of logs) {
    const name = log.note.normalize('NFC').trim().replace(/^Lần hạt:\s*/iu, '').replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
    const key = JSON.stringify([log.date, log.type, name]);
    const group = groups.get(key);
    if (group) {
      group.count += log.count;
      group.memberIds.push(log.id);
      if (group.campaignId !== log.campaignId) { delete group.campaignId; delete group.campaignTitle; }
    } else groups.set(key, { ...log, memberIds: [log.id] });
  }
  return [...groups.values()];
}
