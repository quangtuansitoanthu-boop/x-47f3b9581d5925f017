import { CLIENT_PARTICIPATION_MODULES, PARTICIPATION_EVENTS, isParticipationModule, type ParticipationRow, type ParticipationItem } from '../../contracts/practice-participation';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';

interface Row { owner_id: string; module_key: ParticipationRow['module']; last_event_kind: ParticipationRow['event']; last_activity_at: string; last_synced_at: string; display_name: string | null; email: string | null }
const select = `SELECT p.owner_id,p.module_key,p.last_event_kind,p.last_activity_at,p.last_synced_at,u.display_name,u.email
  FROM practice_participation_latest p JOIN app_users u ON u.id=p.owner_id`;
export const participationUpsert = `INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at)
  VALUES(?,?,?,?,?) ON CONFLICT(owner_id,module_key) DO UPDATE SET last_event_kind=excluded.last_event_kind,
  last_activity_at=excluded.last_activity_at,last_synced_at=excluded.last_synced_at,source_session_id=NULL
  WHERE excluded.last_activity_at>practice_participation_latest.last_activity_at
    OR (excluded.last_activity_at=practice_participation_latest.last_activity_at
      AND CASE excluded.last_event_kind WHEN 'completed' THEN 2 WHEN 'recorded' THEN 1 ELSE 0 END
        >CASE practice_participation_latest.last_event_kind WHEN 'completed' THEN 2 WHEN 'recorded' THEN 1 ELSE 0 END)`;
function dto(row: Row): ParticipationRow {
  return { ownerId: row.owner_id, module: row.module_key, event: row.last_event_kind, at: row.last_activity_at, syncedAt: row.last_synced_at, name: row.display_name?.trim() || row.email || row.owner_id, email: row.email };
}
function unavailable(cause: unknown): never {
  if (cause instanceof Error && /no such table|no such column|no such index/iu.test(cause.message)) throw new ServerInputError(503, 'participation_unavailable', 'Chưa cập nhật dữ liệu tham gia.');
  throw cause;
}
export function createPracticeParticipationService(context: CloudflareRequestContext) {
  const db = context.env.DB;
  return {
    async list(params: URLSearchParams) {
      const module = params.get('module') || 'all';
      const period = params.get('period') || '7';
      if (!['all', 'precepts'].includes(module) && !isParticipationModule(module)) throw new ServerInputError(400, 'invalid_module', 'Mục tu tập không hợp lệ.');
      if (!['7', '30', 'all'].includes(period)) throw new ServerInputError(400, 'invalid_period', 'Khoảng thời gian không hợp lệ.');
      const clauses: string[] = []; const values: unknown[] = [];
      const account = (params.get('account') || '').trim();
      if (account.length > 254) throw new ServerInputError(400, 'invalid_account', 'Tài khoản không hợp lệ.');
      if (account) {
        let owner = account;
        if (account.includes('@')) {
          const user = await db.prepare("SELECT id FROM app_users WHERE lower(email)=lower(?) AND email IS NOT NULL AND email<>''").bind(account).first<{id: string}>();
          if (!user) return { rows: [], next: null };
          owner = user.id;
        }
        clauses.push('p.owner_id=?'); values.push(owner);
      }
      if (module === 'precepts') clauses.push("p.module_key IN ('five','ten','eight')");
      else if (module !== 'all') { clauses.push('p.module_key=?'); values.push(module); }
      if (period !== 'all') { clauses.push('p.last_activity_at>=?'); values.push(new Date(Date.now() - Number(period) * 86_400_000).toISOString()); }
      const cursor = params.get('cursor');
      if (cursor) {
        let data: unknown;
        try { if (cursor.length > 1024) throw new Error(); data = JSON.parse(cursor); } catch { throw new ServerInputError(400, 'invalid_cursor', 'Mốc trang không hợp lệ.'); }
        if (!Array.isArray(data) || data.length !== 3 || !data.every(item => typeof item === 'string') || !Number.isFinite(Date.parse(data[0])) || data[1].length > 200 || !isParticipationModule(data[2])) throw new ServerInputError(400, 'invalid_cursor', 'Mốc trang không hợp lệ.');
        clauses.push('(p.last_activity_at,p.owner_id,p.module_key)<(?,?,?)'); values.push(...data);
      }
      try {
        // SQLite otherwise may scan/sort all three precept groups via the module index.
        const index = account ? null : module === 'precepts' ? 'idx_participation_precepts_recent' : module === 'all' ? 'idx_participation_recent' : 'idx_participation_module_recent';
        const indexedSelect = index ? select.replace('p JOIN',`p INDEXED BY ${index} JOIN`) : select;
        const rows = (await db.prepare(`${indexedSelect}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY p.last_activity_at DESC,p.owner_id DESC,p.module_key DESC LIMIT 21`).bind(...values).all<Row>()).results ?? [];
        const page = rows.slice(0,20); const last = page.at(-1);
        return { rows: page.map(dto), next: rows.length > 20 && last ? JSON.stringify([last.last_activity_at,last.owner_id,last.module_key]) : null };
      } catch (cause) { return unavailable(cause); }
    },
    async detail(owner: string) {
      if (!owner || owner.length > 200) throw new ServerInputError(400, 'invalid_account', 'Tài khoản không hợp lệ.');
      try { return { rows: ((await db.prepare(`${select} WHERE p.owner_id=? ORDER BY p.module_key LIMIT 15`).bind(owner).all<Row>()).results ?? []).map(dto), next: null }; }
      catch (cause) { return unavailable(cause); }
    },
    async record(raw: unknown) {
      const owner = context.principal?.appUserId;
      if (!owner) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ServerInputError(400, 'invalid_participation', 'Dữ liệu không hợp lệ.');
      const input = raw as Record<string, unknown>;
      if (input.ownerId !== owner) throw new ServerInputError(403, 'participation_owner_changed', 'Tài khoản đã thay đổi.');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 15 || Object.keys(input).some(key => !['ownerId','items'].includes(key))) throw new ServerInputError(400, 'invalid_participation', 'Dữ liệu không hợp lệ.');
      const now = new Date(); const items = new Map<string, ParticipationItem>();
      for (const value of input.items) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServerInputError(400, 'invalid_participation', 'Dữ liệu không hợp lệ.');
        const item = value as Record<string, unknown>;
        if (Object.keys(item).some(key => !['module','event','at'].includes(key)) || !isParticipationModule(item.module) || !CLIENT_PARTICIPATION_MODULES.includes(item.module) || !PARTICIPATION_EVENTS.includes(item.event as ParticipationItem['event']) || typeof item.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(item.at)) throw new ServerInputError(400, 'invalid_participation', 'Dữ liệu không hợp lệ.');
        const at = Date.parse(item.at);
        if (!Number.isFinite(at) || at > now.getTime()+60_000 || at < now.getTime()-366*86_400_000) throw new ServerInputError(400, 'invalid_participation_time', 'Thời điểm không hợp lệ.');
        const normalized = { module: item.module, event: item.event as ParticipationItem['event'], at: new Date(Math.min(at,now.getTime())).toISOString() };
        if (!items.has(normalized.module) || items.get(normalized.module)!.at < normalized.at) items.set(normalized.module,normalized);
      }
      try { await db.batch([...items.values()].map(item => db.prepare(participationUpsert).bind(owner,item.module,item.event,item.at,now.toISOString()))); }
      catch (cause) { return unavailable(cause); }
      return { recorded: items.size };
    },
  };
}
