import fs from 'node:fs';
import path from 'node:path';
import {
  createDriveAccessToken,
  listDriveChildren,
  loadServiceAccount,
} from './google-drive-service-account.js';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, '.migration-work/drive-album-scan/rename-manifest.json');
const outputPath = path.join(projectRoot, '.migration-work/drive-album-scan/seed-drive-talk-sources.sql');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const serviceAccount = loadServiceAccount(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE);
const accessToken = await createDriveAccessToken(serviceAccount);
const scannedAt = new Date().toISOString();
// Wrangler's remote D1 importer applies uploaded SQL atomically and rejects
// explicit BEGIN/COMMIT statements.
const statements = ['PRAGMA foreign_keys = ON;'];
let totalFiles = 0;
let totalBytes = 0;

for (const entry of manifest.entries) {
  const files = (await listDriveChildren(accessToken, entry.driveFolderId))
    .filter(isMp3)
    .sort((left, right) => naturalCompare(left.name, right.name));
  const bytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  if (files.length !== entry.trackCount || bytes !== entry.totalBytes) {
    throw new Error(`Drive folder đã đổi dữ liệu sau baseline: ${entry.newName}`);
  }
  totalFiles += files.length;
  totalBytes += bytes;
  statements.push(
    `INSERT INTO phap_thoai_drive_sources (` +
      `drive_folder_id, album_id, drive_root_folder_id, folder_name, fingerprint, last_scanned_at` +
      `) VALUES (${sql(entry.driveFolderId)}, ${sql(entry.albumId)}, ${sql(manifest.rootFolderId)}, ` +
      `${sql(entry.newName)}, 'pending-initial-drive-cutover', ${sql(scannedAt)}) ` +
      `ON CONFLICT(drive_folder_id) DO UPDATE SET ` +
      `album_id = excluded.album_id, drive_root_folder_id = excluded.drive_root_folder_id, ` +
      `folder_name = excluded.folder_name, fingerprint = excluded.fingerprint, ` +
      `last_scanned_at = excluded.last_scanned_at;`,
    `DELETE FROM phap_thoai_drive_files WHERE drive_folder_id = ${sql(entry.driveFolderId)};`,
  );
  files.forEach((file, index) => {
    statements.push(
      `INSERT INTO phap_thoai_drive_files (` +
        `drive_file_id, drive_folder_id, album_id, file_name, mime_type, byte_size, modified_time, sort_order` +
        `) VALUES (${sql(file.id)}, ${sql(entry.driveFolderId)}, ${sql(entry.albumId)}, ${sql(file.name)}, ` +
        `${sql(file.mimeType || 'audio/mpeg')}, ${Number(file.size || 0)}, ${sql(file.modifiedTime || null)}, ${index});`,
    );
  });
}

if (manifest.entries.length !== 23 || totalFiles !== 721 || totalBytes !== 9_190_714_915) {
  throw new Error(`Seed baseline lệch: folders=${manifest.entries.length}, files=${totalFiles}, bytes=${totalBytes}`);
}
statements.push('');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, statements.join('\n'));
console.log(JSON.stringify({ ok: true, outputPath, folders: 23, totalFiles, totalBytes }));

function sql(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function isMp3(file) {
  const supportedMime = file.mimeType === 'audio/mpeg' || file.mimeType === 'audio/mp3' ||
    file.mimeType === 'application/octet-stream';
  return supportedMime && file.name?.toLocaleLowerCase('vi').endsWith('.mp3');
}

function naturalCompare(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'vi', { numeric: true, sensitivity: 'base' });
}
