import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, '.migration-work/drive-album-scan/rename-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const apply = process.argv.includes('--apply');
const approved = process.argv.includes('--approved');

if (!apply) {
  console.log(JSON.stringify({ dryRun: true, entries: manifest.entries.map(({ driveFolderId, oldName, newName }) => ({ driveFolderId, oldName, newName })) }, null, 2));
  process.exit(0);
}
if (!approved) throw new Error('Apply yêu cầu cả --apply và --approved.');

const attempted = [];
try {
  for (const entry of manifest.entries) {
    attempted.push(entry);
    execFileSync('rclone', ['moveto', `quangtu-drive:${entry.oldName}`, `quangtu-drive:${entry.newName}`], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    const currentId = readFolderId(entry.newName);
    if (currentId !== entry.driveFolderId) throw new Error(`Drive folder ID thay đổi: ${entry.newName}`);
  }
} catch (error) {
  const rollbackErrors = [];
  for (const entry of attempted.reverse()) {
    try {
      execFileSync('rclone', ['moveto', `quangtu-drive:${entry.newName}`, `quangtu-drive:${entry.oldName}`], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
    } catch (rollbackError) {
      rollbackErrors.push(`${entry.driveFolderId}: ${rollbackError.message}`);
    }
  }
  if (rollbackErrors.length) error.message += `; rollback lỗi: ${rollbackErrors.join(' | ')}`;
  throw error;
}
console.log(JSON.stringify({ ok: true, renamed: attempted.length }));

function readFolderId(name) {
  const output = execFileSync('rclone', ['lsjson', 'quangtu-drive:', '--dirs-only', '--no-modtime', '--no-mimetype'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  const folder = JSON.parse(output).find((item) => item.Name === name);
  return folder?.ID || '';
}
