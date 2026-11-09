import {describe,it,expect,vi,afterEach} from 'vitest';
import {startPresence,listenPresence,notifyPresenceNavigation,setPracticePresence} from '$lib/browser/presence';
afterEach(()=>vi.unstubAllGlobals());
describe('removed presence runtime',()=>{
 it('never starts transport, timers, listeners or storage on any platform',()=>{
  const fail=()=>{throw Error('removed presence touched browser runtime')};
  vi.stubGlobal('window',{addEventListener:fail,removeEventListener:fail});
  vi.stubGlobal('document',{addEventListener:fail,removeEventListener:fail});
  vi.stubGlobal('localStorage',{getItem:fail,setItem:fail});
  vi.stubGlobal('setTimeout',fail);
  const received=vi.fn();
  const stop=startPresence(received);
  const unsubscribe=listenPresence(received);
  notifyPresenceNavigation('/tu-tap');
  setPracticePresence({activity:'meditation',startedAt:1,visible:true});
  setPracticePresence(null);stop();unsubscribe();
  expect(received.mock.calls).toEqual([[null],[null]]);
 });
});
