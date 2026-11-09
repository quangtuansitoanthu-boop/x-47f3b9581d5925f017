import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createDriveAccessToken,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DRIVE_FOLDER_MIME_TYPE,
  listDriveChildren,
  loadServiceAccount,
} from './google-drive-service-account.js';

const projectRoot = process.cwd();
const mappingPath = path.join(projectRoot, 'scripts/drive/current-album-folder-renames.json');
const outputPath = path.join(projectRoot, '.migration-work/drive-album-scan/rename-manifest.json');
const rootFolderId = process.env.GOOGLE_DRIVE_AUDIO_ROOT_FOLDER_ID || DEFAULT_DRIVE_ROOT_FOLDER_ID;
const mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
validateMappings(mappings);

const serviceAccount = loadServiceAccount(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE);
const accessToken = await createDriveAccessToken(serviceAccount);
const rootChildren = await listDriveChildren(accessToken, rootFolderId);
const folders = rootChildren.filter((item) => item.mimeType === DRIVE_FOLDER_MIME_TYPE);
const foldersByName = new Map(folders.map((folder) => [folder.name, folder]));
const databaseRows = readProductionTalks();
const rowsByArchiveId = new Map(databaseRows.map((row) => [row.archive_id, row]));

const entries = [];
for (const mapping of mappings) {
  const folder = foldersByName.get(mapping.archiveId);
  const album = rowsByArchiveId.get(mapping.archiveId);
  if (!folder) throw new Error(`Không tìm thấy Drive folder: ${mapping.archiveId}`);
  if (!album) throw new Error(`Không tìm thấy album D1: ${mapping.archiveId}`);
  const children = await listDriveChildren(accessToken, folder.id);
  const mp3Files = children.filter(isMp3);
  entries.push({
    driveFolderId: folder.id,
    oldName: folder.name,
    newName: mapping.newName,
    albumId: album.id,
    archiveId: album.archive_id,
    visibility: album.visibility,
    previousTracks: album.tracks,
    trackCount: mp3Files.length,
    totalBytes: mp3Files.reduce((total, file) => total + Number(file.size || 0), 0),
  });
}

const totalFiles = entries.reduce((total, entry) => total + entry.trackCount, 0);
const totalBytes = entries.reduce((total, entry) => total + entry.totalBytes, 0);
if (folders.length !== mappings.length || totalFiles !== 721 || totalBytes !== 9_190_714_915) {
  throw new Error(`Baseline lệch: folders=${folders.length}, files=${totalFiles}, bytes=${totalBytes}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  createdAt: new Date().toISOString(),
  rootFolderId,
  folderCount: entries.length,
  totalFiles,
  totalBytes,
  entries,
}, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outputPath, folderCount: entries.length, totalFiles, totalBytes }));

function readProductionTalks() {
  const command = [
    'wrangler', 'd1', 'execute', 'quangtu-db', '--remote',
    '--command', 'SELECT id, archive_id, visibility, tracks FROM phap_thoai ORDER BY id', '--json',
  ];
  const output = execFileSync('npx', command, { cwd: projectRoot, encoding: 'utf8' });
  const parsed = JSON.parse(output);
  return parsed.flatMap((batch) => batch.results || []);
}

function validateMappings(values) {
  if (!Array.isArray(values) || values.length !== 23) throw new Error('Rename mapping phải có đúng 23 dòng.');
  const oldNames = new Set();
  const newNames = new Set();
  for (const value of values) {
    if (!value.archiveId || !value.newName) throw new Error('Rename mapping thiếu tên.');
    if (oldNames.has(value.archiveId) || newNames.has(value.newName)) throw new Error('Rename mapping có tên trùng.');
    oldNames.add(value.archiveId);
    newNames.add(value.newName);
  }
}

function isMp3(file) {
  return file.mimeType === 'audio/mpeg' || file.name?.toLocaleLowerCase('vi').endsWith('.mp3');
}
