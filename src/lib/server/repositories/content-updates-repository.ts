import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';

export const UPDATE_PAGE_SIZE = 250;
export interface CatalogCursor { date: string | null; id: string; }
const ARTICLE_METADATA = 'id,tieu_de,tom_tat,danh_muc,tags,tac_gia,anh_url,link_ngoai,noi_bat,ngay_dang,has_muc_luc,so_tap,trang_thai,created_at,updated_at,pdf_url';
const TALK_METADATA = 'id,tieu_de,mo_ta,chu_de,dien_gia,archive_id,tracks,ngay_dang,created_at,visibility,anh_dai_dien';

export function createContentUpdatesRepository(env: CloudflareEnvLike) {
  async function rows(sql: string, bindings: unknown[]): Promise<D1ResultRow[]> {
    return (await env.DB.prepare(sql).bind(...bindings).all()).results ?? [];
  }
  async function catalog(table: 'baiviet' | 'phap_thoai', after: CatalogCursor | null) {
    const isArticle = table === 'baiviet';
    const visibility = isArticle ? "trang_thai = 'Hoàn thành'" : "visibility = 'public'";
    const cursor = !after ? '' : after.date === null
      ? ' AND ((created_at IS NULL AND id > ?) OR created_at IS NOT NULL)'
      : ' AND (created_at,id) > (?,?)';
    const bindings: unknown[] = !after ? [] : after.date === null ? [after.id] : [after.date, after.id];
    return rows(`SELECT ${isArticle ? ARTICLE_METADATA : TALK_METADATA} FROM ${table}
      WHERE ${visibility}${cursor} ORDER BY created_at,id LIMIT ?`, [...bindings, UPDATE_PAGE_SIZE + 1]);
  }
  return {
    articles: (after: CatalogCursor | null) => catalog('baiviet', after),
    talks: (after: CatalogCursor | null) => catalog('phap_thoai', after),
    estimate: (ids: string[]) => rows(`SELECT a.id,
      length(CAST(json_quote(a.noi_dung) AS BLOB)) + length(CAST(a.tap_tieu_de AS BLOB))
      + COALESCE(SUM(CASE WHEN c.id IS NULL THEN 0 ELSE length(CAST(json_object(
        'id',c.id,'bai_viet_id',c.bai_viet_id,'so_thu_tu',c.so_thu_tu,'tieu_de',c.tieu_de,
        'tom_tat',c.tom_tat,'noi_dung',c.noi_dung,'updated_at',c.updated_at) AS BLOB)) END),0) AS bytes,
      COUNT(c.id) AS chapters,
      CASE WHEN instr(lower(a.noi_dung),'<img') > 0 OR MAX(instr(lower(COALESCE(c.noi_dung,'')),'<img')) > 0 THEN 1 ELSE 0 END AS illustrated
      FROM baiviet a LEFT JOIN tap_noi_dung c ON c.bai_viet_id = a.id
      WHERE a.trang_thai = 'Hoàn thành' AND a.id IN (${ids.map(() => '?').join(',')}) GROUP BY a.id`, ids),
    article: (id: string, includeBody = true) => rows(`SELECT ${ARTICLE_METADATA}${includeBody ? ',noi_dung,tap_tieu_de' : ''} FROM baiviet
      WHERE id = ? AND trang_thai = 'Hoàn thành'`, [id]),
    chapters: (id: string, after: number) => rows(`SELECT id,bai_viet_id,so_thu_tu,tieu_de,tom_tat,noi_dung,updated_at
      FROM tap_noi_dung WHERE bai_viet_id = ? AND so_thu_tu > ? ORDER BY so_thu_tu LIMIT 11`, [id, after]),
  };
}
