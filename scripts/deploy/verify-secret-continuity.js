import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SECRETS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
  'OAUTH_STATE_SECRET',
  'RATE_LIMIT_SALT',
  'SESSION_SECRET',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readSession(baseUrl, cookieHeader) {
  const response = await fetch(new URL('/api/auth/session', baseUrl), {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const body = await response.json().catch(() => null);
  assert(response.ok, `session failed for ${baseUrl}`);
  assert(body?.session !== undefined, `invalid session payload for ${baseUrl}`);
  return body;
}

function parseSecretNames(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => typeof entry === 'string' ? entry : entry?.name).filter(Boolean);
    }
  } catch {
    // Fall back to plain-text parsing below.
  }
  return trimmed.split(/\s+/u).map((token) => token.trim()).filter((token) =>
    /^[A-Z0-9_]+$/u.test(token));
}

export async function verifySecretNames(secretsPath) {
  const secretNames = parseSecretNames(await readFile(secretsPath, 'utf8'));
  const missing = REQUIRED_SECRETS.filter((name) => !secretNames.includes(name));
  assert(missing.length === 0, `missing-worker-secrets:${missing.join(',')}`);
  return { secretCount: secretNames.length };
}

export async function verifySecretContinuity({
  candidateDataBoundary,
  newBaseUrl,
  oldBaseUrl,
  secretsPath,
  sessionCookie,
}) {
  const { secretCount } = await verifySecretNames(secretsPath);
  assert(candidateDataBoundary === 'production', 'candidate-must-bind-production-data');
  assert(sessionCookie, 'session-continuity-cookie-required');

  const [legacy, rewrite] = await Promise.all([
    readSession(oldBaseUrl, sessionCookie),
    readSession(newBaseUrl, sessionCookie),
  ]);
  const legacyIdentity = stableSessionIdentity(legacy.session);
  const rewriteIdentity = stableSessionIdentity(rewrite.session);
  assert(legacyIdentity.authenticated === true, 'legacy-session-cookie-not-authenticated');
  assert(rewriteIdentity.authenticated === true, 'candidate-session-cookie-not-authenticated');
  assert(JSON.stringify(legacyIdentity) === JSON.stringify(rewriteIdentity), 'session-cookie-continuity-mismatch');
  return { comparedSession: true, secretCount };
}

function stableSessionIdentity(session) {
  const user = session?.user || null;
  const authenticated = Boolean(session);
  return {
    authenticated,
    user: authenticated ? {
      displayName: session.displayName ?? session.fullName ?? session.username
        ?? user?.displayName ?? user?.display_name ?? user?.user_metadata?.full_name ?? null,
      id: session.userId ?? session.id ?? user?.id ?? null,
      provider: session.provider ?? user?.provider ?? null,
      role: session.role ?? user?.role ?? null,
    } : null,
  };
}

const [oldBaseUrl, newBaseUrl, secretsPath, sessionCookie, candidateDataBoundary] = process.argv.slice(2);
const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution && oldBaseUrl === '--secrets-only' && newBaseUrl) {
  verifySecretNames(newBaseUrl).then((result) => {
    process.stdout.write(`Worker secret names verified (${result.secretCount}).\n`);
  }).catch((error) => {
    process.stderr.write(`Worker secret verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
} else if (isDirectExecution && oldBaseUrl && newBaseUrl && secretsPath) {
  verifySecretContinuity({
    candidateDataBoundary,
    newBaseUrl: new URL(newBaseUrl),
    oldBaseUrl: new URL(oldBaseUrl),
    secretsPath,
    sessionCookie,
  }).then((result) => {
    process.stdout.write(`Secret continuity passed (${result.secretCount} secrets, sessionCompared=${result.comparedSession}).\n`);
  }).catch((error) => {
    process.stderr.write(`Secret continuity failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
