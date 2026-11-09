import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';
import { deleteAccount } from '../../src/lib/server/services/account-deletion.ts';

vi.mock('../../src/lib/server/services/account-deletion.ts', () => ({ deleteAccount: vi.fn() }));

const origin = 'https://quangtu.vn';
const principal = {
  id: 'session-A', userId: 'user-A', appUserId: 'user-A', role: 'user', csrfToken: 'csrf-A',
  email: null, displayName: 'A', avatarUrl: null, rawToken: 'token-A',
  expiresAt: '2099-01-01T00:00:00.000Z', identityId: null, authProvider: 'google',
};
let revoke;
let bindings;

function request(path, { body, authenticated = true, csrf = true } = {}) {
  return handleApiRequest({
    request: new Request(`${origin}${path}`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': 'csrf-A' } : {}) },
      ...(body === undefined ? {} : { body }),
    }),
    locals: { migrationSealed: true, requestId: 'cookie-race-test', session: authenticated ? principal : null,
      env: { APP_ORIGIN: origin, DB: { prepare(sql) {
        expect(sql).toBe('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?');
        return { bind(...values) { bindings = values; return { run: () => revoke() }; } };
      } } } },
  });
}

beforeEach(() => {
  bindings = null;
  revoke = vi.fn(async () => ({ success: true }));
  vi.mocked(deleteAccount).mockReset().mockResolvedValue(undefined);
});

describe.each(['/api/auth/logout', '/api/auth/delete-account'])('%s cookie race contract', path => {
  it('finishes captured A mutation without expiring the cookie after B has logged in', async () => {
    let release;
    let entered;
    const delayed = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const mutate = () => { entered(); return delayed; };
    if (path.endsWith('logout')) revoke.mockImplementation(mutate);
    else vi.mocked(deleteAccount).mockImplementation(mutate);
    const pending = request(path, { body: JSON.stringify({ preserveSessionCookie: true }) });
    await started;
    // The browser can install B while the captured A mutation is in flight.
    let browserCookie = '__Host-quangtu_session=token-B';
    release();
    const response = await pending;
    expect(response.status).toBe(200);
    const expiry = response.headers.get('Set-Cookie');
    if (expiry) browserCookie = expiry;
    expect(expiry).toBeNull();
    expect(browserCookie).toBe('__Host-quangtu_session=token-B');
    expect(await response.json()).toEqual(path.endsWith('logout')
      ? { authenticated: false } : { deleted: true, authenticated: false });
    if (path.endsWith('logout')) {
      expect(revoke).toHaveBeenCalledOnce();
      expect(bindings[1]).toBe('session-A');
    } else {
      expect(deleteAccount).toHaveBeenCalledOnce();
      expect(vi.mocked(deleteAccount).mock.calls[0][1]).toBe(principal);
    }
  });

  it.each([undefined, '{}', '{"preserveSessionCookie":false}', '{"preserveSessionCookie":"true"}'])
    ('keeps legacy cookie expiry for body %s', async body => {
      const response = await request(path, { body });
      expect(response.status).toBe(200);
      expect(response.headers.get('Set-Cookie')).toContain('__Host-quangtu_session=;');
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

  it.each([{ authenticated: false, status: 401 }, { csrf: false, status: 403 }])
    ('retains authorization/CSRF before mutation (%s)', async options => {
      const response = await request(path, { ...options, body: '{"preserveSessionCookie":true}' });
      expect(response.status).toBe(options.status);
      expect(response.headers.get('Set-Cookie')).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      expect(deleteAccount).not.toHaveBeenCalled();
    });
});

it('retains logout malformed-body tolerance without honoring the opt-in', async () => {
  const response = await request('/api/auth/logout', { body: '{broken' });
  expect(response.status).toBe(200);
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  expect(revoke).toHaveBeenCalledOnce();
});

it('retains delete-account malformed-body rejection before deletion', async () => {
  const response = await request('/api/auth/delete-account', { body: '{broken' });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe('invalid_json');
  expect(deleteAccount).not.toHaveBeenCalled();
});

it('retains oversized logout tolerance without honoring an oversized opt-in', async () => {
  const response = await request('/api/auth/logout', {
    body: JSON.stringify({ preserveSessionCookie: true, padding: 'x'.repeat(32_768) }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  expect(revoke).toHaveBeenCalledOnce();
});

it('retains delete-account body size and Apple authorization validation with opt-in', async () => {
  const oversized = await request('/api/auth/delete-account', {
    body: JSON.stringify({ preserveSessionCookie: true, padding: 'x'.repeat(32_768) }),
  });
  expect(oversized.status).toBe(413);
  const invalidApple = await request('/api/auth/delete-account', {
    body: JSON.stringify({ preserveSessionCookie: true, appleIdentityToken: '' }),
  });
  expect(invalidApple.status).toBe(400);
  expect(deleteAccount).not.toHaveBeenCalled();
});
