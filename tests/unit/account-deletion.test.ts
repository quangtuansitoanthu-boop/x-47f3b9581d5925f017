import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { deleteAccount } from '$lib/server/services/account-deletion';

const apple = vi.hoisted(() => ({ revoke: vi.fn(), store: vi.fn(), verify: vi.fn() }));
vi.mock('$lib/server/auth/apple-authorization', () => ({
  revokeStoredAppleAuthorization: apple.revoke,
  storeAppleAuthorization: apple.store,
}));
vi.mock('$lib/server/auth/native-token-verification', () => ({ verifyAppleNativeToken: apple.verify }));

function setup(identities: Array<{ provider: string; provider_subject: string }> = []) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const batch = vi.fn(async (items: unknown[]) => items.map(() => ({ meta: { changes: 1 } })));
  const prepare = vi.fn((sql: string) => {
    const entry = { sql, values: [] as unknown[] };
    statements.push(entry);
    const statement = {
      bind: (...values: unknown[]) => { entry.values = values; return statement; },
      all: vi.fn(async () => ({ results: identities })),
      first: vi.fn(async () => ({ total: 2 })),
      run: vi.fn(async () => ({ success: true })),
    };
    return statement;
  });
  const env = { DB: { prepare, batch } } as any;
  const session = { appUserId: 'owner-a', userId: 'owner-a', role: 'user' } as any;
  return { env, session, statements, batch };
}

beforeEach(() => {
  vi.clearAllMocks();
  apple.revoke.mockResolvedValue(true);
  apple.store.mockResolvedValue(undefined);
  apple.verify.mockResolvedValue({ sub: 'apple-a' });
});

describe('account deletion preserves unrelated community data and fails closed', () => {
  it('cleans private legacy data and anonymizes campaign ownership in one batch', async () => {
    const { env, session, statements, batch } = setup();
    await deleteAccount(env, session);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(apple.revoke).not.toHaveBeenCalled();
    expect(statements.some(s => /INSERT.*app_users/u.test(s.sql))).toBe(false);
    expect(statements.some(s => /DELETE FROM pt_player_sync/u.test(s.sql) && s.values.includes('google_owner-a'))).toBe(true);
    expect(statements.some(s => /DELETE FROM thanh_tinh_pledges/u.test(s.sql) && s.values.includes('owner-a'))).toBe(true);
    expect(statements.some(s => /DELETE FROM app_users/u.test(s.sql) && s.values.includes('owner-a'))).toBe(true);
    expect(statements.some(s => /DELETE FROM practice_campaigns|DELETE FROM practice_campaign_members/u.test(s.sql))).toBe(false);
  });

  it('does not delete account data when Apple revocation fails', async () => {
    const { env, session, batch } = setup([{ provider: 'apple', provider_subject: 'apple-a' }]);
    apple.revoke.mockRejectedValue(new Error('provider unavailable'));
    await expect(deleteAccount(env, session)).rejects.toMatchObject({ status: 503, code: 'apple_authorization_unavailable' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('asks only old Apple accounts without a retained token to reauthenticate', async () => {
    const { env, session, batch } = setup([{ provider: 'apple', provider_subject: 'apple-a' }]);
    apple.revoke.mockResolvedValue(false);
    await expect(deleteAccount(env, session)).rejects.toMatchObject({ status: 409, code: 'apple_reauthentication_required' });
    expect(batch).not.toHaveBeenCalled();
    expect(apple.store).not.toHaveBeenCalled();
  });

  it('rejects another Apple identity before code exchange or deleting anything', async () => {
    const { env, session, batch } = setup([{ provider: 'apple', provider_subject: 'apple-a' }]);
    apple.revoke.mockResolvedValue(false);
    apple.verify.mockResolvedValue({ sub: 'apple-b' });
    await expect(deleteAccount(env, session, { appleIdentityToken: 'signed-token', appleAuthorizationCode: 'one-time-code' }))
      .rejects.toMatchObject({ status: 403, code: 'apple_identity_mismatch' });
    expect(apple.store).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('verifies same-owner reauthentication, stores and revokes before the deletion batch', async () => {
    const { env, session, batch } = setup([{ provider: 'apple', provider_subject: 'apple-a' }]);
    apple.revoke.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await deleteAccount(env, session, { appleIdentityToken: 'signed-token', appleAuthorizationCode: 'one-time-code' });
    expect(apple.store).toHaveBeenCalledWith(env, 'owner-a', 'apple-a', 'one-time-code');
    expect(apple.revoke).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(apple.revoke.mock.invocationCallOrder.at(-1)).toBeLessThan(batch.mock.invocationCallOrder[0]);
  });

  it('revokes every linked Apple identity before deleting the account', async () => {
    const { env, session, batch } = setup([
      { provider: 'apple', provider_subject: 'apple-a' },
      { provider: 'apple', provider_subject: 'apple-b' },
    ]);
    await deleteAccount(env, session);
    expect(apple.revoke).toHaveBeenNthCalledWith(1, env, 'owner-a', 'apple-a');
    expect(apple.revoke).toHaveBeenNthCalledWith(2, env, 'owner-a', 'apple-b');
    expect(batch).toHaveBeenCalledTimes(1);
  });
});

it.each([false, true])('scrubs comments with a new revision, or preserves all private data on a concurrent last-admin change (%s)', async (lastAdminRace) => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE app_users(id TEXT PRIMARY KEY,role TEXT,status TEXT);
      CREATE TABLE auth_identities(user_id TEXT,provider TEXT,provider_subject TEXT);
      CREATE TABLE apple_account_tokens(owner_id TEXT,provider_subject TEXT,revoked_at TEXT);
      CREATE TABLE pt_player_sync(id TEXT PRIMARY KEY,payload TEXT);
      CREATE TABLE thanh_tinh_pledges(user_id TEXT,payload TEXT);
      CREATE TABLE active_visitors(principal_id TEXT);
      CREATE TABLE binh_luan(author_user_id TEXT,noi_dung TEXT,ten TEXT,email TEXT,dien_thoai TEXT,
        approved_author_name TEXT,approved_author_avatar_url TEXT,moderation_status TEXT,moderation_reason TEXT,
        moderation_revision INTEGER NOT NULL DEFAULT 1);
      INSERT INTO app_users VALUES ('owner-a','admin','active'),('other-admin','admin','active');
      INSERT INTO pt_player_sync VALUES ('google_owner-a','private');
      INSERT INTO thanh_tinh_pledges VALUES ('owner-a','private');
      INSERT INTO active_visitors VALUES ('owner-a');
      INSERT INTO binh_luan VALUES ('owner-a','body','name','email','phone','name','avatar','approved',NULL,7);`);
    const prepare = (sql: string) => {
      let values: any[] = [];
      const statement = {
        bind(...bound: any[]) { values = bound; return statement; },
        first: async () => db.prepare(sql).get(...values) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...values) }),
        execute: () => ({ meta: db.prepare(sql).run(...values) }),
      };
      return statement;
    };
    const batch = async (items: Array<ReturnType<typeof prepare>>) => {
      if (lastAdminRace) db.exec("DELETE FROM app_users WHERE id='other-admin'");
      db.exec('BEGIN');
      try { const results = items.map(item => item.execute()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    };
    const deleting = deleteAccount({ DB: { prepare, batch } } as any, { appUserId: 'owner-a', role: 'admin' } as any);
    if (lastAdminRace) {
      await expect(deleting).rejects.toMatchObject({ status: 409, code: 'last_admin_protected' });
      expect(db.prepare('SELECT payload FROM pt_player_sync').get()!.payload).toBe('private');
      expect(db.prepare('SELECT payload FROM thanh_tinh_pledges').get()!.payload).toBe('private');
      expect(db.prepare('SELECT COUNT(*) AS total FROM active_visitors').get()!.total).toBe(1);
      expect(db.prepare('SELECT noi_dung,moderation_revision FROM binh_luan').get()).toMatchObject({ noi_dung: 'body', moderation_revision: 7 });
    } else {
      await deleting;
      expect(db.prepare('SELECT noi_dung,ten,email,dien_thoai,approved_author_name,approved_author_avatar_url,moderation_status,moderation_revision FROM binh_luan').get())
        .toMatchObject({ noi_dung: '', ten: '', email: '', dien_thoai: '', approved_author_name: null,
          approved_author_avatar_url: null, moderation_status: 'rejected', moderation_revision: 8 });
      const staleDecision = db.prepare("UPDATE binh_luan SET moderation_status='approved' WHERE moderation_revision=7").run();
      expect(Number(staleDecision.changes)).toBe(0);
    }
    expect(db.prepare('SELECT COUNT(*) AS total FROM app_users').get()!.total).toBe(1);
  } finally { db.close(); }
});
