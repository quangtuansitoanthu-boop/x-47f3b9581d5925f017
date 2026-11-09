import { appendFile, chmod, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRelease, readProductionReleaseConfig, runWrangler, verifyReleasePreflight } from './release-preflight.js';

const CORE_SCHEMA = {
  baiviet: ['id', 'tieu_de', 'noi_dung', 'pdf_url'],
  app_users: ['id', 'role'],
  auth_sessions: ['id', 'user_id', 'token_hash', 'csrf_token_hash'],
  media_objects: ['object_key', 'byte_size', 'sha256', 'deleted_at'],
  d1_migrations: ['id', 'name', 'applied_at'],
};

export function orderD1ExportForRestore(sql) {
  // D1 can emit INSTEAD OF triggers before their views. Move only exact view
  // statements in the restore copy; quoted data/comments and the raw export stay intact.
  const masked = sql.split('');
  let quote = '';
  let comment = '';
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    const next = sql[index + 1];
    if (comment) {
      masked[index] = ' ';
      if (comment === 'line' && character === '\n') comment = '';
      if (comment === 'block' && character === '*' && next === '/') {
        masked[++index] = ' '; comment = '';
      }
    } else if (quote) {
      masked[index] = ' ';
      if (character === quote) {
        if (next === quote) masked[++index] = ' ';
        else quote = '';
      }
    } else if ((character === '-' && next === '-') || (character === '/' && next === '*')) {
      comment = character === '-' ? 'line' : 'block';
      masked[index] = masked[++index] = ' ';
    } else if (['\u0027', '"', '`', '['].includes(character)) {
      quote = character === '[' ? ']' : character;
      masked[index] = ' ';
    }
  }
  const visible = masked.join('');
  const views = [];
  const remainder = [];
  let cursor = 0;
  for (const match of visible.matchAll(/\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?VIEW\b/giu)) {
    const end = visible.indexOf(';', match.index);
    assertRelease(end >= 0, 'backup-view-statement-incomplete');
    views.push(sql.slice(match.index, end + 1));
    remainder.push(sql.slice(cursor, match.index));
    cursor = end + 1;
  }
  remainder.push(sql.slice(cursor));
  return views.length ? `${views.join('\n')}\n${remainder.join('')}` : sql;
}

export async function verifyFullD1Export(exportPath) {
  const file = await lstat(exportPath);
  assertRelease(file.isFile() && file.size > 0, 'backup-file-invalid');
  const bytes = await readFile(exportPath);
  const database = new DatabaseSync(':memory:');
  try {
    try {
      database.exec('PRAGMA foreign_keys = OFF;');
      database.exec(orderD1ExportForRestore(bytes.toString('utf8')));
    } catch { throw new Error('backup-invalid-sql'); }
    assertRelease(database.prepare('PRAGMA integrity_check').all().every((row) => row.integrity_check === 'ok'), 'backup-integrity-failed');
    assertRelease(database.prepare('PRAGMA foreign_key_check').all().length === 0, 'backup-foreign-key-failed');
    for (const [table, required] of Object.entries(CORE_SCHEMA)) {
      const columns = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
      assertRelease(required.every((column) => columns.has(column)), `backup-schema-missing:${table}`);
    }
    // A durable migrated production database must include its migration history,
    // not just a schema-only export which happens to pass integrity_check.
    assertRelease(database.prepare('SELECT COUNT(*) AS count FROM d1_migrations').get().count > 0, 'backup-migration-history-empty');
    return { sizeBytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { database.close(); }
}

export async function backupProductionD1({
  runWrangler: execute = runWrangler,
  backupRoot = '.artifacts/backups',
  ...options
} = {}) {
  const target = await readProductionReleaseConfig(options);
  const timestamp = new Date().toISOString();
  const root = path.resolve(backupRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  assertRelease((await lstat(root)).isDirectory(), 'backup-directory-invalid');
  await chmod(root, 0o700);
  const directory = await mkdtemp(path.join(root, `${timestamp.replace(/[:.]/gu, '-')}-`));
  await chmod(directory, 0o700);
  const exportPath = path.join(directory, 'database.sql');
  await writeFile(exportPath, '', { flag: 'wx', mode: 0o600 });
  try {
    await execute(['d1', 'export', target.databaseName, '--remote', '--config', target.webConfigPath, '--env', 'production', '--output', exportPath]);
  } catch { throw new Error('backup-export-failed'); }
  await chmod(exportPath, 0o600);
  const verified = await verifyFullD1Export(exportPath);
  const metadata = { timestamp, accountId: target.accountId, databaseId: target.databaseId, databaseName: target.databaseName, exportPath, ...verified };
  const metadataPath = path.join(directory, 'metadata.json');
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { directory, metadataPath, metadata };
}

export async function verifyBackupMetadata({ metadataPath, ...options }) {
  const target = await readProductionReleaseConfig(options);
  let metadata;
  try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')); }
  catch { throw new Error('backup-metadata-invalid'); }
  assertRelease(metadata.accountId === target.accountId && metadata.databaseId === target.databaseId
    && metadata.databaseName === target.databaseName, 'backup-target-mismatch');
  assertRelease(Number.isFinite(Date.parse(metadata.timestamp)) && metadata.exportPath === path.join(path.dirname(path.resolve(metadataPath)), 'database.sql'), 'backup-metadata-invalid');
  const verified = await verifyFullD1Export(metadata.exportPath);
  assertRelease(verified.sizeBytes === metadata.sizeBytes && verified.sha256 === metadata.sha256, 'backup-hash-mismatch');
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    await verifyReleasePreflight();
    const result = await backupProductionD1();
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `directory=${result.directory}\nmetadata-path=${result.metadataPath}\n`);
    process.stdout.write(`${JSON.stringify(result.metadata)}\n`);
  })().catch((error) => {
    process.stderr.write(`Production backup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
