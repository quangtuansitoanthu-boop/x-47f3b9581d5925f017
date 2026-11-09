const DEFAULT_SERVICE = 'quangtu-worker';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(baseUrl, pathname, options) {
  const response = await fetch(new URL(pathname, baseUrl), options);
  const body = await response.json().catch(() => null);
  assert(body, `${pathname} did not return JSON`);
  assert(response.ok, `${pathname} returned ${response.status}`);
  return body;
}

async function readJsonResponse(baseUrl, pathname, options) {
  const response = await fetch(new URL(pathname, baseUrl), options);
  const body = await response.json().catch(() => null);
  assert(body, `${pathname} did not return JSON`);
  return { body, response };
}

async function readText(baseUrl, pathname) {
  const response = await fetch(new URL(pathname, baseUrl));
  const body = await response.text();
  assert(response.ok, `${pathname} returned ${response.status}`);
  return body;
}

// Installed clients depend on these routes even when the deployed web shell does not use them.
export async function verifyProtectedAppContracts(baseUrl, label) {
  for (const pathname of ['/api/practice/mindful-notifications', '/api/practice/mindful-posts/release-contract-check', '/api/admin/practice-participation', '/api/notifications/read-state?ids=release-contract-check']) {
    const { body, response } = await readJsonResponse(baseUrl, pathname);
    assert(response.status === 401 && body?.error?.code === 'authentication_required', `${label} installed-app contract unavailable: ${pathname} (${response.status})`);
    assert(response.headers.get('cache-control') === 'no-store', `${label} private app response must not be cached: ${pathname}`);
  }
}

export async function verifySvelteKitRuntime({
  baseUrl,
  expectedAppOrigin,
  expectedService = DEFAULT_SERVICE,
  label,
}) {
  const health = await readJson(baseUrl, '/api/health');
  assert(health.ok === true, `${label} health check is not ok`);
  assert(health.service === expectedService, `${label} service name mismatch`);
  assert(health.database === 'sealed', `${label} database is not sealed`);

  const session = await readJson(baseUrl, '/api/auth/session');
  assert(Object.hasOwn(session, 'session'), `${label} session payload is invalid`);
  await verifyProtectedAppContracts(baseUrl, label);

  const oauth = await readJson(baseUrl, '/api/auth/google/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: expectedAppOrigin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'login',
    },
    body: JSON.stringify({ returnTo: '/' }),
  });
  const authorizationUrl = new URL(oauth.url);
  assert(authorizationUrl.hostname === 'accounts.google.com', `${label} OAuth host mismatch`);
  assert(
    authorizationUrl.searchParams.get('redirect_uri') === `${expectedAppOrigin}/api/auth/google/callback`,
    `${label} OAuth callback mismatch`,
  );

  const presence = await readJson(baseUrl, '/api/presence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: expectedAppOrigin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'public',
    },
    body: JSON.stringify({ visitorId: `${label}-${crypto.randomUUID()}` }),
  });
  assert(presence.enabled === true, `${label} presence disabled`);
  assert(Number(presence.activeCount) >= 1, `${label} presence count invalid`);

  const download = await readJsonResponse(baseUrl, '/api/downloads/access', {
    method: 'POST',
    headers: {
      Origin: expectedAppOrigin,
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'public',
    },
  });
  assert(download.response.status === 401, `${label} guest download gate regression`);
  assert(download.body?.error?.code === 'authentication_required', `${label} download gate code mismatch`);

  const manifest = await readJson(baseUrl, '/manifest.json');
  assert(manifest.start_url === '/', `${label} manifest start_url mismatch`);

  const serviceWorker = await readText(baseUrl, '/service-worker.js');
  assert(serviceWorker.includes('skipWaiting'), `${label} service worker missing skipWaiting`);
  assert(serviceWorker.includes('clients.claim'), `${label} service worker missing clients.claim`);
}
