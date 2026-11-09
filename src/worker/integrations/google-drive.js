const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const TOKEN_SKEW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 15_000;

let cachedToken = null;

export class GoogleDriveError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'GoogleDriveError';
    this.code = code;
    this.status = status;
  }
}

export async function getDriveAccessToken(env, fetchImpl = fetch) {
  const credentials = parseServiceAccount(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken?.clientEmail === credentials.client_email &&
      cachedToken.expiresAt > now + TOKEN_SKEW_SECONDS) {
    return cachedToken.value;
  }
  const assertion = await createServiceAccountAssertion(credentials, now);
  const response = await timedFetch(fetchImpl, credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new GoogleDriveError('drive_auth_failed', 'Không thể xác thực Google Drive.');
  }
  const payload = await response.json().catch(() => null);
  if (!payload?.access_token || typeof payload.access_token !== 'string') {
    throw new GoogleDriveError('drive_auth_failed', 'Phản hồi xác thực Google Drive không hợp lệ.');
  }
  cachedToken = {
    clientEmail: credentials.client_email,
    value: payload.access_token,
    expiresAt: now + Math.min(Number(payload.expires_in) || 3600, 3600),
  };
  return cachedToken.value;
}

export async function listDirectChildFolders(rootFolderId, accessToken, fetchImpl = fetch) {
  return listAllFiles({
    parentId: rootFolderId,
    accessToken,
    fetchImpl,
    extraQuery: `mimeType = '${FOLDER_MIME_TYPE}'`,
    fields: 'nextPageToken,files(id,name,mimeType)',
  });
}

export const SUPPORTED_AUDIO_EXTENSIONS = /\.(mp3|m4a|webm|ogg|opus|wav|flac|aac)$/iu;

export function isSupportedAudioDriveFile(file) {
  if (!file || file.mimeType === FOLDER_MIME_TYPE) return false;
  const name = String(file.name || '');
  if (!SUPPORTED_AUDIO_EXTENSIONS.test(name)) return false;
  const mime = String(file.mimeType || '').toLowerCase();
  return (
    mime.startsWith('audio/') ||
    mime === 'application/octet-stream' ||
    mime === 'video/webm' ||
    mime === 'video/mp4' ||
    mime === 'video/x-m4v' ||
    mime === 'application/ogg'
  );
}

export async function listDirectAudioFiles(folderId, accessToken, fetchImpl = fetch, maximum = 500) {
  const files = await listAllFiles({
    parentId: folderId,
    accessToken,
    fetchImpl,
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
  });
  const audioFiles = files.filter(isSupportedAudioDriveFile);
  if (audioFiles.length > maximum) {
    throw new GoogleDriveError('drive_track_limit', `Thư mục vượt giới hạn ${maximum} tệp âm thanh.`, 400);
  }
  return audioFiles;
}

export const listDirectMp3Files = listDirectAudioFiles;

export async function fetchDriveAudio(fileId, accessToken, request, fetchImpl = fetch) {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  return timedFetch(fetchImpl, url, { method: request.method, headers });
}

async function listAllFiles({
  parentId, accessToken, fetchImpl, extraQuery = '', fields, maximum = Number.POSITIVE_INFINITY,
}) {
  const results = [];
  let pageToken = '';
  do {
    const query = [`'${escapeDriveQuery(parentId)}' in parents`, 'trashed = false', extraQuery]
      .filter(Boolean).join(' and ');
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', fields);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await timedFetch(fetchImpl, url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new GoogleDriveError('drive_list_failed', 'Không thể đọc danh sách Google Drive.');
    }
    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.files)) {
      throw new GoogleDriveError('drive_invalid_response', 'Phản hồi Google Drive không hợp lệ.');
    }
    results.push(...payload.files);
    if (results.length >= maximum) return results.slice(0, maximum);
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
  } while (pageToken);
  return results;
}

async function createServiceAccountAssertion(credentials, now) {
  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claims = encodeJson({
    iss: credentials.client_email,
    scope: DRIVE_SCOPE,
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claims}`;
  let key;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(credentials.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new GoogleDriveError('drive_credentials_invalid', 'Khóa Service Account không hợp lệ.', 500);
  }
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function parseServiceAccount(raw) {
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new GoogleDriveError('drive_credentials_missing', 'Thiếu cấu hình Service Account.', 500);
  }
  if (credentials?.type !== 'service_account' || !credentials.client_email ||
      !credentials.private_key) {
    throw new GoogleDriveError('drive_credentials_invalid', 'Service Account không hợp lệ.', 500);
  }
  return credentials;
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem).replace(/\\n/gu, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/gu, '\\\\').replace(/'/gu, "\\'");
}

async function timedFetch(fetchImpl, input, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new GoogleDriveError('drive_timeout', 'Google Drive không phản hồi kịp thời.', 504);
    }
    throw new GoogleDriveError('drive_unavailable', 'Không thể kết nối Google Drive.');
  } finally {
    clearTimeout(timer);
  }
}
