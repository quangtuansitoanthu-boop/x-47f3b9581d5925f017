// Legacy filename/exports; these seven items are excluded only from BOTH native
// installers and native runtime. They remain available only on the web.
const IDS = new Set([
  'tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet',
  'pt_1782208869321', 'pt_1782208945706', 'pt_1782208975513',
]);

export function isIosExcludedContent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (row.row && isIosExcludedContent(row.row)) return true;
  for (const key of ['id', 'bai_viet_id', 'file']) {
    const id = String(row[key] ?? '').replace(/\.json$/u, '').replace(/^book_/u, '');
    if (IDS.has(id)) return true;
  }
  const title = String(row.tieu_de ?? row.title ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ').trim();
  return ['muon kiep nhan sinh', 'tro ve tu xu tuyet', 'many lives many times',
    'many times many lives', 'return from the snow mountain'].some(name => title.includes(name));
}

/** Lọc bản sao: không sửa dữ liệu nguồn, con trỏ phân trang hay persisted state. */
export function filterIosContent<T>(value: T): T {
  if (Array.isArray(value)) return value.filter(row => !isIosExcludedContent(row)).map(row => filterIosContent(row)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !isIosExcludedContent({ id: key }))
      .map(([key, item]) => [key, filterIosContent(item)])) as T;
  }
  return value;
}
