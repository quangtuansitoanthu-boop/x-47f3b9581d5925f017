import {describe,it,expect,vi} from 'vitest';
import {PRESENCE_ENABLED,startPresence,listenPresence,setPracticePresence,notifyPresenceNavigation} from '$lib/browser/presence';
describe('removed presence principal lifecycle',()=>{
 it('returns no snapshot for guest or authenticated principals',()=>{
  expect(PRESENCE_ENABLED).toBe(false);
  const listener=vi.fn();
  startPresence(listener)();
  startPresence(listener,{authenticated:true,csrfToken:'csrf',user:{id:'a'} as never})();
  startPresence(listener,{authenticated:true,csrfToken:'csrf',user:{id:'b'} as never})();
  expect(listener.mock.calls).toEqual([[null],[null],[null]]);
 });
 it('does not retain or broadcast practice projections after removal',()=>{
  const listener=vi.fn();listenPresence(listener)();
  setPracticePresence({activity:'meditation',startedAt:1,visible:true});
  notifyPresenceNavigation('/tu-tap');setPracticePresence(null);
  expect(listener.mock.calls).toEqual([[null]]);
 });
});
