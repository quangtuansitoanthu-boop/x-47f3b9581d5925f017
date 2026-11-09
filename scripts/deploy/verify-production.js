const baseUrl = new URL(process.argv[2] || 'https://quangtu.vn');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(path, options) {
  const response = await fetch(new URL(path, baseUrl), options);
  const body = await response.json().catch(() => null);
  assert(response.ok, `${path} returned ${response.status}`);
  assert(body, `${path} did not return JSON`);
  return body;
}

async function readJsonEventually(path, options, attempts = 5, delayMs = 2_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readJson(path, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function readJsonResponse(path, options) {
  const response = await fetch(new URL(path, baseUrl), options);
  const body = await response.json().catch(() => null);
  assert(body, `${path} did not return JSON`);
  return { response, body };
}

async function verifyProduction() {
  const health = await readJson('/api/health');
  assert(health.ok === true, 'health check is not ok');
  assert(health.service === 'quangtu-worker', 'unexpected service name');
  assert(health.database === 'sealed', 'production database is not sealed');

  const session = await readJson('/api/auth/session');
  assert(Object.hasOwn(session, 'session'), 'session response is invalid');

  const oauth = await readJson('/api/auth/google/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl.origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'login',
    },
    body: JSON.stringify({ returnTo: '/' }),
  });
  const authorizationUrl = new URL(oauth.url);
  assert(authorizationUrl.hostname === 'accounts.google.com', 'unexpected OAuth host');
  assert(
    authorizationUrl.searchParams.get('redirect_uri') ===
      `${baseUrl.origin}/api/auth/google/callback`,
    'unexpected OAuth callback',
  );
  assert(Boolean(authorizationUrl.searchParams.get('client_id')), 'missing OAuth client ID');
  assert(Boolean(authorizationUrl.searchParams.get('state')), 'missing OAuth state');

  const visitorId = `production-verifier-${crypto.randomUUID()}`;
  // A custom-domain route can briefly serve the previous Worker after deploy.
  const presence = await readJsonEventually('/api/presence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl.origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'public',
    },
    body: JSON.stringify({ visitorId }),
  });
  assert(presence.enabled === true, 'presence schema or feature is unavailable');
  assert(Number(presence.activeCount) >= 1, 'presence count is invalid');

  const download = await readJsonResponse('/api/downloads/access', {
    method: 'POST',
    headers: {
      Origin: baseUrl.origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'public',
    },
  });
  assert(download.response.status === 401, 'guest download access must be rejected');
  assert(download.body?.error?.code === 'authentication_required', 'unexpected download gate response');

  process.stdout.write('Production health, auth, download gate, presence, and Google OAuth checks passed.\n');
}

verifyProduction().catch((error) => {
  process.stderr.write(`Production verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
