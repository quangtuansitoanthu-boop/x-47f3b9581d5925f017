import { expect, it } from 'vitest';
import { createAdminCommunityService } from '../../src/lib/server/services/admin-community.ts';

it('loads the community DTO with only its three SQL reads', async () => {
  const executed = [];
  const now = Date.UTC(2026, 9, 28, 12);
  const visitor = { principal_id: 'member-a', display_name: 'Member', role: 'user',
    device_type: 'Mobile', browser_name: 'Browser', operating_system: 'OS', current_path: '/tu-tap',
    first_seen_at: now - 1000, last_seen_at: now, is_overflow: 0 };
  const db = { prepare(sql) {
    const statement = {
      bind() { return statement; },
      async first() { executed.push(sql); return { total: 1, members: 1, guests: 0, internal: 0 }; },
      async all() { executed.push(sql); return { results: sql.includes('SELECT principal_id, display_name, role') ? [visitor] : [] }; },
    };
    return statement;
  } };
  const result = await createAdminCommunityService({ env: { DB: db }, requestId: 'community-budget' })
    .getCommunity('month', now);
  expect(executed).toHaveLength(3);
  expect(executed.some(sql => /FROM baiviet|FROM phap_thoai|FROM visitor_daily_presence/u.test(sql))).toBe(false);
  expect(result.online).toEqual({ total: 1, members: 1, guests: 0, internal: 0,
    visitors: [{ id: 'visitor-1', accountType: 'member', accountLabel: 'Member', browserName: 'Browser',
      currentPath: '/tu-tap', deviceType: 'Mobile', firstSeenAt: new Date(now - 1000).toISOString(),
      lastSeenAt: new Date(now).toISOString(), isAuthenticated: true, isOverflow: false,
      operatingSystem: 'OS', role: 'user' }] });
  expect(result.ranking).toEqual([]);
});
