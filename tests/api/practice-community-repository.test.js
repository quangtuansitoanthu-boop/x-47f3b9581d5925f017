import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import activeVisitorsSchema from '../../migrations/0008-active-visitors.sql?raw';
import presenceSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import activitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import communitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import performanceSchema from '../../migrations/0025-performance-checkpoints.sql?raw';
import repliesSchema from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import moderationSchema from '../../migrations/0038-ugc-moderation.sql?raw';
import reportVersionsSchema from '../../migrations/0040-ugc-report-versions.sql?raw';
import { createPracticeSessionRepository } from '../../src/lib/server/repositories/practice-session-repository.ts';
import { createPracticeCommunityRepository } from '../../src/lib/server/repositories/practice-community-repository.ts';
import { createPracticeCommunityService } from '../../src/lib/server/services/practice-community.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0008-active-visitors.sql', queries: splitMigration(activeVisitorsSchema) },
    { name: '0013-admin-dashboard-analytics.sql', queries: splitMigration(presenceSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(activitySchema) },
    { name: '0020-practice-community-achievements.sql', queries: splitMigration(communitySchema) },
    { name: '0022-comment-replies-and-album-plays.sql', queries: splitMigration(repliesSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0038-ugc-moderation.sql', queries: moderationSchema.split(';').map(query => query.trim()).filter(Boolean).map(query => `${query};`) },
    { name: '0040-ugc-report-versions.sql', queries: reportVersionsSchema.split(';').map(query => query.trim()).filter(Boolean).map(query => `${query};`) },
  ]);
});

beforeEach(async () => {
  for (const table of [
    'practice_campaign_contributions', 'practice_campaign_members', 'practice_campaigns',
    'practice_profiles', 'practice_sessions', 'app_users',
  ]) await env.DB.prepare(`DELETE FROM ${table}`).run();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('owner-a', 'Chủ A', 'user', ?, ?), ('owner-b', 'Chủ B', 'user', ?, ?), ('admin-a', 'Quản trị', 'admin', ?, ?)`)
      .bind(now(0), now(0), now(0), now(0), now(0), now(0)),
  ]);
});

describe('practice community repository', () => {
  it('recovers saved practice names when the original content is unavailable without crossing owners', async () => {
    const sessions = createPracticeSessionRepository(env);
    for (const [owner, sourceId, evidence] of [
      ['owner-a', 'tt_1781742129070', { title: 'NGHI THỨC TỤNG KINH' }],
      ['owner-b', 'tt_1781742129070', { title: 'Private other owner title' }],
      ['owner-a', 'KINH ĐỊA TẠNG', { legacyType: 'Tụng kinh', note: 'KINH ĐỊA TẠNG' }],
      ['owner-a', 'tt_1781742129071', { title: 123, articleTitle: 'KINH PHỔ MÔN' }],
    ]) {
      const clientId = `${owner}:${sourceId}`;
      await sessions.start(owner, clientId, {
        activityType: 'scripture', clientSessionId: clientId, idempotencyKey: clientId,
        sourceId, sourceKind: evidence.legacyType ? 'legacy_import' : 'article', startedAt: now(0), targetCount: 1, targetDurationSeconds: null,
      }, now(0));
      await sessions.complete(owner, clientId, {
        acceptedCount: 1, acceptedDurationSeconds: 0, completedAt: now(1),
        evidenceSummary: evidence, verificationReason: null, verificationResult: 'accepted',
      }, now(1));
    }
    const result = await createPracticeCommunityRepository(env).practiceBreakdown('owner-a');
    expect(result.results.map(row => row.display_title).sort()).toEqual(['KINH PHỔ MÔN', 'KINH ĐỊA TẠNG', 'NGHI THỨC TỤNG KINH'].sort());
    expect(result.results.map(row => row.accepted_count)).toEqual([1, 1, 1]);
  });

  it('keeps units separate within campaigns and does not assign grouped tool totals to a single note', async () => {
    const sessions = createPracticeSessionRepository(env);
    const rows = [
      ['tool-a', 'completed-tool:Lễ Phật', 'Lễ Phật', 108, 'Lễ Phật — A'],
      ['tool-b', 'completed-tool:Lễ Phật', 'Lễ Phật', 87, 'Lễ Phật — B'],
      ['campaign-bow', 'campaign-1', 'Lễ Phật', 3, 'Lễ Phật — C'],
      ['campaign-chant', 'campaign-1', 'Niệm danh hiệu', 108, 'Nam mô A Di Đà Phật'],
    ];
    for (const [clientId, sourceId, type, count, note] of rows) {
      await sessions.start('owner-a', clientId, { activityType: 'rosary', clientSessionId: clientId,
        idempotencyKey: clientId, sourceId, sourceKind: 'manual_log', startedAt: now(0), targetCount: count, targetDurationSeconds: null }, now(0));
      await sessions.complete('owner-a', clientId, { acceptedCount: count, acceptedDurationSeconds: 0,
        completedAt: now(1), evidenceSummary: { type, note }, verificationReason: null, verificationResult: 'accepted' }, now(1));
    }
    const result = await createPracticeCommunityRepository(env).practiceBreakdown('owner-a');
    expect(result.results.find(row => row.source_id === 'completed-tool:Lễ Phật')).toMatchObject({
      practice_type: 'Lễ Phật', accepted_count: 195, session_count: 2, display_title: null,
    });
    expect(result.results.filter(row => row.source_id === 'campaign-1').map(row => [row.practice_type, row.accepted_count]))
      .toEqual([[null, 108], ['Lễ Phật', 3]]);
    expect(result.results.reduce((sum, row) => sum + row.accepted_count, 0)).toBe(306);
  });

  it('uses the shared article title for aggregated chapters when deleted content no longer joins', async () => {
    const sessions = createPracticeSessionRepository(env);
    for (const chapter of ['Phẩm 1', 'Phẩm 2']) {
      await sessions.start('owner-a', chapter, { activityType: 'scripture', clientSessionId: chapter,
        idempotencyKey: chapter, sourceId: 'tt_deleted', sourceKind: 'article', startedAt: now(0), targetCount: 1, targetDurationSeconds: null }, now(0));
      await sessions.complete('owner-a', chapter, { acceptedCount: 1, acceptedDurationSeconds: 0, completedAt: now(1),
        evidenceSummary: { articleTitle: 'KINH ĐỊA TẠNG', title: `KINH ĐỊA TẠNG — ${chapter}` }, verificationReason: null, verificationResult: 'accepted' }, now(1));
    }
    expect((await createPracticeCommunityRepository(env).practiceBreakdown('owner-a')).results).toMatchObject([
      { display_title: 'KINH ĐỊA TẠNG', accepted_count: 2, session_count: 2 },
    ]);
  });

  it('acknowledges accepted completion with the production snapshot-revision trigger exactly once', async () => {
    await applyD1Migrations(env.DB, [
      { name: '0025-performance-checkpoints.sql', queries: splitMigration(performanceSchema) },
    ]);
    const repository = createPracticeSessionRepository(env);
    const start = {
      activityType: 'rosary', clientSessionId: 'trigger-session', idempotencyKey: 'trigger-session',
      sourceId: 'Nam mô A Di Đà Phật', sourceKind: 'guided_rosary', startedAt: now(0),
      targetCount: 18, targetDurationSeconds: null,
    };
    expect(await repository.start('owner-a', 'trigger-session', start, now(0))).toBe(true);
    const completion = {
      acceptedCount: 18, acceptedDurationSeconds: 60, completedAt: now(1),
      evidenceSummary: {}, verificationReason: null, verificationResult: 'accepted',
    };
    expect(await repository.complete('owner-a', 'trigger-session', completion, now(1))).toBe(true);
    expect(await repository.complete('owner-a', 'trigger-session', completion, now(1))).toBe(false);
    expect(await env.DB.prepare("SELECT revision FROM practice_snapshot_revisions WHERE owner_id = 'owner-a'").first())
      .toMatchObject({ revision: 1 });
  });

  it('isolates equal manual log IDs across owners while retaining legacy session IDs on retry', async () => {
    const executedBatches = [];
    const repository = createPracticeCommunityRepository({ DB: {
      prepare: sql => env.DB.prepare(sql),
      async batch(statements) {
        const results = await env.DB.batch(statements);
        executedBatches.push(results);
        return results;
      },
    } });
    await repository.createCampaign({
      id: 'manual-owner-scope', title: 'Công phu', description: '', metric: 'count', goal_value: 108,
      starts_at: now(0), ends_at: now(20), status: 'active', created_by: 'admin-a',
      created_at: now(0), updated_at: now(0),
    });
    const input = { campaignId: 'manual-owner-scope', logId: 1793421000000, type: 'Niệm danh hiệu',
      count: 18, date: '2026-09-04', metric: 'count', now: now(1) };
    await repository.recordManualCampaignContribution({ ...input, ownerId: 'owner-a' });
    const clientId = `manual:${input.campaignId}:${input.logId}`;
    const original = await env.DB.prepare('SELECT id FROM practice_sessions WHERE owner_id = ? AND client_session_id = ?')
      .bind('owner-a', clientId).first();
    await env.DB.prepare('DELETE FROM practice_campaign_contributions WHERE session_id = ?').bind(original.id).run();
    await env.DB.prepare('UPDATE practice_sessions SET id = ? WHERE id = ?').bind(clientId, original.id).run();
    await repository.recordManualCampaignContribution({ ...input, ownerId: 'owner-a', count: 36 });
    await repository.recordManualCampaignContribution({ ...input, ownerId: 'owner-b' });
    expect(executedBatches.map(results => results.length)).toEqual([2, 2, 2]);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN
      SELECT id FROM practice_sessions WHERE owner_id = ? AND client_session_id = ?`)
      .bind('owner-a', clientId).all();
    expect(plan.results.some(row => row.detail.includes('SEARCH')
      && row.detail.includes('owner_id=? AND client_session_id=?'))).toBe(true);
    expect((await env.DB.prepare(`SELECT owner_id, client_session_id, accepted_count FROM practice_sessions
      ORDER BY owner_id`).all()).results).toEqual([
      { owner_id: 'owner-a', client_session_id: clientId, accepted_count: 36 },
      { owner_id: 'owner-b', client_session_id: clientId, accepted_count: 18 },
    ]);
    expect((await env.DB.prepare(`SELECT owner_id, contribution_value FROM practice_campaign_contributions
      ORDER BY owner_id`).all()).results).toEqual([
      { owner_id: 'owner-a', contribution_value: 36 }, { owner_id: 'owner-b', contribution_value: 18 },
    ]);
    expect(await env.DB.prepare('SELECT id FROM practice_sessions WHERE owner_id = ?').bind('owner-a').first())
      .toMatchObject({ id: clientId });
    expect(await repository.deleteManualCampaignContribution('owner-a', input.campaignId, input.logId)).toBe(true);
    expect((await env.DB.prepare('SELECT owner_id FROM practice_sessions').all()).results)
      .toEqual([{ owner_id: 'owner-b' }]);
  });

  it('rolls back the manual session when its contribution cannot be committed', async () => {
    const repository = createPracticeCommunityRepository(env);
    await expect(repository.recordManualCampaignContribution({
      ownerId: 'owner-a', campaignId: 'missing-campaign', logId: 1793421000001,
      type: 'Niệm danh hiệu', count: 18, date: '2026-09-04', metric: 'count', now: now(1),
    })).rejects.toThrow();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_sessions').first()).toEqual({ count: 0 });
  });

  it('keeps profiles private by default and only projects opted-in accepted activity', async () => {
    const community = createPracticeCommunityRepository(env);
    const sessions = createPracticeSessionRepository(env);
    await seedAcceptedSession(sessions, 'owner-a', 'session-a', 18, 600);
    await seedAcceptedSession(sessions, 'owner-b', 'session-b', 27, 900);

    await community.upsertProfile('owner-a', {
      leaderboardOptIn: true,
      presenceOptIn: false,
      selectedBadge: null,
      timeZone: 'Asia/Ho_Chi_Minh',
    }, now(3));
    await approvePublicIdentity('owner-a');
    await expect(community.getProfile('owner-b')).resolves.toBeNull();
    await expect(community.acceptedTotals('owner-a')).resolves.toEqual({
      acceptedCount: 18,
      acceptedDurationSeconds: 600,
      sessions: 1,
    });
    await expect(community.listPublicAcceptedActivitiesPage(now(0), now(10), null, 100)).resolves.toMatchObject({
      results: [expect.objectContaining({ owner_id: 'owner-a', accepted_count: 18 })],
    });
  });

  it('counts each accepted session once for joined active campaigns', async () => {
    const community = createPracticeCommunityRepository(env);
    const sessions = createPracticeSessionRepository(env);
    await expect(community.createCampaign({
      id: 'campaign-a', title: 'Cùng tinh tấn', description: 'Mục tiêu chung', metric: 'count',
      goal_value: 108, starts_at: now(0), ends_at: now(20), status: 'active',
      created_by: 'admin-a', created_at: now(0), updated_at: now(0),
    })).resolves.toBe(true);
    await community.joinCampaign('campaign-a', 'owner-a', now(1));
    await seedAcceptedSession(sessions, 'owner-a', 'session-a', 54, 600);

    await expect(community.contributeAcceptedSession('session-a', 'owner-a', now(4))).resolves.toBe(1);
    await expect(community.contributeAcceptedSession('session-a', 'owner-a', now(5))).resolves.toBe(0);
    await expect(community.listCampaigns(true, now(5), 'owner-a')).resolves.toMatchObject({
      results: [expect.objectContaining({
        id: 'campaign-a', member_count: 1, contribution_value: 54, joined: 1,
      })],
    });
    await expect(community.listCampaignMembers('campaign-a')).resolves.toMatchObject({
      results: [expect.objectContaining({ owner_id: 'owner-a', contribution_value: 54 })],
    });

    await expect(community.updateCampaign('campaign-a', {
      title: 'Cùng tinh tấn đã sửa', description: 'Mục tiêu mới', metric: 'duration_seconds',
      goalValue: 2_000, startsAt: now(0), endsAt: now(20), status: 'active',
    }, now(5))).resolves.toBe(false);
    await expect(community.getCampaign('campaign-a')).resolves.toMatchObject({
      metric: 'count', starts_at: now(0), ends_at: now(20),
    });
    await expect(community.listCampaigns(true, now(5), 'owner-a')).resolves.toMatchObject({
      results: [expect.objectContaining({ contribution_value: 54 })],
    });
    await expect(community.updateCampaign('campaign-a', {
      title: 'Cùng tinh tấn đã sửa', description: 'Mục tiêu mới', metric: 'count',
      goalValue: 2_000, startsAt: now(0), endsAt: now(30), status: 'closed',
    }, now(6))).resolves.toBe(true);
    await expect(community.getCampaign('campaign-a')).resolves.toMatchObject({
      metric: 'count', starts_at: now(0), ends_at: now(30),
    });

    await community.leaveCampaign('campaign-a', 'owner-a', now(6));
    await seedAcceptedSession(sessions, 'owner-a', 'session-c', 54, 600, 7);
    await expect(community.contributeAcceptedSession('session-c', 'owner-a', now(8))).resolves.toBe(0);
  });

  it('never retroactively contributes sessions completed outside the current membership interval', async () => {
    const community = createPracticeCommunityRepository(env);
    const sessions = createPracticeSessionRepository(env);
    await community.createCampaign({
      id: 'campaign-membership', title: 'Đúng thời gian tham gia', description: '', metric: 'sessions',
      goal_value: 10, starts_at: now(0), ends_at: now(20), status: 'active',
      created_by: 'admin-a', created_at: now(0), updated_at: now(0),
    });

    await seedAcceptedSession(sessions, 'owner-a', 'before-join', 18, 60, 1);
    await community.joinCampaign('campaign-membership', 'owner-a', now(4));
    await expect(community.contributeAcceptedSession('before-join', 'owner-a', now(5))).resolves.toBe(0);

    await seedAcceptedSession(sessions, 'owner-a', 'during-first-membership', 18, 60, 5);
    await expect(community.contributeAcceptedSession('during-first-membership', 'owner-a', now(7))).resolves.toBe(1);
    await community.leaveCampaign('campaign-membership', 'owner-a', now(8));
    await seedAcceptedSession(sessions, 'owner-a', 'while-left', 18, 60, 8);
    await expect(community.contributeAcceptedSession('while-left', 'owner-a', now(10))).resolves.toBe(0);

    await community.joinCampaign('campaign-membership', 'owner-a', now(11));
    await expect(community.contributeAcceptedSession('while-left', 'owner-a', now(12))).resolves.toBe(0);
    await seedAcceptedSession(sessions, 'owner-a', 'after-rejoin', 18, 60, 12);
    await expect(community.contributeAcceptedSession('after-rejoin', 'owner-a', now(14))).resolves.toBe(1);
    await expect(community.listCampaigns(true, now(14), 'owner-a')).resolves.toMatchObject({
      results: [expect.objectContaining({ id: 'campaign-membership', contribution_value: 2 })],
    });
  });

  it('records and removes manual practice log contributions to campaigns', async () => {
    const community = createPracticeCommunityRepository(env);
    const service = createPracticeCommunityService(serviceContext('owner-a'));
    const testNow = new Date().toISOString();

    await community.createCampaign({
      id: 'campaign-manual', title: 'Chép kinh vạn biến', description: 'Chiến dịch chép kinh',
      metric: 'count', goal_value: 10000, starts_at: '2020-01-01T00:00:00.000Z', ends_at: '2030-01-01T00:00:00.000Z',
      status: 'active', created_by: 'admin-a', created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
    });

    // Contribute manual log via service
    const contributionResult = await service.contributeManualLog('campaign-manual', {
      logId: 1726372800000,
      type: 'Chép kinh',
      count: 108,
      date: '2026-09-04',
      note: 'Kinh Phổ Môn biến thứ nhất',
    });
    expect(contributionResult).toEqual({
      contributed: true,
      contributionValue: 108,
    });

    // Verify campaign totals and member list
    const campaignsAfterContribution = await community.listCampaigns(true, testNow, 'owner-a');
    expect(campaignsAfterContribution.results).toContainEqual(
      expect.objectContaining({
        id: 'campaign-manual',
        contribution_value: 108,
        member_count: 1,
        joined: 1,
      })
    );

    const members = await community.listCampaignMembers('campaign-manual');
    expect(members.results).toContainEqual(
      expect.objectContaining({
        owner_id: 'owner-a',
        contribution_value: 108,
      })
    );

    // Upserting the same log (e.g. user edits the log to 150 count) updates contribution
    await service.contributeManualLog('campaign-manual', {
      logId: 1726372800000,
      type: 'Chép kinh',
      count: 150,
      date: '2026-09-04',
      note: 'Kinh Phổ Môn cập nhật',
    });
    const campaignsAfterEdit = await community.listCampaigns(true, testNow, 'owner-a');
    expect(campaignsAfterEdit.results).toContainEqual(
      expect.objectContaining({
        id: 'campaign-manual',
        contribution_value: 150,
      })
    );

    // Deleting the manual log removes the contribution and cascades correctly
    const deleted = await service.deleteManualLogContribution('campaign-manual', 1726372800000);
    expect(deleted).toEqual({ deleted: true });

    const campaignsAfterDelete = await community.listCampaigns(true, testNow, 'owner-a');
    expect(campaignsAfterDelete.results).toContainEqual(
      expect.objectContaining({
        id: 'campaign-manual',
        contribution_value: 0,
      })
    );
  });

  it('cascades private profile and campaign membership when an account is deleted', async () => {
    const community = createPracticeCommunityRepository(env);
    await community.upsertProfile('owner-a', {
      leaderboardOptIn: true, presenceOptIn: true, selectedBadge: null, timeZone: 'UTC',
    }, now(1));
    await community.createCampaign({
      id: 'campaign-a', title: 'Chiến dịch', description: '', metric: 'sessions', goal_value: 10,
      starts_at: now(0), ends_at: now(20), status: 'active', created_by: 'admin-a',
      created_at: now(0), updated_at: now(0),
    });
    await community.joinCampaign('campaign-a', 'owner-a', now(1));
    await env.DB.prepare("DELETE FROM app_users WHERE id = 'owner-a'").run();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_profiles').first()).toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_campaign_members').first()).toMatchObject({ count: 0 });
  });
});

describe('practice community service', () => {
  it('returns a private 365-day dashboard and publishes only explicit leaderboard opt-in', async () => {
    const sessions = createPracticeSessionRepository(env);
    for (let day = 0; day < 7; day++) {
      await seedAcceptedSession(sessions, 'owner-a', `session-a-${day}`, day === 0 ? 10_000 : 100, 600, 8 - day * 1440);
    }
    await seedAcceptedSession(sessions, 'owner-b', 'session-b', 108, 900);
    const serviceA = createPracticeCommunityService(serviceContext('owner-a'), {
      now: () => new Date(now(10)),
    });
    const initial = await serviceA.privateProgress();
    expect(initial.heatmap).toHaveLength(365);
    expect(initial.profile).toMatchObject({ leaderboardOptIn: true, presenceOptIn: true });
    expect(initial.badges).toContain('streak-7');

    await serviceA.updateProfile({
      leaderboardOptIn: true,
      presenceOptIn: true,
      selectedBadge: 'streak-7',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    await approvePublicIdentity('owner-a');
    const leaderboard = await serviceA.leaderboard();
    expect(leaderboard.metric).toMatchObject({ key: 'accepted_count', windowDays: 30 });
    expect(leaderboard.ranking).toEqual([
      expect.objectContaining({
        acceptedCount: 10_600,
        displayName: 'Chủ A',
        rank: 1,
        selectedBadge: 'streak-7',
        sessions: 7,
      }),
    ]);
  });

  it('paginates beyond the former 50,000-row cap so a late true leader is ranked', async () => {
    const completedAt = '2026-09-04T11:00:00.000Z';
    const rows = Array.from({ length: 50_000 }, (_, index) => ({
      id: `bulk-${String(index).padStart(5, '0')}`,
      owner_id: 'owner-a',
      accepted_count: 1,
      accepted_duration_seconds: 60,
      completed_at: completedAt,
      display_name: 'Chủ A',
      avatar_url: '',
      time_zone: 'UTC',
      selected_badge: null,
    }));
    rows.push({
      id: 'late-true-leader',
      owner_id: 'owner-b',
      accepted_count: 60_000,
      accepted_duration_seconds: 60,
      completed_at: '2026-09-04T11:01:00.000Z',
      display_name: 'Chủ B',
      avatar_url: '',
      time_zone: 'UTC',
      selected_badge: null,
    });
    let offset = 0;
    const repository = {
      async listPublicAcceptedActivitiesPage(_from, _to, _cursor, limit) {
        const page = rows.slice(offset, offset + limit);
        offset += page.length;
        return { results: page };
      },
    };
    const service = createPracticeCommunityService(serviceContext('owner-a'), {
      repository,
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    const leaderboard = await service.leaderboard();

    expect(offset).toBe(50_001);
    expect(leaderboard.ranking[0]).toMatchObject({ displayName: 'Chủ B', acceptedCount: 60_000 });
  }, 15_000);

  it('preserves an all-time historical streak badge outside the 365-day heatmap window', async () => {
    const community = createPracticeCommunityRepository(env);
    const firstDay = Date.parse('2024-01-01T12:00:00.000Z');
    await env.DB.batch(Array.from({ length: 100 }, (_, index) => {
      const completedAt = new Date(firstDay + index * 86_400_000).toISOString();
      return env.DB.prepare(`
        INSERT INTO practice_sessions (
          id, owner_id, client_session_id, activity_type, status,
          accepted_duration_seconds, accepted_count, started_at, completed_at,
          verification_result, evidence_summary_json, idempotency_key, created_at, updated_at
        ) VALUES (?, 'owner-a', ?, 'meditation', 'completed', 60, 0, ?, ?,
          'accepted', '{}', ?, ?, ?)
      `).bind(
        `historic-${index}`,
        `historic-${index}`,
        completedAt,
        completedAt,
        `historic-key-${index}`,
        completedAt,
        completedAt,
      );
    }));
    await community.upsertProfile('owner-a', {
      leaderboardOptIn: false,
      presenceOptIn: false,
      selectedBadge: 'streak-90',
      timeZone: 'UTC',
    }, now(1));
    const service = createPracticeCommunityService(serviceContext('owner-a'), {
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    const progress = await service.privateProgress();

    expect(progress.heatmap).toHaveLength(365);
    expect(progress.heatmap.every((day) => day.active === false)).toBe(true);
    expect(progress.streaks).toEqual({ current: 0, longest: 100 });
    expect(progress.badges).toContain('streak-90');
    expect(progress.profile.selectedBadge).toBe('streak-90');
  });

  it('validates unearned badges and manages campaign membership', async () => {
    const serviceA = createPracticeCommunityService(serviceContext('owner-a'), {
      createId: () => 'campaign-service',
      now: () => new Date(now(10)),
    });
    await expect(serviceA.updateProfile({
      leaderboardOptIn: false, presenceOptIn: false, selectedBadge: 'streak-100', timeZone: 'UTC',
    })).rejects.toMatchObject({ code: 'badge_not_earned' });

    const created = await serviceA.createCampaign({
      title: 'Cùng hành trì', description: '', metric: 'sessions', goalValue: 100,
      startsAt: now(0), endsAt: now(20), status: 'active',
    });
    expect(created.campaign).toMatchObject({ id: 'campaign-service', goalValue: 100 });
    await expect(serviceA.joinCampaign('campaign-service')).resolves.toEqual({ joined: true });
    await expect(serviceA.listCampaigns()).resolves.toMatchObject({
      campaigns: [expect.objectContaining({ id: 'campaign-service', joined: true })],
    });
    await expect(serviceA.leaveCampaign('campaign-service')).resolves.toEqual({ left: true });
    await expect(serviceA.deleteCampaign('campaign-service')).resolves.toEqual({ deleted: true });
    await expect(env.DB.prepare(`SELECT COUNT(*) AS count FROM practice_campaign_members
      WHERE campaign_id = 'campaign-service'`).first()).resolves.toMatchObject({ count: 0 });
    await expect(serviceA.deleteCampaign('campaign-service')).rejects.toMatchObject({ code: 'campaign_not_found' });
  });

  it('automatically backfills legacy practice logs from user_sync_data into practice sessions without data loss', async () => {
    const ownerId = 'owner-legacy';
    await env.DB.prepare(`INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES (?, 'Người Tu Cũ', 'user', ?, ?)`).bind(ownerId, now(0), now(0)).run();

    const legacyLogs = [
      {
        id: 1700000001000,
        date: '2026-09-01',
        type: 'Niệm danh hiệu',
        count: 108,
        note: 'Niệm Phật A Di Đà',
        created: '2026-09-01T10:00:00.000Z',
      },
      {
        id: 1700000002000,
        date: '2026-09-02',
        type: 'Tụng kinh',
        count: 3,
        note: 'Kinh Phổ Môn',
        created: '2026-09-02T14:30:00.000Z',
      },
      {
        id: 1700000003000,
        date: '2026-09-03',
        type: 'Ngồi thiền',
        count: 1,
        note: 'Ngồi thiền 20 phút',
        created: '2026-09-03T19:00:00.000Z',
      },
    ];

    // Seed into legacy user_sync_data
    await env.DB.prepare(`
      INSERT INTO user_sync_data (id, practice_logs, bookmarks, listened_history, updated_at)
      VALUES (?, ?, '[]', '[]', ?)
    `).bind(ownerId, JSON.stringify(legacyLogs), now(0)).run();

    const service = createPracticeCommunityService(serviceContext(ownerId));
    const progress = await service.privateProgress();

    // Verify totals aggregated legacy sessions
    expect(progress.totals.acceptedCount).toBe(112); // 108 + 3 + 1
    expect(progress.totals.sessions).toBe(3);

    // Verify practice sessions table was populated with idempotent keys
    const storedSessions = await env.DB.prepare(`
      SELECT client_session_id, activity_type, accepted_count, status, verification_result, source_kind
      FROM practice_sessions WHERE owner_id = ? ORDER BY completed_at ASC
    `).bind(ownerId).all();

    expect(storedSessions.results).toHaveLength(3);
    expect(storedSessions.results[0]).toMatchObject({
      client_session_id: 'legacy_import_1700000001000',
      activity_type: 'rosary',
      accepted_count: 108,
      status: 'completed',
      verification_result: 'accepted',
      source_kind: 'legacy_import',
    });
    expect(storedSessions.results[1]).toMatchObject({
      client_session_id: 'legacy_import_1700000002000',
      activity_type: 'scripture',
      accepted_count: 3,
    });
    expect(storedSessions.results[2]).toMatchObject({
      client_session_id: 'legacy_import_1700000003000',
      activity_type: 'meditation',
      accepted_count: 1,
    });

    // Verify user_sync_data was preserved unchanged (ZERO DATA LOSS)
    const syncRow = await env.DB.prepare('SELECT practice_logs FROM user_sync_data WHERE id = ?').bind(ownerId).first();
    expect(JSON.parse(syncRow.practice_logs)).toEqual(legacyLogs);

    // Verify idempotency: calling privateProgress again does not duplicate
    const progressSecond = await service.privateProgress();
    expect(progressSecond.totals.acceptedCount).toBe(112);
    expect(progressSecond.totals.sessions).toBe(3);
  });
});

async function seedAcceptedSession(repository, ownerId, id, count, seconds, offset = 2) {
  await repository.start(ownerId, id, {
    activityType: 'rosary', clientSessionId: id, idempotencyKey: `key-${id}`,
    sourceId: null, sourceKind: null, startedAt: now(offset), targetCount: count,
    targetDurationSeconds: null,
  }, now(offset));
  await repository.complete(ownerId, id, {
    acceptedCount: count, acceptedDurationSeconds: seconds, completedAt: now(offset + 1),
    evidenceSummary: { acceptedCount: count }, verificationReason: null,
    verificationResult: 'accepted',
  }, now(offset + 1));
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

function now(offsetMinutes) {
  return new Date(Date.parse('2026-09-04T12:00:00.000Z') + offsetMinutes * 60_000).toISOString();
}

async function approvePublicIdentity(ownerId) {
  // This fixture represents an explicit moderator approval, never a private default.
  await env.DB.prepare(`INSERT INTO ugc_public_profiles
    (public_id, owner_id, submitted_display_name, submitted_avatar_url, approved_display_name,
      approved_avatar_url, moderation_status, submitted_at, approved_revision)
    SELECT 'public-' || u.id, u.id, u.display_name, COALESCE(u.avatar_url, ''), u.display_name,
      COALESCE(u.avatar_url, ''), 'approved', ?, 1 FROM app_users u WHERE u.id = ?
    ON CONFLICT(owner_id) DO UPDATE SET approved_display_name = excluded.approved_display_name,
      approved_avatar_url = excluded.approved_avatar_url, moderation_status = 'approved', revision = ugc_public_profiles.revision + 1, approved_revision = ugc_public_profiles.approved_revision + 1`)
    .bind(now(3), ownerId).run();
}

function serviceContext(ownerId) {
  return {
    env,
    principal: { appUserId: ownerId, userId: ownerId, displayName: ownerId, role: 'user' },
    requestId: 'practice-community-test',
  };
}
