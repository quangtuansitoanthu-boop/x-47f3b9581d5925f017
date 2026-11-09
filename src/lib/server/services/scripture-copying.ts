import diaTang from '../../data/scripture-copying/dia-tang.json';
import phapHoa from '../../data/scripture-copying/phap-hoa.json';
import langNghiem from '../../data/scripture-copying/lang-nghiem.json';
import { type CopyBook } from '../../domain/practice/scripture-copying';
import { copyingChapterCompletion, copyingTextCompletion } from '../../domain/practice/copying-completion-progress';
import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { sha256 } from '../crypto';

const books: CopyBook[] = [diaTang, phapHoa, langNghiem];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
interface CopyRow {
  run_id: string; source_version: string; texts_json: string; revision: number;
  mutation_id: string; payload_hash: string; saved_at: string; completed_blocks: number; complete: number;
}
const ack = (row: CopyRow) => ({ revision: row.revision, savedAt: row.saved_at, completedBlocks: row.completed_blocks, complete: row.complete === 1 });
export function createCopyingService(env: CloudflareEnvLike, owner: string | null) {
  const requireOwner = () => { if (!owner) throw new ServerInputError(401, 'authentication_required', 'Vui lòng đăng nhập để lưu lên hệ thống.'); return owner; };
  const chapterFor = (sutraId: unknown, chapter: unknown) => {
    const book = books.find(b => b.id === sutraId);
    if (!book || !Number.isInteger(chapter) || Number(chapter) < 1 || Number(chapter) > book.chapters.length) throw new ServerInputError(400, 'invalid_copy_chapter', 'Phẩm/quyển không hợp lệ.');
    return { book, source: book.chapters[Number(chapter) - 1] };
  };
  return {
    async save(input: Record<string, unknown>) {
      const userId = requireOwner();
      const { book, source } = chapterFor(input.sutraId, input.chapter);
      if (input.sourceVersion !== book.version) throw new ServerInputError(409, 'copy_source_changed', 'Phiên bản kinh không khớp. Bản chép trên máy được giữ nguyên.');
      if (!UUID.test(String(input.runId)) || !UUID.test(String(input.mutationId)) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 ||
        !Array.isArray(input.texts) || input.texts.length !== source.blocks.length || !input.texts.every(t => typeof t === 'string')) {
        throw new ServerInputError(400, 'invalid_copy', 'Dữ liệu bản chép không hợp lệ.');
      }
      const texts = input.texts as string[];
      const encoded = JSON.stringify(texts);
      if (new TextEncoder().encode(encoded).byteLength > 500_000 || texts.some((t, i) => t.length > source.blocks[i].length * 2 + 1000)) {
        throw new ServerInputError(413, 'copy_too_large', 'Bản chép vượt giới hạn của phẩm/quyển này.');
      }
      const completed = texts.filter((t, i) => copyingTextCompletion(source.blocks[i], t).accepted).length;
      const complete = copyingChapterCompletion(source.blocks, texts).accepted;
      const hash = await sha256(JSON.stringify([book.version, texts]));
      const savedAt = new Date().toISOString();
      // One conditional write on the common path; stale revisions cannot create
      // new rows. A retry does no write and is resolved by the keyed lookup below.
      const row = await env.DB.prepare(`INSERT INTO scripture_copy_chapters
        (user_id, sutra_id, chapter, run_id, source_version, texts_json, completed_blocks, complete, revision, mutation_id, payload_hash, saved_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ? WHERE ? = 0 OR EXISTS (
          SELECT 1 FROM scripture_copy_chapters WHERE user_id = ? AND sutra_id = ? AND chapter = ? AND run_id = ?)
        ON CONFLICT(user_id, sutra_id, chapter, run_id) DO UPDATE SET
          texts_json = excluded.texts_json, completed_blocks = excluded.completed_blocks, complete = excluded.complete,
          revision = scripture_copy_chapters.revision + 1, mutation_id = excluded.mutation_id,
          payload_hash = excluded.payload_hash, saved_at = excluded.saved_at
        WHERE scripture_copy_chapters.revision = ? AND scripture_copy_chapters.mutation_id != excluded.mutation_id
          AND scripture_copy_chapters.source_version = excluded.source_version
        RETURNING *`).bind(userId, book.id, input.chapter, input.runId, book.version, encoded, completed,
          complete ? 1 : 0, input.mutationId, hash, savedAt, input.revision,
          userId, book.id, input.chapter, input.runId, input.revision).first<CopyRow>();
      if (row) return ack(row);
      const existing = await env.DB.prepare('SELECT * FROM scripture_copy_chapters WHERE user_id = ? AND sutra_id = ? AND chapter = ? AND run_id = ?')
        .bind(userId, book.id, input.chapter, input.runId).first<CopyRow>();
      if (existing && existing.mutation_id === input.mutationId && existing.payload_hash === hash) return ack(existing);
      throw new ServerInputError(409, 'copy_conflict', 'Bản lưu đã thay đổi trên thiết bị khác. Bản trên máy vẫn được giữ; hãy xem bản hệ thống trước khi chọn tiếp tục.');
    },
    async list(sutraId: string, chapter: number, cursor = '') {
      const userId = requireOwner(); chapterFor(sutraId, chapter);
      const boundary = cursor ? cursor.split('~') : null;
      if (boundary && (boundary.length !== 2 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(boundary[0]) || !UUID.test(boundary[1]))) {
        throw new ServerInputError(400, 'invalid_cursor', 'Vị trí danh sách không hợp lệ.');
      }
      const rows = await env.DB.prepare(`SELECT run_id, source_version, revision, saved_at, completed_blocks, complete
        FROM scripture_copy_chapters WHERE user_id = ? AND sutra_id = ? AND chapter = ?
        ${boundary ? 'AND (saved_at, run_id) < (?, ?)' : ''} ORDER BY saved_at DESC, run_id DESC LIMIT 20`)
        .bind(userId, sutraId, chapter, ...(boundary ?? [])).all<CopyRow>();
      return (rows.results ?? []).map(row => ({ runId: row.run_id, sourceVersion: row.source_version, ...ack(row) }));
    },
    async read(sutraId: string, chapter: number, runId: string) {
      const userId = requireOwner(); chapterFor(sutraId, chapter);
      if (!UUID.test(runId)) throw new ServerInputError(400, 'invalid_copy', 'Mã bản chép không hợp lệ.');
      const row = await env.DB.prepare('SELECT * FROM scripture_copy_chapters WHERE user_id = ? AND sutra_id = ? AND chapter = ? AND run_id = ?')
        .bind(userId, sutraId, chapter, runId).first<CopyRow>();
      return row ? { runId: row.run_id, sourceVersion: row.source_version, texts: JSON.parse(row.texts_json) as string[], ...ack(row) } : null;
    },
  };
}
