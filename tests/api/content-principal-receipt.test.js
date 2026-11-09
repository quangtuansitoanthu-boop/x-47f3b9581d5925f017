import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const origin = 'https://quangtu.vn';
const articlePath = '/api/data/baiviet?id=eq.receipt-book&select=id,tieu_de';
const chaptersPath = '/api/data/tap_noi_dung?bai_viet_id=eq.receipt-book&select=id,bai_viet_id,so_thu_tu,tieu_de';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [{ name: 'receipt-application', queries: applicationSchema.trim().split(/;\s*\n\s*\n/gu).map(sql => sql.endsWith(';') ? sql : `${sql};`) }]);
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de,trang_thai) VALUES ('receipt-book','Receipt book','Hoàn thành')").run();
  await env.DB.prepare("INSERT INTO tap_noi_dung(id,bai_viet_id,so_thu_tu,tieu_de) VALUES (1,'receipt-book',0,'Opening')").run();
});

async function read(path, session = null, requestOrigin) {
  const statements = [];
  const database = { prepare(sql) { statements.push(sql); return env.DB.prepare(sql); } };
  const response = await handleApiRequest({
    request: new Request(`${origin}${path}`, { headers: requestOrigin ? { origin: requestOrigin } : {} }),
    locals: { env: { DB: database, APP_ORIGIN: origin }, migrationSealed: true, session, requestId: 'receipt-test' },
  });
  expect(response.status).toBe(200);
  expect(statements).toHaveLength(1);
  expect(statements[0]).toMatch(/^SELECT /);
  return response;
}

describe('practice content identity receipts on legacy detail reads', () => {
  for (const [label, session, identity] of [
    ['guest', null, 'anonymous:guest'],
    ['member', { userId: 'legacy/member : receipt', appUserId: 'app-member', role: 'user' }, 'legacy%2Fmember%20%3A%20receipt:user'],
    ['admin', { userId: 'legacy/admin', appUserId: 'app-admin', role: 'admin' }, 'legacy%2Fadmin:admin'],
  ]) {
    it.each([articlePath, chaptersPath])(`maps ${label} from the SQL principal without changing DTO or query count: %s`, async path => {
      const response = await read(path, session);
      expect(response.headers.get('x-practice-content-identity')).toBe(identity);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(path === articlePath
        ? [{ id: 'receipt-book', tieu_de: 'Receipt book' }]
        : [{ id: 1, bai_viet_id: 'receipt-book', so_thu_tu: 0, tieu_de: 'Opening' }]);
    });
  }

  it('includes the receipt for an explicit same-origin detail request', async () => {
    const response = await read(articlePath, null, origin);
    expect(response.headers.get('x-practice-content-identity')).toBe('anonymous:guest');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not attach identity to collections, other filters, canonical routes or cross-origin responses', async () => {
    for (const [path, requestOrigin] of [
      ['/api/data/baiviet?select=id'],
      ['/api/data/tap_noi_dung?select=id'],
      ['/api/data/baiviet?danh_muc=eq.KH%C3%81C&select=id'],
      ['/api/articles/receipt-book?select=id'],
      [articlePath, 'https://untrusted.example'],
      [chaptersPath, 'https://localhost'],
    ]) {
      const response = await read(path, null, requestOrigin);
      expect(response.headers.get('x-practice-content-identity')).toBeNull();
    }
  });
});
