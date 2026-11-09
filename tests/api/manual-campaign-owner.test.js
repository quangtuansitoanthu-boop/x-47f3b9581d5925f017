import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import activeVisitorsSchema from '../../migrations/0008-active-visitors.sql?raw';
import presenceSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import activitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import communitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import { createPracticeCommunityRepository } from '../../src/lib/server/repositories/practice-community-repository.ts';

const now = '2026-10-28T12:00:00.000Z';
const input = { campaignId: 'shared-campaign', ownerId: 'owner-a', logId: 1234,
  type: 'Chép kinh', count: 108, date: '2026-10-28', metric: 'count', now };

beforeAll(async () => {
  await applyD1Migrations(env.DB, [applicationSchema, authSchema, activeVisitorsSchema,
    presenceSchema, activitySchema, communitySchema].map((sql, index) => ({
      name: `manual-owner-${index}`, queries: sql.trim().split(/;\s*\n\s*\n/gu)
        .map(statement => statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`),
    })));
});

beforeEach(async () => {
  for (const table of ['practice_campaign_contributions', 'practice_campaign_members',
    'practice_campaigns', 'practice_profiles', 'practice_sessions', 'app_users']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(`INSERT INTO app_users(id, display_name, role, created_at, updated_at)
    VALUES ('owner-a', 'A', 'user', ?, ?), ('owner-b', 'B', 'user', ?, ?)`)
    .bind(now, now, now, now).run();
  await createPracticeCommunityRepository(env).createCampaign({ id: input.campaignId,
    title: 'Shared campaign', description: '', metric: 'count', goal_value: 10000,
    starts_at: '2020-01-01', ends_at: '2030-01-01', status: 'active',
    created_by: 'owner-a', created_at: now, updated_at: now });
});

describe('manual campaign contribution owner isolation', () => {
  it('keeps identical local log IDs independent, idempotent and independently deletable', async () => {
    const batches = [];
    const prepared = [];
    const repository = createPracticeCommunityRepository({ DB: {
      prepare(sql) { prepared.push(sql); return env.DB.prepare(sql); },
      batch(statements) { batches.push(statements.length); return env.DB.batch(statements); },
    } });
    await repository.recordManualCampaignContribution(input);
    await repository.recordManualCampaignContribution({ ...input, ownerId: 'owner-b', count: 54 });
    await repository.recordManualCampaignContribution({ ...input, count: 150 });
    expect(batches).toEqual([2, 2, 2]);
    expect(prepared).toHaveLength(6);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT id FROM practice_sessions
      WHERE owner_id = ? AND client_session_id = ?`)
      .bind('owner-a', `manual:${input.campaignId}:${input.logId}`).all();
    expect(plan.results.map(row => row.detail).join(' ')).toMatch(/SEARCH practice_sessions USING INDEX/u);
    const rows = await env.DB.prepare(`SELECT owner_id, contribution_value
      FROM practice_campaign_contributions ORDER BY owner_id`).all();
    expect(rows.results).toEqual([
      { owner_id: 'owner-a', contribution_value: 150 },
      { owner_id: 'owner-b', contribution_value: 54 },
    ]);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_sessions').first()).count).toBe(2);
    await expect(repository.deleteManualCampaignContribution('owner-a', input.campaignId, input.logId)).resolves.toBe(true);
    expect((await env.DB.prepare('SELECT owner_id, contribution_value FROM practice_campaign_contributions').all()).results)
      .toEqual([{ owner_id: 'owner-b', contribution_value: 54 }]);
  });

  it('reuses a released-app legacy physical ID while another owner uses the same local ID', async () => {
    const legacyId = `manual:${input.campaignId}:${input.logId}`;
    await env.DB.prepare(`INSERT INTO practice_sessions(id, owner_id, client_session_id,
      activity_type, status, accepted_count, started_at, completed_at, verification_result,
      idempotency_key, created_at, updated_at)
      VALUES (?, 'owner-a', ?, 'scripture', 'completed', 10, ?, ?, 'accepted', ?, ?, ?)`)
      .bind(legacyId, legacyId, now, now, legacyId, now, now).run();
    await env.DB.prepare(`INSERT INTO practice_campaign_contributions
      (campaign_id, session_id, owner_id, contribution_value, created_at) VALUES (?, ?, 'owner-a', 10, ?)`)
      .bind(input.campaignId, legacyId, now).run();
    const repository = createPracticeCommunityRepository(env);
    await repository.recordManualCampaignContribution({ ...input, count: 150 });
    await repository.recordManualCampaignContribution({ ...input, ownerId: 'owner-b', count: 54 });
    expect(await env.DB.prepare("SELECT id, client_session_id, accepted_count FROM practice_sessions WHERE owner_id = 'owner-a'").first())
      .toEqual({ id: legacyId, client_session_id: legacyId, accepted_count: 150 });
    expect(await env.DB.prepare("SELECT session_id, contribution_value FROM practice_campaign_contributions WHERE owner_id = 'owner-a'").first())
      .toEqual({ session_id: legacyId, contribution_value: 150 });
    await repository.deleteManualCampaignContribution('owner-a', input.campaignId, input.logId);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE owner_id = 'owner-b'").first()).count).toBe(1);
  });

  it('rolls back the accepted session when its contribution cannot be written', async () => {
    const repository = createPracticeCommunityRepository(env);
    await expect(repository.recordManualCampaignContribution({ ...input, campaignId: 'missing-campaign' })).rejects.toThrow();
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_sessions').first()).count).toBe(0);
  });
});
