import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One explicitly requested local page; never a full-history migration or remote command.
export function participationBackfillSql(after = '', pageSize = 20) {
  if (typeof after !== 'string' || after.length > 200 || after.includes('\0')) throw new Error('Invalid cursor');
  if (![20,200].includes(pageSize)) throw new Error('Invalid bounded page size');
  const cursor = `'${after.replaceAll("'", "''")}'`;
  const page = `SELECT * FROM practice_participation_sources WHERE id>${cursor} ORDER BY id LIMIT ${pageSize}`;
  return `INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,source_session_id)
    SELECT owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,id FROM (${page}) WHERE module_key IS NOT NULL
    ON CONFLICT(owner_id,module_key) DO UPDATE SET last_event_kind=excluded.last_event_kind,last_activity_at=excluded.last_activity_at,
      last_synced_at=excluded.last_synced_at,source_session_id=excluded.source_session_id
    WHERE excluded.last_activity_at>practice_participation_latest.last_activity_at
      OR (excluded.last_activity_at=practice_participation_latest.last_activity_at AND excluded.last_event_kind='completed' AND practice_participation_latest.last_event_kind<>'completed');
    SELECT MAX(id) AS next,COUNT(*) AS examined FROM (${page});`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (![2,4].includes(args.length) || args[0] !== '--persist-to' || (args.length === 4 && args[2] !== '--after')) {
    throw new Error('Usage: node scripts/practice-participation-backfill-local.mjs --persist-to <existing local directory inside this checkout> [--after <cursor>]');
  }
  const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const persistence = realpathSync(path.resolve(args[1]));
  const relative = path.relative(root,persistence);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Local persistence must be inside tutam-mobile');
  const scratch = mkdtempSync(path.join(persistence,'participation-page-'));
  const file = path.join(scratch,'page.sql');
  try {
    writeFileSync(file,participationBackfillSql(args[3] ?? ''),'utf8');
    const output = execFileSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--local','--config','tests/e2e/wrangler.sveltekit.jsonc','--persist-to',persistence,'--file',file,'--json'],{cwd:root,encoding:'utf8',maxBuffer:1024*1024});
    const results = JSON.parse(output);
    process.stdout.write(JSON.stringify({local:true,page:results.at(-1)?.results?.[0],costs:results.map(result=>result.meta)})+'\n');
  } finally { unlinkSync(file); rmdirSync(scratch); }
}
