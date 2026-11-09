import type { AuthPrincipal, CloudflareEnvLike, D1PreparedStatement } from '../cloudflare-context';
import { normalizeWrite, tableDefinition } from '../domain/data-contract';
import { ServerInputError } from '../errors';
import { prepareManagedImportDetachByArticleIds } from '../repositories/facebook-repository';

export interface BookChapterInput {
  id?: unknown;
  tieu_de?: unknown;
  tom_tat?: unknown;
  noi_dung?: unknown;
  so_thu_tu?: unknown;
}

export interface BookImportPayload {
  book?: Record<string, unknown>;
  chapters?: BookChapterInput[];
  idempotencyKey?: string;
}

export interface BookImportReport {
  bookId: string;
  contentDigest: string;
  idempotencyKey: string;
  expectedChapters: number;
  persistedChapters: number;
  complete: true;
}

export async function importBookAtomically(
  env: CloudflareEnvLike,
  principal: AuthPrincipal | null,
  payload: BookImportPayload,
): Promise<BookImportReport> {
  requireEditor(principal);
  const rawBook = normalizeLegacyBook(payload.book);
  const rawChapters = normalizeLegacyChapters(payload.chapters ?? extractLegacyChapters(payload.book));
  const digest = await contentDigest({ book: rawBook, chapters: rawChapters });
  const requestedKey = String(payload.idempotencyKey || '').trim();
  if (requestedKey && requestedKey !== digest) {
    throw new ServerInputError(409, 'idempotency_mismatch', 'Khóa idempotency không khớp nội dung import.', { expected: digest });
  }
  const bookId = String(rawBook.id || `book_${digest.slice(0, 24)}`);
  const now = new Date().toISOString();
  const parent = normalizeWrite('baiviet', tableDefinition('baiviet'), {
    ...rawBook,
    id: bookId,
    has_muc_luc: rawChapters.length > 0,
    so_tap: rawChapters.length,
    tap_tieu_de: rawChapters.map((chapter) => chapter.tieu_de),
    created_at: rawBook.created_at || now,
    updated_at: now,
  }, principal);
  const chapters = rawChapters.map((chapter, index) => normalizeWrite(
    'tap_noi_dung',
    tableDefinition('tap_noi_dung'),
    { ...chapter, bai_viet_id: bookId, so_thu_tu: index, updated_at: now },
    principal,
  ));
  const detachManagedImport = prepareManagedImportDetachByArticleIds(env, [bookId], now);
  const setupStatements: D1PreparedStatement[] = [
    ...(detachManagedImport ? [detachManagedImport] : []),
    prepareUpsert(env, 'baiviet', parent, ['id']),
    env.DB.prepare('DELETE FROM tap_noi_dung WHERE bai_viet_id = ?').bind(bookId),
  ];
  const insertStatements = prepareChapterInserts(env, chapters);
  const allStatements = [...setupStatements, ...insertStatements];
  await env.DB.batch(compactChapterStatements(env, allStatements));
  const persisted = await env.DB.prepare('SELECT COUNT(*) AS count FROM tap_noi_dung WHERE bai_viet_id = ?')
    .bind(bookId).first<{ count: number }>();
  const persistedChapters = Number(persisted?.count || 0);
  if (persistedChapters !== chapters.length) {
    throw new ServerInputError(500, 'import_verification_failed', 'Import chưa đủ tập; có thể gửi lại cùng khóa để sửa.', {
      bookId,
      expectedChapters: chapters.length,
      persistedChapters,
      retryWith: digest,
    });
  }
  return { bookId, contentDigest: digest, idempotencyKey: digest, expectedChapters: chapters.length, persistedChapters, complete: true };
}

export async function replaceBookChapters(
  env: CloudflareEnvLike,
  principal: AuthPrincipal | null,
  bookId: string,
  input: BookChapterInput[],
): Promise<{ bookId: string; chapters: number; complete: true }> {
  requireEditor(principal);
  const existing = await env.DB.prepare('SELECT id FROM baiviet WHERE id = ?').bind(bookId).first();
  if (!existing) throw new ServerInputError(404, 'book_not_found', 'Không tìm thấy sách.');
  const chapters = normalizeLegacyChapters(input);
  const now = new Date().toISOString();
  const detachManagedImport = prepareManagedImportDetachByArticleIds(env, [bookId], now);

  const hasExistingIds = chapters.some((chapter) => chapter.id !== undefined && chapter.id !== null);

  if (hasExistingIds) {
    // In-place update: preserves existing chapter contents when noi_dung is omitted
    const existingIdsWithId = chapters.map((c) => c.id).filter((id): id is string | number => id !== undefined && id !== null);
    const existingIds = new Set(existingIdsWithId);

    const statements: D1PreparedStatement[] = [];
    if (detachManagedImport) statements.push(detachManagedImport);

    // 1. Update book parent metadata
    statements.push(
      env.DB.prepare('UPDATE baiviet SET has_muc_luc = ?, so_tap = ?, tap_tieu_de = ?, updated_at = ? WHERE id = ?')
        .bind(chapters.length ? 1 : 0, chapters.length, JSON.stringify(chapters.map((chapter) => chapter.tieu_de)), now, bookId)
    );

    // 2. Remove chapters deleted from table of contents
    if (existingIdsWithId.length > 0) {
      const uniqueIds = [...new Set(existingIdsWithId.map(String))];
      if (uniqueIds.length !== existingIdsWithId.length) throw new ServerInputError(400, 'duplicate_chapter_id', 'ID chương bị trùng.');
      statements.push(
        env.DB.prepare(`DELETE FROM tap_noi_dung WHERE bai_viet_id = ? AND id NOT IN (SELECT value FROM json_each(?))`)
          .bind(bookId, JSON.stringify(uniqueIds))
      );
    }

    // 3. Shift sequence numbers negative first to avoid UNIQUE(bai_viet_id, so_thu_tu) conflicts during reordering
    statements.push(
      env.DB.prepare('UPDATE tap_noi_dung SET so_thu_tu = -1 - so_thu_tu WHERE bai_viet_id = ?').bind(bookId)
    );

    // Validate ownership before any destructive statement. The same IDs remain
    // guarded by bai_viet_id in the atomic update.
    const suppliedIds = chapters.filter(ch => ch.id != null).map(ch => String(ch.id));
    const invalid = await env.DB.prepare('SELECT COUNT(*) AS count FROM json_each(?) ids WHERE NOT EXISTS (SELECT 1 FROM tap_noi_dung t WHERE CAST(t.id AS TEXT) = CAST(ids.value AS TEXT) AND t.bai_viet_id = ?)').bind(JSON.stringify(suppliedIds), bookId).first<{ count: number }>();
    if (Number(invalid?.count ?? 0)) throw new ServerInputError(400, 'invalid_chapter_id', 'Chương không thuộc sách này.');
    const updates = chapters.map((chapter, index) => ({ ...chapter, so_thu_tu: index })).filter(ch => ch.id != null);
    for (const json of chapterJsonGroups(updates)) {
      statements.push(env.DB.prepare(        "UPDATE tap_noi_dung AS t SET so_thu_tu = json_extract(j.value, '$.so_thu_tu'), tieu_de = json_extract(j.value, '$.tieu_de'), tom_tat = json_extract(j.value, '$.tom_tat'), noi_dung = COALESCE(json_extract(j.value, '$.noi_dung'), t.noi_dung), updated_at = ? FROM json_each(?) j WHERE t.id = json_extract(j.value, '$.id') AND t.bai_viet_id = ?"
      ).bind(now, json, bookId));
    }
    const additions = chapters.map((chapter, index) => ({ ...chapter, bai_viet_id: bookId, so_thu_tu: index, updated_at: now })).filter(ch => ch.id == null);
    statements.push(...prepareChapterInserts(env, additions));

    await env.DB.batch(compactChapterStatements(env, statements));
    return { bookId, chapters: chapters.length, complete: true };
  }

  // Full atomic replacement branch (when no chapter IDs are provided, e.g. tests or external import)
  const setupStatements: D1PreparedStatement[] = [
    ...(detachManagedImport ? [detachManagedImport] : []),
    env.DB.prepare('UPDATE baiviet SET has_muc_luc = ?, so_tap = ?, tap_tieu_de = ?, updated_at = ? WHERE id = ?')
      .bind(chapters.length ? 1 : 0, chapters.length, JSON.stringify(chapters.map((chapter) => chapter.tieu_de)), now, bookId),
    env.DB.prepare('DELETE FROM tap_noi_dung WHERE bai_viet_id = ?').bind(bookId),
  ];

  const insertStatements = prepareChapterInserts(env, chapters.map((chapter, index) => normalizeWrite('tap_noi_dung', tableDefinition('tap_noi_dung'), { ...chapter, noi_dung: chapter.noi_dung ?? '', bai_viet_id: bookId, so_thu_tu: index, updated_at: now }, principal)));

  const allStatements = [...setupStatements, ...insertStatements];
  await env.DB.batch(compactChapterStatements(env, allStatements));
  return { bookId, chapters: chapters.length, complete: true };
}

/** Keep all writes in ONE transactional batch; compact inserts without large bind lists. */
function compactChapterStatements(env: CloudflareEnvLike, statements: D1PreparedStatement[]): D1PreparedStatement[] {
  // D1 permits up to 1,000 statements per invocation on paid plans. Compaction is
  // performed while preparing inserts below, so reject an oversized update before writing.
  if (statements.length > 950) throw new ServerInputError(413, 'too_many_atomic_updates', 'Hãy chia sách thành các quyển nhỏ hơn để lưu an toàn.');
  return statements;
}

function normalizeLegacyBook(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ServerInputError(400, 'invalid_book', 'Dữ liệu sách không hợp lệ.');
  }
  const title = input.tieu_de ?? input.tieuDe ?? input.title;
  if (typeof title !== 'string' || !title.trim()) throw new ServerInputError(400, 'invalid_book_title', 'Tiêu đề sách là bắt buộc.');
  return {
    id: input.id,
    tieu_de: title,
    tom_tat: input.tom_tat ?? input.tomTat ?? input.summary ?? '',
    noi_dung: input.noi_dung ?? input.noiDung ?? input.content ?? '',
    danh_muc: input.danh_muc ?? input.danhMuc ?? input.category ?? 'SÁCH KHUYẾN THIỆN',
    tags: input.tags ?? '',
    tac_gia: input.tac_gia ?? input.tacGia ?? input.author ?? 'Quang Từ',
    anh_url: input.anh_url ?? input.anhUrl ?? input.coverUrl ?? '',
    pdf_url: input.pdf_url ?? input.pdfUrl ?? '',
    ngay_dang: input.ngay_dang ?? input.ngayDang ?? '',
    created_at: input.created_at,
  };
}

function extractLegacyChapters(book: Record<string, unknown> | undefined): BookChapterInput[] {
  if (!book) return [];
  const value = book.mucLuc ?? book.mucluc ?? book.muc_luc ?? book.danhSach ?? book.danh_sach ?? book.chapters ?? book.taps;
  return Array.isArray(value) ? value as BookChapterInput[] : [];
}

function normalizeLegacyChapters(input: BookChapterInput[]): Array<{ id?: string | number; tieu_de: string; tom_tat: string; noi_dung?: string; so_thu_tu?: number }> {
  if (!Array.isArray(input) || input.length > 2000) throw new ServerInputError(413, 'too_many_chapters', 'Mỗi sách tối đa 2000 tập.');
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ServerInputError(400, 'invalid_chapter', `Tập ${index + 1} không hợp lệ.`);
    const record = raw as Record<string, unknown>;
    const title = record.tieu_de ?? record.tieuDe ?? record.title ?? `Tập ${index + 1}`;
    const content = record.noi_dung ?? record.noiDung ?? record.content;
    const rawId = record.id;
    const id = (typeof rawId === 'string' && rawId.trim()) ? rawId.trim() : (typeof rawId === 'number' && Number.isFinite(rawId)) ? rawId : undefined;
    return {
      id,
      tieu_de: String(title).trim() || `Tập ${index + 1}`,
      tom_tat: String(record.tom_tat ?? record.tomTat ?? record.summary ?? ''),
      noi_dung: content !== undefined && content !== null ? String(content) : undefined,
    };
  });
}

async function contentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function prepareInsert(env: CloudflareEnvLike, table: string, value: Record<string, unknown>): D1PreparedStatement {
  const columns = Object.keys(value).filter((key) => value[key] !== undefined && key !== 'id');
  return env.DB.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...columns.map((column) => value[column]));
}

function prepareUpsert(env: CloudflareEnvLike, table: string, value: Record<string, unknown>, conflict: string[]): D1PreparedStatement {
  const columns = Object.keys(value).filter((key) => value[key] !== undefined);
  const updates = columns.filter((column) => !conflict.includes(column));
  return env.DB.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`)
    .bind(...columns.map((column) => value[column]));
}

function requireEditor(principal: AuthPrincipal | null): void {
  if (!principal) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
  if (principal.role !== 'ctv' && principal.role !== 'admin') throw new ServerInputError(403, 'forbidden', 'Không đủ quyền.');
}

function chapterJsonGroups(chapters: Record<string, unknown>[]): string[] {
  const groups: string[] = [];
  let group: Record<string, unknown>[] = [];
  let size = 2;
  for (const chapter of chapters) {
    const bytes = new TextEncoder().encode(JSON.stringify(chapter)).byteLength + 1;
    if (bytes > 1_500_000) throw new ServerInputError(413, 'chapter_too_large', 'Nội dung chương vượt giới hạn an toàn.');
    if (size + bytes > 1_500_000 && group.length) { groups.push(JSON.stringify(group)); group = []; size = 2; }
    group.push(chapter); size += bytes;
  }
  if (group.length) groups.push(JSON.stringify(group));
  return groups;
}

function prepareChapterInserts(env: CloudflareEnvLike, chapters: Record<string, unknown>[]): D1PreparedStatement[] {
  if (chapters.length < 50) return chapters.map(chapter => prepareInsert(env, 'tap_noi_dung', chapter));
  return chapterJsonGroups(chapters).map(json => env.DB.prepare(    'INSERT INTO tap_noi_dung (bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung, updated_at) SELECT json_extract(value, \'$.bai_viet_id\'), json_extract(value, \'$.so_thu_tu\'), json_extract(value, \'$.tieu_de\'), json_extract(value, \'$.tom_tat\'), COALESCE(json_extract(value, \'$.noi_dung\'), \'\'), json_extract(value, \'$.updated_at\') FROM json_each(?)'
  ).bind(json));
}
