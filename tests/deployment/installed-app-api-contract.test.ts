import {afterEach,expect,it,vi} from 'vitest';
import {verifyProtectedAppContracts} from '../../scripts/deploy/verify-sveltekit-runtime.js';
const denied=()=>Response.json({error:{code:'authentication_required'}},{status:401,headers:{'cache-control':'no-store'}});
afterEach(()=>vi.unstubAllGlobals());
it('accepts installed-app APIs that reject unauthenticated reads without exposing data',async()=>{
  const fetcher=vi.fn(async()=>denied());vi.stubGlobal('fetch',fetcher);
  await verifyProtectedAppContracts(new URL('https://app.test'),'test');expect(fetcher).toHaveBeenCalledTimes(4);
});
it.each([404,405,200])('fails release verification when the notifications API returns %s instead of its auth contract',async status=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'not_found'}},{status})));
  await expect(verifyProtectedAppContracts(new URL('https://app.test'),'test')).rejects.toThrow('installed-app contract unavailable');
});
it('rejects cacheable private app API responses',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'authentication_required'}},{status:401})));
  await expect(verifyProtectedAppContracts(new URL('https://app.test'),'test')).rejects.toThrow('must not be cached');
});
