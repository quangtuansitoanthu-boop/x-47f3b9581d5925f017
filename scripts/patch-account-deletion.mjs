import fs from 'node:fs';

const file = 'src/lib/server/http/api-handler.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  if (path === '/api/auth/logout') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAuthentication(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    await revokeSession(env, session);
    return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie(env) });
  }`;

const addition = `  if (path === '/api/auth/delete-account') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAuthentication(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;

    if (session.role === 'admin') {
      const adminCount = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM app_users WHERE role = 'admin'"
      ).first<{ total: number }>();
      if ((adminCount?.total ?? 0) <= 1) {
        throw new ServerInputError(409, 'last_admin_protected', 'Không thể xoá tài khoản quản trị viên duy nhất.');
      }
    }

    if (session.appUserId) {
      await env.DB.prepare('DELETE FROM app_users WHERE id = ?').bind(session.appUserId).run();
    }
    await revokeSession(env, session);
    return json({ deleted: true, authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie(env) });
  }`;

const targetCRLF = target.replace(/\r?\n/g, '\r\n');
const additionCRLF = addition.replace(/\r?\n/g, '\r\n');

if (code.includes(targetCRLF)) {
  code = code.replace(targetCRLF, `${targetCRLF}\r\n\r\n${additionCRLF}`);
  fs.writeFileSync(file, code, 'utf8');
  console.log('SUCCESS: api-handler.ts updated with delete-account endpoint');
} else {
  console.error('ERROR: target string not found in api-handler.ts');
  process.exit(1);
}
