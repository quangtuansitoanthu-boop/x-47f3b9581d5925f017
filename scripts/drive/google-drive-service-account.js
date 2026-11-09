import fs from 'node:fs';
import crypto from 'node:crypto';

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
export const DEFAULT_SERVICE_ACCOUNT_PATH = '.migration-work/secrets/google-drive-service-account.json';
export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1F-14nA9PVLmh20gIVW-zHfa-hXbWko-y';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export function loadServiceAccount(filePath = DEFAULT_SERVICE_ACCOUNT_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
    throw new Error('Tệp Service Account không hợp lệ.');
  }
  return parsed;
}

export async function createDriveAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claim = encodeJson({
    iss: serviceAccount.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  });
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(signingInput), serviceAccount.private_key)
    .toString('base64url');
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Không thể lấy token Drive (${response.status}).`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google không trả access token.');
  return payload.access_token;
}

export async function listDriveChildren(accessToken, parentId) {
  const files = [];
  let pageToken = '';
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${escapeDriveQuery(parentId)}' in parents and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)');
    url.searchParams.set('orderBy', 'name_natural');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Không thể đọc Drive folder ${parentId} (${response.status}).`);
    const payload = await response.json();
    files.push(...(payload.files || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return files;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/gu, '\\\\').replace(/'/gu, "\\'");
}
