import fs from 'node:fs';
import {
  createDriveAccessToken,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DRIVE_FOLDER_MIME_TYPE,
  listDriveChildren,
  loadServiceAccount,
} from './google-drive-service-account.js';

const manifest = JSON.parse(fs.readFileSync('.migration-work/drive-album-scan/rename-manifest.json', 'utf8'));
const rootFolderId = process.env.GOOGLE_DRIVE_AUDIO_ROOT_FOLDER_ID || DEFAULT_DRIVE_ROOT_FOLDER_ID;
const serviceAccount = loadServiceAccount(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE);
const accessToken = await createDriveAccessToken(serviceAccount);
const rootChildren = await listDriveChildren(accessToken, rootFolderId);
const folders = rootChildren.filter((item) => item.mimeType === DRIVE_FOLDER_MIME_TYPE);
const foldersById = new Map(folders.map((folder) => [folder.id, folder]));

let totalFiles = 0;
let totalBytes = 0;
const mismatches = [];
for (const entry of manifest.entries) {
  const folder = foldersById.get(entry.driveFolderId);
  if (!folder || folder.name !== entry.newName) {
    mismatches.push({ driveFolderId: entry.driveFolderId, expected: entry.newName, actual: folder?.name || null });
    continue;
  }
  const files = (await listDriveChildren(accessToken, folder.id)).filter(isMp3);
  const bytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  totalFiles += files.length;
  totalBytes += bytes;
  if (files.length !== entry.trackCount || bytes !== entry.totalBytes) {
    mismatches.push({ driveFolderId: folder.id, expectedFiles: entry.trackCount, actualFiles: files.length, expectedBytes: entry.totalBytes, actualBytes: bytes });
  }
}

const ok = folders.length === 23 && totalFiles === 721 && totalBytes === 9_190_714_915 && mismatches.length === 0;
console.log(JSON.stringify({ ok, folderCount: folders.length, totalFiles, totalBytes, mismatches }));
if (!ok) process.exitCode = 1;

function isMp3(file) {
  return file.mimeType === 'audio/mpeg' || file.name?.toLocaleLowerCase('vi').endsWith('.mp3');
}
