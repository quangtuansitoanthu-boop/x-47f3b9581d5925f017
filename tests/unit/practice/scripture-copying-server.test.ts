import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createCopyingService } from '../../../src/lib/server/services/scripture-copying';
import book from '../../../src/lib/data/scripture-copying/dia-tang.json';
import { normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';

function harness(owner: string | null = 'a') {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_users (id TEXT PRIMARY KEY); INSERT INTO app_users VALUES (\'a\'), (\'b\');');
  db.exec(readFileSync('migrations/0035-scripture-copying.sql', 'utf8'));
  const prepare = vi.fn((sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  }) }));
  const service = createCopyingService({ DB: { prepare } } as any, owner);
  const input = { runId: '00000000-0000-4000-8000-000000000001', sutraId: book.id, chapter: 1,
    sourceVersion: book.version, texts: book.chapters[0].blocks.map(() => ''), revision: 0,
    mutationId: '00000000-0000-4000-8000-000000000002' };
  return { db, prepare, service, input };
}

describe('authenticated explicit copying saves on real SQLite', () => {
  it('accepts a 90-percent chapter with the same single D1 write', async () => {
    const h = harness();
    h.input.texts = book.chapters[0].blocks.map(source => {
      const words = normalizeCopyText(source).split(' ').filter(Boolean);
      return words.slice(0, Math.ceil(words.length * 0.9)).join(' ');
    });
    expect(await h.service.save(h.input)).toMatchObject({ complete: true });
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });
  it('rejects guests before any database work', async () => {
    const h = harness(null);
    await expect(h.service.save(h.input)).rejects.toMatchObject({ status: 401 });
    await expect(h.service.list(book.id, 1)).rejects.toMatchObject({ status: 401 });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('saves a partial chapter in one statement, returns ACK, deduplicates a timed-out retry', async () => {
    const h = harness(); h.input.texts[0] = 'Nam mô';
    const ack = await h.service.save(h.input);
    expect(ack).toMatchObject({ revision: 1, completedBlocks: 0, complete: false });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(await h.service.save(h.input)).toEqual(ack);
    expect(h.db.prepare('SELECT count(*) AS n FROM scripture_copy_chapters').get()).toMatchObject({ n: 1 });
  });
  it('rejects stale revisions and mutated retry payloads without overwriting saved text', async () => {
    const h = harness(); await h.service.save(h.input);
    await expect(h.service.save({ ...h.input, texts: ['changed', ...h.input.texts.slice(1)] })).rejects.toMatchObject({ status: 409 });
    await expect(h.service.save({ ...h.input, mutationId: '00000000-0000-4000-8000-000000000003' })).rejects.toMatchObject({ status: 409 });
    expect(await h.service.list(book.id, 1)).toHaveLength(1);
  });
  it('scopes reads and mutations by authenticated owner and verifies completion from canonical text', async () => {
    const h = harness(); h.input.texts = book.chapters[0].blocks;
    expect(await h.service.save({ ...h.input, ownerId: 'b', complete: false })).toMatchObject({ complete: true });
    const other = createCopyingService({ DB: { prepare: h.prepare } } as any, 'b');
    expect(await other.list(book.id, 1)).toEqual([]);
    expect(await other.read(book.id, 1, h.input.runId)).toBeNull();
    await expect(other.save({ ...h.input, revision: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects unsupported source versions, invalid blocks and oversized text before SQL', async () => {
    const h = harness();
    await expect(h.service.save({ ...h.input, sourceVersion: 'wrong' })).rejects.toMatchObject({ status: 409 });
    await expect(h.service.save({ ...h.input, texts: [] })).rejects.toMatchObject({ status: 400 });
    await expect(h.service.save({ ...h.input, texts: h.input.texts.map(() => 'x'.repeat(100000)) })).rejects.toMatchObject({ status: 413 });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('paginates saved attempts without hiding older copies', async () => {
    const h = harness();
    for (let i = 0; i < 23; i++) await h.service.save({ ...h.input, runId: crypto.randomUUID(), mutationId: crypto.randomUUID() });
    const first = await h.service.list(book.id, 1);
    expect(first).toHaveLength(20);
    const last = first.at(-1)!;
    const second = await h.service.list(book.id, 1, `${last.savedAt}~${last.runId}`);
    expect(second).toHaveLength(3);
    expect(new Set([...first, ...second].map(r => r.runId)).size).toBe(23);
  });
});
