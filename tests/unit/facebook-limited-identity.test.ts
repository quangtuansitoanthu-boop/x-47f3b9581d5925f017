import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../src/routes/api/auth/native-verify/+server';
import type { CloudflareEnvLike, D1DatabaseLike, D1PreparedStatement } from '../../src/lib/server/cloudflare-context';

type Account = { id: string; role: 'user' | 'ctv' | 'admin'; status: string; email: string | null; display_name: string; avatar_url: string | null };
type Execution = { sql: string; values: unknown[] };

// Đếm SQL thực thi và lượt giao tiếp riêng; mock không đo rows/quota thật của D1.
class IdentityDatabase implements D1DatabaseLike {
  account: Account | null = { id: 'existing-facebook-user', role: 'user', status: 'active', email: 'owner@example.test', display_name: 'Existing member', avatar_url: null };
  identityId = 'existing-facebook-identity';
  identityExists = true;
  emailCollision = false;
  executions: Execution[] = [];
  sessions: unknown[][] = [];
  roundTrips = 0;

  prepare(sql: string): D1PreparedStatement { return new IdentityStatement(this, sql.replace(/\s+/gu, ' ').trim()); }
  async batch(statements: D1PreparedStatement[]) {
    this.roundTrips++;
    return statements.map(statement => {
      if (!(statement instanceof IdentityStatement)) throw new Error('Unexpected statement implementation');
      this.execute(statement.sql, statement.values, false);
      return { success: true };
    });
  }
  execute(sql: string, values: unknown[], separateCall: boolean): Record<string, unknown> | null {
    if (separateCall) this.roundTrips++;
    this.executions.push({ sql, values: [...values] });
    if (sql.startsWith('SELECT i.id AS identity_id')) {
      return this.identityExists && this.account
        ? { identity_id: this.identityId, user_id: this.account.id, role: this.account.role } : null;
    }
    if (sql.startsWith('SELECT id FROM app_users WHERE lower(email)')) return this.emailCollision ? { id: 'different-email-owner' } : null;
    if (sql.startsWith('UPDATE app_users SET display_name')) {
      if (!this.account || values[5] !== this.account.id) throw new Error('Wrong profile update owner');
      if (values[0]) this.account.display_name = String(values[0]);
      if (values[2]) this.account.avatar_url = String(values[2]);
      return null;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO app_users')) {
      this.account ??= { id: String(values[0]), email: values[1] === null ? null : String(values[1]), display_name: String(values[2]), avatar_url: values[3] === null ? null : String(values[3]), role: 'user', status: 'active' };
      return null;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO auth_identities')) {
      if (values[1] !== this.account?.id) throw new Error('Wrong identity owner');
      this.identityId = String(values[0]); this.identityExists = true;
      return null;
    }
    if (sql.startsWith('SELECT role, status, email, display_name, avatar_url FROM app_users')) {
      return values[0] === this.account?.id ? { ...this.account } : null;
    }
    if (sql.startsWith('INSERT INTO auth_sessions')) { this.sessions.push([...values]); return null; }
    throw new Error('Unexpected SQL in Limited Login');
  }
}
class IdentityStatement implements D1PreparedStatement {
  values: unknown[] = [];
  constructor(private database: IdentityDatabase, readonly sql: string) {}
  bind(...values: unknown[]): D1PreparedStatement { this.values = values; return this; }
  async first<T>(): Promise<T | null> { return this.database.execute(this.sql, this.values, true) as T | null; }
  async run() { this.database.execute(this.sql, this.values, true); return { success: true }; }
  async all<T>(): Promise<{ results: T[] }> { throw new Error('Unexpected collection query in Limited Login'); }
}

const nonce = 'a'.repeat(64);
const appId = 'limited-identity-app';
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
let nonceHash: string;
let db: IdentityDatabase;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'limited-identity-key', alg: 'RS256', use: 'sig' } as JsonWebKey;
  nonceHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))).toString('hex');
});
beforeEach(() => {
  db = new IdentityDatabase();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) !== 'https://www.facebook.com/.well-known/oauth/openid/jwks/') throw new Error('Unexpected provider endpoint');
    return Response.json({ keys: [jwk] });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function login(email: string | null = 'verified@example.test', clientRole = 'admin') {
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'RS256', kid: 'limited-identity-key' })}.${encode({ iss: 'https://www.facebook.com', aud: appId, sub: 'same-facebook-subject', nonce: nonceHash, iat: now, exp: now + 300, name: 'Verified member', email })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
  const token = `${input}.${Buffer.from(signature).toString('base64url')}`;
  const env: CloudflareEnvLike & { SESSION_SECRET: string } = { DB: db, FACEBOOK_APP_ID: appId, SESSION_SECRET: 'limited-login-test-session-secret', APP_ORIGIN: 'https://quangtu.vn', RATE_LIMIT_SALT: 'limited-login-test' };
  // Route-only budget: migration seal/session-cookie middleware được kiểm tra riêng.
  return POST({ request: new Request('https://quangtu.vn/api/auth/native-verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'facebook', tokenType: 'limited', token, nonce, user: { email: 'forged@attacker.test', role: clientRole } }),
  }), locals: { env, migrationSealed: true } } as unknown as Parameters<typeof POST>[0]);
}

it('retains the existing Facebook identity and creates one real session within four SQL/four D1 calls', async () => {
  const response = await login();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ userId: 'existing-facebook-user', user: { role: 'user', email: 'owner@example.test' }, session: { csrfToken: expect.any(String) } });
  expect(response.headers.get('set-cookie')).toContain('__Host-quangtu_session=');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('set-cookie')).toContain('Secure');
  expect(db.executions).toHaveLength(4);
  expect(db.roundTrips).toBe(4);
  expect(db.sessions).toHaveLength(1);
  expect(db.sessions[0].slice(1, 4)).toEqual(['existing-facebook-user', 'existing-facebook-identity', 'facebook']);
  expect(db.executions.filter(({ sql }) => /^INSERT OR IGNORE/u.test(sql))).toHaveLength(0);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  ['verified@example.test', 7, 6], [null, 6, 5],
] as const)('provisions a new Facebook identity with email %s within %i SQL/%i calls', async (email, sql, calls) => {
  db.account = null; db.identityExists = false;
  const response = await login(email);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ userId: expect.stringMatching(/^facebook-/u), user: { role: 'user', email: email || '' } });
  expect(db.executions).toHaveLength(sql);
  expect(db.roundTrips).toBe(calls);
  expect(db.executions.filter(({ sql }) => /^INSERT OR IGNORE/u.test(sql))).toHaveLength(2);
  expect(db.sessions).toHaveLength(1);
  expect(db.sessions[0].slice(1, 4)).toEqual([body.userId, db.identityId, 'facebook']);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('refuses a suspended Facebook account without inserting a session', async () => {
  db.account!.status = 'suspended';
  const response = await login();
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(db.sessions).toHaveLength(0);
  expect(db.executions).toHaveLength(3);
  expect(db.executions.some(({ sql }) => sql.startsWith('INSERT INTO auth_sessions'))).toBe(false);
});

it.each(['admin', 'ctv'] as const)('preserves the persisted %s role rather than accepting the client role', async role => {
  db.account!.role = role;
  const response = await login('verified@example.test', 'user');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { role } });
  expect(db.account!.role).toBe(role);
  expect(db.executions).toHaveLength(4);
  expect(db.sessions).toHaveLength(1);
});

it('returns link_required for a verified email collision without provisioning or issuing a session', async () => {
  db.account = null; db.identityExists = false; db.emailCollision = true;
  const response = await login();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'link_required' });
  expect(db.executions).toHaveLength(2);
  expect(db.roundTrips).toBe(2);
  expect(db.executions[1].values).toEqual(['verified@example.test']);
  expect(db.account).toBeNull();
  expect(db.sessions).toHaveLength(0);
  expect(response.headers.get('set-cookie')).toBeNull();
});
