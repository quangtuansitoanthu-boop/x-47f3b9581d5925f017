import { sanitizePlainText } from '../domain/content.js';
import { HttpInputError, readJson, requiredText } from '../http/request.js';

export async function incrementView(env, articleId) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO luot_xem (bai_viet_id, so_luot, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bai_viet_id) DO UPDATE
    SET so_luot = so_luot + 1, updated_at = excluded.updated_at
  `).bind(articleId, now).run();
  return env.DB.prepare(
    'SELECT bai_viet_id, so_luot, updated_at FROM luot_xem WHERE bai_viet_id = ?',
  ).bind(articleId).first();
}

export async function listComments(env, articleId, includeContact = false, options = {}) {
  const projection = `c.id, c.bai_viet_id, c.parent_id, c.noi_dung, c.tao_luc,
    COALESCE(NULLIF(u.display_name, ''), CASE WHEN c.ten LIKE '%@%' THEN 'Thành viên' ELSE c.ten END) AS ten,
    u.role AS role${includeContact ? ', c.dien_thoai, c.email' : ''}`;
  const result = await env.DB.prepare(
    `SELECT ${projection} FROM binh_luan c LEFT JOIN app_users u ON u.id = c.author_user_id
     WHERE c.bai_viet_id = ? AND (? IS NULL OR (c.tao_luc, c.id) > (SELECT tao_luc, id FROM binh_luan WHERE id = ? AND bai_viet_id = ?)) ORDER BY c.tao_luc ASC, c.id ASC LIMIT ?`,
  ).bind(articleId, options.after ?? null, options.after ?? null, articleId, Math.min(50, Math.max(1, options.limit ?? 50))).all();
  return result.results || [];
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {string} articleId
 * @param {any} [session]
 */
export async function createComment(request, env, articleId, session = null) {
  const body = await readJson(request, 20_000);
  const userId = session?.appUserId;
  const author = userId ? await env.DB.prepare('SELECT id, display_name, email, role FROM app_users WHERE id = ?').bind(userId).first() : null;
  if (!author) throw new HttpInputError(401, 'authentication_required', 'Vui lòng đăng nhập để bình luận.');
  const userEmail = String(author.email || '');
  const authorName = sanitizePlainText(String(author.display_name || 'Thành viên'), 100);
  const content = requiredText(body.noi_dung, 'Nội dung', 5_000);
  const exists = await env.DB.prepare('SELECT 1 AS found FROM baiviet WHERE id = ?').bind(articleId).first();
  if (!exists) throw new HttpInputError(404, 'article_not_found', 'Bài viết không tồn tại.');
  let parentId = null;
  if (body.parent_id != null) {
    if (!Number.isSafeInteger(body.parent_id) || body.parent_id <= 0) throw new HttpInputError(400, 'invalid_parent', 'Bình luận gốc không hợp lệ.');
    const parent = await env.DB.prepare('SELECT id, parent_id FROM binh_luan WHERE id = ? AND bai_viet_id = ?').bind(body.parent_id, articleId).first();
    if (!parent) throw new HttpInputError(404, 'comment_not_found', 'Bình luận gốc không còn tồn tại.');
    parentId = parent.parent_id ?? parent.id;
  }
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO binh_luan (bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc, author_user_id, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    articleId,
    sanitizePlainText(authorName, 100),
    sanitizePlainText(body.dien_thoai || '', 40),
    sanitizePlainText(userEmail, 254),
    sanitizePlainText(content, 5_000),
    now,
    author.id,
    parentId,
  ).run();
  return {
    id: result.meta?.last_row_id,
    bai_viet_id: articleId,
    ten: authorName,
    role: author.role,
    parent_id: parentId,
    noi_dung: content,
    tao_luc: now,
  };
}
