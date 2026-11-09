import { beforeAll,beforeEach,expect,it,vi } from 'vitest';
import { applyD1Migrations,env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import participation from '../../migrations/0044-practice-participation.sql?raw';
import { createPracticeParticipationService } from '../../src/lib/server/services/practice-participation.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';
import { participationBackfillSql } from '../../scripts/practice-participation-backfill-local.mjs';
const split=sql=>{const triggers=[...sql.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)].map(match=>match[0]);return [...sql.replace(/CREATE TRIGGER[\s\S]*?END;/gu,'').replace(/^\s*--.*$/gmu,'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>`${part};`),...triggers];};
beforeAll(async()=>{await applyD1Migrations(env.DB,[application,auth,activity,participation].map((sql,index)=>({name:`participation-${index}.sql`,queries:split(sql)})));});
beforeEach(async()=>{await env.DB.prepare('DELETE FROM practice_sessions').run();await env.DB.prepare('DELETE FROM practice_participation_latest').run();await env.DB.prepare('DELETE FROM app_users').run();await env.DB.prepare("INSERT INTO app_users(id,email,display_name,role)VALUES('admin','admin@example.test','Admin','admin'),('A','a@example.test','Account A','user'),('B','b@example.test','Account B','user')").run();});
const service=(owner='A')=>createPracticeParticipationService({env,principal:{appUserId:owner,role:owner==='admin'?'admin':'user'},requestId:'participation-test'});
const item=(module='five',event='started',at=new Date().toISOString())=>({module,event,at});
const post=(items=[item()],ownerId='A')=>service().record({ownerId,items});
function dispatch(method,path,session,body,binding=env){return handleApiRequest({request:new Request(`https://example.test${path}`,{method,headers:{origin:'https://example.test','content-type':'application/json','x-csrf-token':'csrf'},...(body?{body:JSON.stringify(body)}:{})}),locals:{env:{...binding,APP_ORIGIN:'https://example.test'},session,migrationSealed:true,requestId:'api-test'}});}
const session=(role='user',id='A')=>({id:'session',userId:id,appUserId:id,role,csrfToken:'csrf',displayName:id,email:`${id}@example.test`,expiresAt:'2099-01-01',rawToken:'test'});
it('rejects guest/CTV/user reads before accessing business SQL',async()=>{
  const prepare=vi.fn(()=>{throw Error('must not query');});const binding={...env,DB:{prepare}};
  for(const role of [null,'user','ctv']){const result=await dispatch('GET','/api/admin/practice-participation',role?session(role):null,null,binding);expect(result.status).toBe(role?403:401);}
  expect(prepare).not.toHaveBeenCalled();
});
it('accepts only current-account minimal metadata, with CSRF and time validation',async()=>{
  await expect(post([item()],'B')).rejects.toMatchObject({status:403});
  await expect(post([{...item(),content:'private'}])).rejects.toMatchObject({status:400});
  await expect(post([item('sutra')])).rejects.toMatchObject({status:400});
  await expect(post([item('five','started','2099-01-01T00:00:00.000Z')])).rejects.toMatchObject({status:400});
  const response=await dispatch('POST','/api/practice/participation',session(),{ownerId:'A',items:[item()]});expect(response.status).toBe(200);
  const bad=await handleApiRequest({request:new Request('https://example.test/api/practice/participation',{method:'POST',headers:{origin:'https://other.test','content-type':'application/json'},body:JSON.stringify({ownerId:'A',items:[item()]})}),locals:{env,session:session(),migrationSealed:true}});expect(bad.status).toBe(403);
  const data=await service('admin').detail('A');expect(data.rows[0]).toMatchObject({ownerId:'A',module:'five'});expect(JSON.stringify(data)).not.toContain('private');
});
it('does not let a replay move the latest record backwards, and pages ties without duplication',async()=>{
  const at=new Date(Date.now()-1000).toISOString();await post([item('five','recorded',at)]);await post([item('five','started',new Date(Date.now()-10000).toISOString())]);
  expect((await service('admin').detail('A')).rows[0]).toMatchObject({event:'recorded',at});
  for(let index=0;index<25;index++){const id=`user-${index}`;await env.DB.prepare('INSERT INTO app_users(id,display_name)VALUES(?,?)').bind(id,id).run();await env.DB.prepare('INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at)VALUES(?,?,?,?,?)').bind(id,'ten','started',at,at).run();}
  const first=await service('admin').list(new URLSearchParams({period:'all'}));expect(first.rows).toHaveLength(20);expect(first.next).not.toBeNull();
  const second=await service('admin').list(new URLSearchParams({period:'all',cursor:first.next}));expect(second.rows).toHaveLength(6);expect(second.next).toBeNull();expect(new Set([...first.rows,...second.rows].map(row=>`${row.ownerId}:${row.module}`)).size).toBe(26);
  expect((await service('admin').list(new URLSearchParams({account:'A@EXAMPLE.TEST'}))).rows).toHaveLength(1);
});
async function storedSession(id,at,kind='meditation',source=null,evidence='{}'){
  await env.DB.prepare(`INSERT INTO practice_sessions(id,owner_id,client_session_id,activity_type,status,accepted_count,source_kind,source_id,started_at,completed_at,verification_result,evidence_summary_json,idempotency_key,created_at,updated_at)VALUES(?,'A',?,?,'completed',1,?,?,?,?,'accepted',?,?,?,?)`).bind(id,id,kind,source?'manual_log':'guided_meditation',source,at,at,evidence,id,at,at).run();
}
it('projects existing session writes and restores an older record after deletion without breaking account deletion',async()=>{
  const older=new Date(Date.now()-2000).toISOString(),latest=new Date(Date.now()-1000).toISOString();
  await storedSession('old',older);await storedSession('new',latest);
  expect((await service('admin').detail('A')).rows[0]).toMatchObject({module:'meditation',at:latest,event:'completed'});
  await env.DB.prepare("DELETE FROM practice_sessions WHERE id='new'").run();expect((await service('admin').detail('A')).rows[0].at).toBe(older);
  await storedSession('copy',latest,'scripture','completed-tool:Chép kinh',JSON.stringify({origin:'completed_tool',type:'Chép kinh',note:'PRIVATE NOTE'}));
  expect((await service('admin').detail('A')).rows.map(row=>row.module).sort()).toEqual(['meditation','sutra-copy']);
  await env.DB.prepare("DELETE FROM app_users WHERE id='A'").run();expect((await env.DB.prepare("SELECT COUNT(*) n FROM practice_participation_latest WHERE owner_id='A'").first()).n).toBe(0);
});
it('uses indexed list/keyset access and reports actual local D1 write costs separately',async()=>{
  const at=new Date().toISOString();const write=await env.DB.prepare("INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at)VALUES('A','five','started',?,?)").bind(at,at).run();
  expect(write.meta.rows_written).toBeGreaterThanOrEqual(1);
  const plan=await env.DB.prepare("EXPLAIN QUERY PLAN SELECT * FROM practice_participation_latest WHERE module_key='five' AND last_activity_at>=? ORDER BY last_activity_at DESC,owner_id DESC,module_key DESC LIMIT 21").bind('2000').all();expect(JSON.stringify(plan.results)).toContain('idx_participation_module_recent');
  const precepts=await env.DB.prepare("EXPLAIN QUERY PLAN SELECT * FROM practice_participation_latest INDEXED BY idx_participation_precepts_recent WHERE module_key IN ('five','ten','eight') ORDER BY last_activity_at DESC,owner_id DESC,module_key DESC LIMIT 21").all();expect(JSON.stringify(precepts.results)).toContain('idx_participation_precepts_recent');expect(JSON.stringify(precepts.results)).not.toContain('TEMP B-TREE');
  const read=await env.DB.prepare('SELECT * FROM practice_participation_latest ORDER BY last_activity_at DESC,owner_id DESC,module_key DESC LIMIT 21').all();
  console.info('Local participation D1 sample',JSON.stringify({write:write.meta,read:read.meta}));
});
it('classifies sutras, mantras and rituals by existing content, skipping unknown content',async()=>{
  const at=new Date().toISOString();
  for(const [id,category] of [['test-sutra','KINH PHẬT'],['test-mantra','TRÌ CHÚ'],['test-ritual','CÁC NGHI THỨC']]) {
    await env.DB.prepare('INSERT OR REPLACE INTO baiviet(id,tieu_de,danh_muc)VALUES(?,?,?)').bind(id,id,category).run();
    await storedSession(id,at,'scripture',id);
    await env.DB.prepare("UPDATE practice_sessions SET source_kind='article' WHERE id=?").bind(id).run();
  }
  await storedSession('unknown',at,'scripture');
  expect((await service('admin').detail('A')).rows.map(row=>row.module).sort()).toEqual(['mantra','ritual','sutra']);
  await env.DB.prepare("UPDATE practice_sessions SET status='active',verification_result=NULL,completed_at=NULL WHERE id='test-sutra'").run();
  // Replaying an older/less conclusive state must not move a completed record backwards.
  expect((await service('admin').detail('A')).rows.find(row=>row.module==='sutra').event).toBe('completed');
});
it('backfills only a bounded source page and resumes idempotently without overwriting newer metadata',async()=>{
  const at=new Date(Date.now()-10000).toISOString();
  for(let i=0;i<25;i++) await storedSession(`history-${String(i).padStart(2,'0')}`,at);
  await env.DB.prepare('DELETE FROM practice_participation_latest').run();
  const page=async after=>{const results=await env.DB.batch(split(participationBackfillSql(after)).map(sql=>env.DB.prepare(sql)));return results.at(-1).results[0];};
  const first=await page('');expect(first).toEqual({next:'history-19',examined:20});
  expect((await service('admin').detail('A')).rows[0]).toMatchObject({module:'meditation',at});
  const second=await page(first.next);expect(second).toEqual({next:'history-24',examined:5});
  await page('');expect((await service('admin').detail('A')).rows).toHaveLength(1);
  expect(await page(second.next)).toEqual({next:null,examined:0});
  const large=await env.DB.batch(split(participationBackfillSql('',200)).map(sql=>env.DB.prepare(sql)));
  expect(large.at(-1).results[0]).toEqual({next:'history-24',examined:25});
  expect(()=>participationBackfillSql('',201)).toThrow();
  const plan=await env.DB.prepare("EXPLAIN QUERY PLAN SELECT * FROM practice_participation_sources WHERE id>'history-19' ORDER BY id LIMIT 20").all();
  expect(JSON.stringify(plan.results)).toMatch(/INDEX.*\(id>\?\)/u);
});
it('returns an explicit unavailable error on an old schema without breaking unrelated APIs',async()=>{
  const missing={...env,DB:{prepare:()=>({bind(){return this;},all:async()=>{throw Error('D1_ERROR: no such table: practice_participation_latest');}})}};
  const response=await dispatch('GET','/api/admin/practice-participation',session('admin','admin'),null,missing);
  expect(response.status).toBe(503);
});
