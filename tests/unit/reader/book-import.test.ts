import { describe, expect, it } from 'vitest';
import type { AuthPrincipal, CloudflareEnvLike, D1PreparedStatement } from '../../../src/lib/server/cloudflare-context';
import { importBookAtomically, replaceBookChapters } from '../../../src/lib/server/services/book-import';

class Statement implements D1PreparedStatement {
  values: unknown[] = [];
  constructor(public sql: string, private database: Database) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.sql.startsWith('SELECT COUNT')) return { count: this.database.chapterCount } as T;
    if (this.sql.startsWith('SELECT id')) return (this.database.hasBook ? { id: this.values[0] } : null) as T | null;
    return null;
  }
  async run() { return { success: true }; }
  async all<T>() { return { results: [] as T[] }; }
}

class Database {
  batches: Statement[][] = [];
  chapterCount = 0;
  hasBook = true;
  failBatch = false;
  prepare(sql: string) { return new Statement(sql, this); }
  async batch(statements: D1PreparedStatement[]) {
    const batch = statements as Statement[];
    this.batches.push(batch);
    if (this.failBatch) throw new Error('boundary failure');
    this.chapterCount = batch.filter((statement) => statement.sql.startsWith('INSERT INTO tap_noi_dung')).length;
    return batch.map(() => ({ success: true }));
  }
}

const principal: AuthPrincipal = { userId: 'ctv:1', role: 'ctv', displayName: 'CTV' };
const payload = {
  book: { tieu_de: 'Sách thử', tac_gia: 'Quang Từ' },
  chapters: [
    { tieu_de: 'Tập một', noi_dung: '<p>Một</p>' },
    { tieu_de: 'Tập hai', noi_dung: '<p>Hai</p>' },
  ],
};

function environment(database: Database): CloudflareEnvLike {
  return { DB: database } as unknown as CloudflareEnvLike;
}

describe('atomic book import', () => {
  it('writes parent, delete and every chapter in one D1 batch then verifies completeness', async () => {
    const database = new Database();
    const report = await importBookAtomically(environment(database), principal, payload);
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]).toHaveLength(5);
    expect(database.batches[0][0].sql).toContain('UPDATE facebook_post_imports');
    expect(database.batches[0][1].sql).toContain('INSERT INTO baiviet');
    expect(report.complete).toBe(true);
    expect(report.expectedChapters).toBe(2);
    expect(report.persistedChapters).toBe(2);
    expect(report.bookId).toMatch(/^book_[a-f0-9]{24}$/);
  });

  it('returns the same digest and deterministic parent on retry', async () => {
    const firstDatabase = new Database();
    const secondDatabase = new Database();
    const first = await importBookAtomically(environment(firstDatabase), principal, payload);
    const second = await importBookAtomically(environment(secondDatabase), principal, payload);
    expect(second.contentDigest).toBe(first.contentDigest);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.bookId).toBe(first.bookId);
  });

  it('never reports success when the atomic batch fails at a chapter boundary', async () => {
    const database = new Database();
    database.failBatch = true;
    await expect(importBookAtomically(environment(database), principal, payload)).rejects.toThrow('boundary failure');
    expect(database.chapterCount).toBe(0);
  });

  it('rejects a mismatched idempotency key before writing', async () => {
    const database = new Database();
    await expect(importBookAtomically(environment(database), principal, { ...payload, idempotencyKey: 'wrong' }))
      .rejects.toMatchObject({ code: 'idempotency_mismatch', status: 409 });
    expect(database.batches).toHaveLength(0);
  });

  it('replaces reordered chapters in one batch and updates parent metadata', async () => {
    const database = new Database();
    const report = await replaceBookChapters(environment(database), principal, 'book-1', [...payload.chapters].reverse());
    expect(report).toEqual({ bookId: 'book-1', chapters: 2, complete: true });
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0][0].sql).toContain('UPDATE facebook_post_imports');
    expect(database.batches[0][1].sql).toContain('UPDATE baiviet SET has_muc_luc');
    expect(database.batches[0][2].sql).toContain('DELETE FROM tap_noi_dung');
  });

  it('updates existing chapters in place without deleting content when IDs are provided and noi_dung is omitted', async () => {
    const database = new Database();
    const chaptersWithId = [
      { id: 101, tieu_de: 'Tập 1 sửa tên', tom_tat: 'Tóm tắt mới' },
      { id: 102, tieu_de: 'Tập 2 sửa tên' },
    ];
    const report = await replaceBookChapters(environment(database), principal, 'book-1', chaptersWithId);
    expect(report).toEqual({ bookId: 'book-1', chapters: 2, complete: true });
    expect(database.batches).toHaveLength(1);
    const sqls = database.batches[0].map((s) => s.sql);
    // Does NOT do blind DELETE FROM tap_noi_dung WHERE bai_viet_id = ?
    expect(sqls.some((sql) => sql.trim() === 'DELETE FROM tap_noi_dung WHERE bai_viet_id = ?')).toBe(false);
    // Shifts sequence numbers negative first
    expect(sqls.some((sql) => sql.includes('SET so_thu_tu = -1 - so_thu_tu'))).toBe(true);
    // Updates chapters in place without touching noi_dung
    expect(sqls.some(sql => sql.includes("noi_dung = COALESCE(json_extract(j.value, '$.noi_dung'), t.noi_dung)"))).toBe(true);
  });
});
