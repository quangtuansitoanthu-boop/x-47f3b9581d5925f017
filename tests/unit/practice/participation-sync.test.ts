import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('$lib/browser/session-csrf',()=>({fetchWithSessionRefresh:vi.fn()}));
vi.mock('$lib/stores/session.svelte',()=>({SESSION_CHANGE_EVENT:'session-test'}));
import { createParticipationSync, PARTICIPATION_QUEUE_KEY } from '$lib/browser/practice-participation';
import { principalStorageKey } from '$lib/browser/principal-storage';
import type { PageSessionDTO } from '$lib/server/auth/types';
const signed = (id: string): PageSessionDTO => ({authenticated:true,user:{id,email:`${id}@example.test`,displayName:id,role:'user',avatarUrl:''},csrfToken:`csrf-${id}`,expiresAt:null});
const guest: PageSessionDTO = {authenticated:false,user:null,csrfToken:null,expiresAt:null};
function setup(initial=signed('A')) {
  let session=initial; const values=new Map<string,string>();
  const fetcher=vi.fn(async (_url: string, init: RequestInit)=>Response.json({recorded:JSON.parse(String(init.body)).items.length}));
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const client=createParticipationSync({storage,getSession:()=>session,fetcher});
  return {client,values,fetcher,change:(next:PageSessionDTO)=>{session=next;client.sessionChanged();}};
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('navigator',{onLine:true});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('does not send or adopt unscoped local history on mounting/sign-in',async()=>{
  const f=setup(guest);f.values.set('tutam_precept_companion_v1','{"secret":"private"}');
  f.client.record('five','started');await f.client.flush();f.change(signed('B'));await f.client.flush();
  expect(f.fetcher).not.toHaveBeenCalled();expect(f.values.size).toBe(1);f.client.dispose();
});
it('coalesces the latest marker by module without content, answers or credentials in storage',async()=>{
  const f=setup();f.client.record('five','started');f.client.record('five','recorded');f.client.record('eight','started');
  expect(f.fetcher).not.toHaveBeenCalled();await f.client.flush();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const body=JSON.parse(String(f.fetcher.mock.calls[0][1].body));
  expect(body).toMatchObject({ownerId:'A',items:[{module:'five',event:'recorded'},{module:'eight',event:'started'}]});
  expect([...f.values.values()].join('')).not.toMatch(/csrf|content|answers|secret/);
  f.client.dispose();
});
it('retains metadata offline and does not spin on an older backend',async()=>{
  const f=setup();vi.stubGlobal('navigator',{onLine:false});f.client.record('ten','started');await f.client.flush();expect(f.fetcher).not.toHaveBeenCalled();
  vi.stubGlobal('navigator',{onLine:true});f.fetcher.mockResolvedValueOnce(new Response(null,{status:404}));
  await f.client.flush();f.client.record('eight','started');await vi.advanceTimersByTimeAsync(5000);expect(f.fetcher).toHaveBeenCalledTimes(1);
  f.client.resume();await f.client.flush();expect(f.fetcher).toHaveBeenCalledTimes(2);f.client.dispose();
});
it('aborts account A and cannot acknowledge or reassign its late response to B or a new A queue',async()=>{
  const f=setup();let resolve!: (value:Response)=>void;
  f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
  f.client.record('five','started');const old=f.client.flush();
  const signal=f.fetcher.mock.calls[0][1].signal!;
  const privateKey=principalStorageKey('A','tt_personal_reflections_v1');f.values.set(privateKey,'private-writing');
  f.change(signed('B'));expect(signal.aborted).toBe(true);expect(f.values.has(principalStorageKey('A',PARTICIPATION_QUEUE_KEY))).toBe(false);
  f.change(signed('A'));vi.setSystemTime(Date.now()+1000);f.client.record('eight','started');
  resolve(Response.json({recorded:1}));await old;
  expect(f.values.get(principalStorageKey('A',PARTICIPATION_QUEUE_KEY))).toContain('eight');expect(f.values.get(privateKey)).toBe('private-writing');
  f.client.dispose();
});
it('does not mark an old personal storage owner as the newly signed-in account',async()=>{
  const f=setup(signed('B'));f.client.record('reflection','recorded','A');await f.client.flush();expect(f.fetcher).not.toHaveBeenCalled();f.client.dispose();
});
