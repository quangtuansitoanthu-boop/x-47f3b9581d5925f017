import{describe,it,expect}from'vitest';
import{createAdminCommunityService}from'$lib/server/services/admin-community';
import{createAdminDashboardService}from'$lib/server/services/admin-dashboard';
function fixture(){const sqls:string[]=[];return{sqls,context:{env:{DB:{prepare(sql:string){const s={bind:()=>s,first:async()=>{sqls.push(sql);return{}},all:async()=>{sqls.push(sql);return{results:[]}}};return s}}},requestId:'removed-online'} as never}}
describe('admin online removal query budget',()=>{
 it('community keeps ranking with one read and empty stable online DTO',async()=>{const f=fixture();const r=await createAdminCommunityService(f.context).getCommunity('month');expect(f.sqls).toHaveLength(1);expect(f.sqls.join(' ')).not.toMatch(/active_visitors/u);expect(r.online).toEqual({members:0,guests:0,internal:0,total:0,visitors:[]});expect(r.ranking).toEqual([])});
 it('dashboard keeps history but never reads online presence',async()=>{const f=fixture();const r=await createAdminDashboardService(f.context).getDashboard();expect(f.sqls.join(' ')).not.toMatch(/FROM active_visitors/u);expect(r.onlineVisitorCount).toBe(0);expect(r.onlineVisitors).toEqual([]);expect(r.system.presenceEnabled).toBe(false);expect(r.traffic.daily.length).toBeGreaterThan(0)});
});
