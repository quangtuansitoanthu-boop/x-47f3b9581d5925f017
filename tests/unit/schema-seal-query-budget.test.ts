import { beforeEach, expect, it, vi } from 'vitest';
import { migrationIsSealed, REQUIRED_SCHEMA_CAPABILITIES, resetMigrationSealedCache } from '../../src/lib/server/http/runtime';
import type { CloudflareEnvLike } from '../../src/lib/server/cloudflare-context';

function fixture(sealed = true) {
  const calls: string[] = [];
  const first = vi.fn(async () => sealed ? { id: 'sealed' } : null);
  const all = vi.fn(async () => ({ results: REQUIRED_SCHEMA_CAPABILITIES.map(value => ({ capability: value.capability, schema_version: value.minimumSchemaVersion })) }));
  const env: CloudflareEnvLike = { DB: { prepare(sql) {
    const statement = { bind: (..._values: unknown[]) => statement, async first() { calls.push(sql); return first(); },
      async all() { calls.push(sql); return all(); }, run: vi.fn(async () => ({ success: true })) };
    return statement as ReturnType<CloudflareEnvLike['DB']['prepare']>;
  }, batch: vi.fn() } };
  return { env, calls, first, all };
}
beforeEach(() => resetMigrationSealedCache());
it('coalesces a cold burst of twenty API schema checks into two SQL statements', async () => {
  const f = fixture();
  expect(await Promise.all(Array.from({ length: 20 }, () => migrationIsSealed(f.env)))).toEqual(Array(20).fill(true));
  expect(f.calls).toHaveLength(2);
  expect(await migrationIsSealed(f.env)).toBe(true);
  expect(f.calls).toHaveLength(2);
});
it('never shares a successful seal with another database or caches an unsealed database', async () => {
  const good = fixture(), bad = fixture(false);
  expect(await migrationIsSealed(good.env)).toBe(true);
  expect(await migrationIsSealed(bad.env)).toBe(false);
  expect(await migrationIsSealed(bad.env)).toBe(false);
  expect(bad.calls).toHaveLength(4);
});
it('releases failed checks so a later request can revalidate instead of trusting or hanging', async () => {
  const f = fixture();
  f.first.mockRejectedValueOnce(new Error('db unavailable'));
  await expect(migrationIsSealed(f.env)).rejects.toThrow('db unavailable');
  expect(await migrationIsSealed(f.env)).toBe(true);
  expect(f.calls).toHaveLength(4);
});
