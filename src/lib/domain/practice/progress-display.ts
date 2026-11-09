const INTERNAL_SOURCE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?::\d+)?|(?:tt|pt|book)_\d+.*|custom:cp_\d{10,16}_[a-z0-9]{1,12}|pt_drive_[a-z0-9_-]+(?::\d+)?|(?:pb|book)_[0-9a-f-]{32,36})$|^(?:manual:|legacy_import_|practice:|completed-tool:)/iu;

// Tên gốc được giữ tại tests/unit/practice/logs-and-state.test.ts; không đưa mục đã gỡ trở lại catalog/bundle.
export function historicalPracticeTitle(value: unknown): string | null {
  return value === 'tt_1781742129070' ? 'NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT' : null;
}

export function isInternalPracticeSource(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || INTERNAL_SOURCE.test(value.trim());
}

/** Chỉ đổi tên hiển thị, không sửa note/ID đã lưu hoặc tạo request tra cứu từng dòng. */
export function resolvePracticeDisplayName(
  title: unknown,
  sourceId: string | null | undefined,
  fallback: string,
  campaigns: ReadonlyMap<string, string>,
  albums: ReadonlyMap<string, string>,
): string {
  if (typeof title === 'string' && !isInternalPracticeSource(title)) return title.trim();
  const historicalTitle = historicalPracticeTitle(sourceId) ?? historicalPracticeTitle(title);
  if (historicalTitle) return historicalTitle;
  if (sourceId) {
    const albumId = sourceId.split(':')[0];
    for (const candidate of [campaigns.get(sourceId), albums.get(albumId), albums.get(sourceId), sourceId]) {
      if (!isInternalPracticeSource(candidate)) return candidate!.trim();
    }
  }
  return fallback;
}

export function completedPracticeDisplayType(row: { sourceId?: string | null; sourceKind?: string | null; practiceType?: string | null }): 'Lễ Phật' | 'Chép kinh' | 'Chép danh hiệu' | null {
  if (row.sourceKind !== 'manual_log' && row.sourceKind !== 'legacy_import') return null;
  const type = row.practiceType ?? (row.sourceKind === 'manual_log'
    ? row.sourceId?.replace(/^completed-tool:/u, '') : row.sourceId);
  return type === 'Lễ Phật' || type === 'Chép kinh' || type === 'Chép danh hiệu' ? type : null;
}
