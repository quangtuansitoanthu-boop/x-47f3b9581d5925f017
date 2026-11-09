import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import visitorSchema from '../../migrations/0008-active-visitors.sql?raw';
import presenceSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import activitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import communitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import { createPresenceRepository } from '../../src/lib/server/repositories/presence-repository.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [applicationSchema, authSchema, visitorSchema, presenceSchema,
    activitySchema, communitySchema].map((sql, index) => ({
    name: `presence-budget-${index}`, queries: sql.trim().split(/;\s*\n\s*\n/gu),
  })));
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM active_visitors').run();
  await env.DB.prepare('DELETE FROM visitor_daily_presence').run();
});

describe('presence atomic request budget', () => {
  it('shares changes() across D1 batch statements and makes an unmatched guarded write a no-op', async () => {
    await seedVisitor('visitor', 900000);
    const guardedDaily = () => env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      SELECT '2026-10-31', 'visitor', 'network', 900000, 1000000, 1 WHERE changes() > 0
      ON CONFLICT(visit_date, visitor_id_hash) DO UPDATE SET heartbeat_count = heartbeat_count + 1
    `);
    const matched = await env.DB.batch([
      env.DB.prepare('UPDATE active_visitors SET last_seen_at = 1000000 WHERE visitor_id_hash = ?').bind('visitor'),
      guardedDaily(),
    ]);
    expect(matched.map(result => result.meta.changes)).toEqual([1, 1]);
    const unmatched = await env.DB.batch([
      env.DB.prepare('UPDATE active_visitors SET last_seen_at = 1000000 WHERE visitor_id_hash = ?').bind('missing'),
      guardedDaily(),
    ]);
    expect(unmatched.map(result => result.meta.changes)).toEqual([0, 0]);
    expect(await dailyCount()).toBe(1);
  });

  it('updates an existing visitor in two SQL and records exactly one daily heartbeat', async () => {
    await seedVisitor('visitor', 900000);
    const measured = measuredRepository();
    await measured.repository.writeHeartbeat(args());
    expect(measured.batches.map(batch => batch.length)).toEqual([2]);
    // Metadata D1 tính cả các index hiện có, không chỉ hai hàng dữ liệu.
    expect(measured.batches.flat().reduce((sum, result) => sum + result.meta.rows_written, 0)).toBeLessThanOrEqual(7);
    expect(measured.batches.flat().reduce((sum, result) => sum + result.meta.rows_read, 0)).toBeLessThan(20);
    expect(await dailyCount()).toBe(1);
    expect(await env.DB.prepare('SELECT last_seen_at, first_seen_at FROM active_visitors').first())
      .toMatchObject({ last_seen_at: 1000000, first_seen_at: 900000 });
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${measured.sql[0]}`)
      .bind(...measured.bindings[0]).all();
    expect(plan.results.some(row => row.detail.includes('SEARCH active_visitors USING INDEX'))).toBe(true);
  });

  it('inserts a new visitor with five SQL and only one committed daily heartbeat', async () => {
    const measured = measuredRepository();
    await measured.repository.writeHeartbeat(args());
    expect(measured.batches.map(batch => batch.length)).toEqual([2, 3]);
    expect(measured.batches[0].map(result => result.meta.rows_written)).toEqual([0, 0]);
    expect(measured.batches.flat().reduce((sum, result) => sum + result.meta.rows_written, 0)).toBeLessThanOrEqual(7);
    expect(await dailyCount()).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM active_visitors').first()).toEqual({ count: 1 });
  });

  it('keeps throttled timestamps while recording the daily heartbeat once', async () => {
    await seedVisitor('visitor', 990000);
    const measured = measuredRepository();
    await measured.repository.writeHeartbeat(args());
    expect(measured.batches.map(batch => batch.length)).toEqual([2, 3]);
    expect(await dailyCount()).toBe(1);
    expect(await env.DB.prepare('SELECT last_seen_at FROM active_visitors').first())
      .toMatchObject({ last_seen_at: 990000 });
  });

  it('reclaims an expired slot in two SQL and resets its first-seen timestamp', async () => {
    await seedVisitor('expired', 800000);
    const measured = measuredRepository();
    await measured.repository.writeHeartbeat(args());
    expect(measured.batches.map(batch => batch.length)).toEqual([2]);
    expect(await dailyCount()).toBe(1);
    expect(await env.DB.prepare('SELECT visitor_id_hash, first_seen_at FROM active_visitors').first())
      .toMatchObject({ visitor_id_hash: 'visitor', first_seen_at: 1000000 });
  });

  it('retains the network cap and coalesces overflow without duplicate daily writes', async () => {
    await seedVisitor('one', 990000);
    await seedVisitor('two', 990000);
    const repository = createPresenceRepository(env);
    await repository.writeHeartbeat({ ...args(), maxVisitorsPerNetwork: 2 });
    await repository.writeHeartbeat({ ...args(), visitorHash: 'another', maxVisitorsPerNetwork: 2 });
    expect((await env.DB.prepare('SELECT visitor_id_hash FROM active_visitors ORDER BY visitor_id_hash').all()).results)
      .toEqual([{ visitor_id_hash: 'one' }, { visitor_id_hash: 'overflow' }, { visitor_id_hash: 'two' }]);
    expect(await dailyCount()).toBe(1);
    expect(await dailyCount('another')).toBe(1);
  });

  it('does not replace newer identity or timestamps with an older heartbeat', async () => {
    await seedVisitor('visitor', 1000001);
    await env.DB.prepare("UPDATE active_visitors SET principal_id = 'new-owner' WHERE visitor_id_hash = 'visitor'").run();
    await createPresenceRepository(env).writeHeartbeat(args());
    expect(await env.DB.prepare('SELECT principal_id, last_seen_at FROM active_visitors').first())
      .toEqual({ principal_id: 'new-owner', last_seen_at: 1000001 });
    expect(await dailyCount()).toBe(1);
  });

  it('preserves the daily network cap without skipping the active visitor update', async () => {
    await seedVisitor('visitor', 900000);
    await env.DB.prepare(`INSERT INTO visitor_daily_presence
      (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES ('2026-10-31', 'prior', 'network', 900000, 900000, 1)`).run();
    await createPresenceRepository(env).writeHeartbeat({ ...args(), dailyVisitorLimit: 1 });
    expect(await dailyCount()).toBe(0);
    expect(await env.DB.prepare('SELECT last_seen_at FROM active_visitors').first())
      .toMatchObject({ last_seen_at: 1000000 });
  });

  it.each(['existing', 'new'])('rolls back both visitor and daily writes when the %s path fails', async path => {
    if (path === 'existing') await seedVisitor('visitor', 900000);
    await expect(createPresenceRepository(env).writeHeartbeat({ ...args(), visitDate: null })).rejects.toThrow();
    expect(await env.DB.prepare('SELECT last_seen_at FROM active_visitors').first())
      .toEqual(path === 'existing' ? { last_seen_at: 900000 } : null);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM visitor_daily_presence').first()).toEqual({ count: 0 });
  });

  it('clears public practice when another heartbeat inserts the visitor between the two batches', async () => {
    const measured = measuredRepository(async batchIndex => {
      if (batchIndex !== 0) return;
      await seedVisitor('visitor', 999999);
      await env.DB.prepare(`UPDATE active_visitors SET principal_id = 'old-owner',
        practice_visible = 1, practice_activity = 'meditation' WHERE visitor_id_hash = 'visitor'`).run();
    });
    await measured.repository.writeHeartbeat(args());
    expect(await env.DB.prepare('SELECT principal_id, practice_visible, practice_activity FROM active_visitors').first())
      .toEqual({ principal_id: null, practice_visible: 0, practice_activity: null });
    expect(await dailyCount()).toBe(1);
  });
});

function measuredRepository(afterBatch) {
  const batches = [], sql = [], bindings = [];
  const repository = createPresenceRepository({ DB: {
    prepare(query) {
      return { bind(...values) {
        sql.push(query); bindings.push(values);
        return env.DB.prepare(query).bind(...values);
      } };
    },
    async batch(statements) {
      const result = await env.DB.batch(statements);
      const index = batches.length;
      batches.push(result);
      await afterBatch?.(index);
      return result;
    },
  } });
  return { repository, batches, sql, bindings };
}

async function seedVisitor(id, seenAt) {
  await env.DB.prepare(`INSERT INTO active_visitors
    (visitor_id_hash, network_hash, first_seen_at, last_seen_at) VALUES (?, 'network', ?, ?)`)
    .bind(id, seenAt, seenAt).run();
}

async function dailyCount(visitor = 'visitor') {
  return (await env.DB.prepare('SELECT heartbeat_count FROM visitor_daily_presence WHERE visitor_id_hash = ?')
    .bind(visitor).first())?.heartbeat_count ?? 0;
}

function args() {
  return {
    activeCutoff: 880000, writeCutoff: 955000, dailyVisitorLimit: 200,
    maxVisitorsPerNetwork: 20, networkHash: 'network', overflowHash: 'overflow',
    visitorHash: 'visitor', visitDate: '2026-10-31',
    record: { browserName: 'browser', currentPath: '/', deviceType: 'phone', displayName: null,
      firstSeenAt: 1000000, lastSeenAt: 1000000, isOverflow: false, operatingSystem: 'Android',
      principalId: null, role: null, practiceVisible: false, practiceActivity: null, practiceStartedAt: null },
  };
}
