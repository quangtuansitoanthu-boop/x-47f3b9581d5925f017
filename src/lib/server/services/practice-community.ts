import { normalizeCompletedLogs } from '../../domain/practice/completed-logs';
import {
  aggregatePracticeDays,
  buildPracticeHeatmap,
  calculatePracticeStreaks,
  dateKeyInTimeZone,
  earnedPracticeBadges,
  normalizeSelectedPracticeBadge,
  type PracticeBadgeId,
} from '../../domain/practice/progress-achievements';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createCommunityModerationRepository } from '../repositories/community-moderation-repository';
import {
  createPracticeCommunityRepository,
  type AcceptedPracticeActivityRow,
  type PracticeCampaignRow,
  type PublicPracticeActivityRow,
} from '../repositories/practice-community-repository';

type Repository = ReturnType<typeof createPracticeCommunityRepository>;
const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function createPracticeCommunityService(
  context: CloudflareRequestContext,
  dependencies: { createId?: () => string; now?: () => Date; repository?: Repository } = {},
) {
  const { env: bindings } = context;
  const repository = dependencies.repository ?? createPracticeCommunityRepository(bindings);
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const ownerId = () => {
    const owner = context.principal?.appUserId;
    if (!owner) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return owner;
  };

  const privateProgress = async () => {
    const owner = ownerId();
    await repository.backfillLegacyPracticeLogs?.(owner);
    const profileRow = await repository.getProfile(owner);
    const profile = profileRow ? {
      leaderboardOptIn: profileRow.leaderboard_opt_in === 1,
      presenceOptIn: profileRow.presence_opt_in === 1,
      selectedBadge: profileRow.selected_badge as PracticeBadgeId | null,
      timeZone: validTimeZone(profileRow.time_zone),
      publicProfile: profileRow.public_author_id ? {
        authorId: profileRow.public_author_id, moderationStatus: profileRow.public_moderation_status,
        moderationReason: profileRow.public_moderation_reason ?? null, revision: profileRow.public_revision,
      } : null,
    } : {
      leaderboardOptIn: true,
      presenceOptIn: true,
      selectedBadge: null,
      timeZone: DEFAULT_TIME_ZONE,
    };
    const current = now();
    const [activitiesResult, totals, breakdownResult] = await Promise.all([
      listAllAcceptedActivities(repository, owner, current.toISOString()),
      repository.acceptedTotals(owner),
      repository.practiceBreakdown(owner),
    ]);
    const activities = activitiesResult.map((row) => ({
      acceptedCount: Number(row.accepted_count),
      acceptedDurationSeconds: Number(row.accepted_duration_seconds),
      completedAt: row.completed_at,
    }));
    const aggregates = aggregatePracticeDays(activities, profile.timeZone);
    const today = dateKeyInTimeZone(current, profile.timeZone);
    const streaks = calculatePracticeStreaks(aggregates, today);
    const badges = earnedPracticeBadges({ longestStreak: streaks.longest, totalAcceptedCount: totals.acceptedCount });
    const breakdown = (breakdownResult.results ?? []).map((row) => ({
      activityType: row.activity_type,
      practiceType: row.practice_type ?? null,
      sourceKind: row.source_kind ?? null,
      sourceId: row.source_id ?? null,
      title: row.display_title ?? null,
      sessionCount: Number(row.session_count),
      acceptedCount: Number(row.accepted_count),
      acceptedDurationSeconds: Number(row.accepted_duration_seconds),
    }));
    return {
      profile: {
        ...profile,
        selectedBadge: normalizeSelectedPracticeBadge(profile.selectedBadge, badges),
      },
      heatmap: buildPracticeHeatmap(aggregates, today),
      streaks,
      badges,
      totals,
      breakdown,
      today,
    };
  };

  return {
    privateProgress,

    async updateProfile(rawInput: unknown) {
      const row = inputRecord(rawInput);
      const timeZone = validTimeZone(String(row.timeZone || DEFAULT_TIME_ZONE));
      const leaderboardOptIn = strictBoolean(row.leaderboardOptIn, 'leaderboard_opt_in');
      const presenceOptIn = strictBoolean(row.presenceOptIn, 'presence_opt_in');
      const selectedCandidate = row.selectedBadge == null || row.selectedBadge === ''
        ? null
        : String(row.selectedBadge) as PracticeBadgeId;
      const progress = await privateProgress();
      const selectedBadge = normalizeSelectedPracticeBadge(selectedCandidate, progress.badges);
      if (selectedCandidate && !selectedBadge) {
        throw new ServerInputError(400, 'badge_not_earned', 'Huy hiệu chưa được mở khóa.');
      }
      await repository.upsertProfile(ownerId(), {
        timeZone, leaderboardOptIn, presenceOptIn, selectedBadge,
      }, now().toISOString());
      if (leaderboardOptIn || presenceOptIn) {
        await createCommunityModerationRepository(bindings).submitProfile(ownerId(), createId(), now().toISOString());
      }
      return privateProgress();
    },

    async leaderboard() {
      const current = now();
      const from = new Date(current.getTime() - 31 * 86_400_000).toISOString();
      const rows = await listAllPublicAcceptedActivities(repository, from, current.toISOString(), context.principal?.appUserId ?? null);
      const groups = groupPublicRows(rows);
      const ranking = [...groups.entries()].map(([id, group]) => {
        const today = dateKeyInTimeZone(current, group.timeZone);
        const aggregates = aggregatePracticeDays(group.activities, group.timeZone)
          .filter((day) => day.date >= shiftIsoDate(today, -29) && day.date <= today);
        const streaks = calculatePracticeStreaks(aggregates, today);
        return {
          id,
          displayName: group.displayName,
          avatarUrl: group.avatarUrl,
          authorId: group.authorId,
          isOwnProfile: group.isOwnProfile,
          selectedBadge: group.selectedBadge,
          activeDays: aggregates.filter((day) => day.sessionCount > 0).length,
          acceptedCount: aggregates.reduce((sum, day) => sum + day.acceptedCount, 0),
          acceptedDurationSeconds: aggregates.reduce((sum, day) => sum + day.acceptedDurationSeconds, 0),
          currentStreak: streaks.current,
          sessions: aggregates.reduce((sum, day) => sum + day.sessionCount, 0),
        };
      }).sort((left, right) => right.acceptedCount - left.acceptedCount
        || right.sessions - left.sessions
        || right.acceptedDurationSeconds - left.acceptedDurationSeconds
        || right.activeDays - left.activeDays
        || left.displayName.localeCompare(right.displayName, 'vi')
        || left.id.localeCompare(right.id))
        .slice(0, 10)
        .map(({ id: _id, ...entry }, index) => ({ ...entry, rank: index + 1 }));
      return {
        enabled: true,
        generatedAt: current.toISOString(),
        metric: {
          key: 'accepted_count',
          windowDays: 30,
          description: 'Xếp theo số biến công phu hợp lệ trong 30 ngày; số phiên, thời lượng và số ngày hoạt động dùng để phân hạng khi bằng nhau.',
        },
        ranking,
      };
    },

    async listCampaigns(includeDrafts = false) {
      const rows = await repository.listCampaigns(
        includeDrafts,
        now().toISOString(),
        context.principal?.appUserId ?? null,
      );
      return { enabled: true, campaigns: (rows.results ?? []).map(serializeCampaign) };
    },

    async createCampaign(rawInput: unknown) {
      const input = campaignInput(rawInput);
      const createdAt = now().toISOString();
      const campaignId = createId();
      const created = await repository.createCampaign({
        id: campaignId,
        title: input.title,
        description: input.description,
        metric: input.metric,
        goal_value: input.goalValue,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: input.status,
        created_by: ownerId(),
        created_at: createdAt,
        updated_at: createdAt,
      });
      if (!created) throw new ServerInputError(409, 'campaign_conflict', 'Không thể tạo chiến dịch.');
      return { campaign: serializeCampaign((await repository.getCampaign(campaignId))!) };
    },

    async updateCampaign(campaignId: string, rawInput: unknown) {
      const id = boundedId(campaignId, 'campaign_id');
      const input = campaignInput(rawInput);
      if (!await repository.getCampaign(id)) {
        throw new ServerInputError(404, 'campaign_not_found', 'Không tìm thấy chiến dịch.');
      }
      const updated = await repository.updateCampaign(id, input, now().toISOString());
      if (!updated) {
        if (!await repository.getCampaign(id)) {
          throw new ServerInputError(404, 'campaign_not_found', 'Không tìm thấy chiến dịch.');
        }
        throw new ServerInputError(
          409,
          'campaign_definition_locked',
          'Không thể đổi chỉ số hoặc thời gian bắt đầu sau khi chiến dịch đã có đóng góp.',
        );
      }
      return { campaign: serializeCampaign((await repository.getCampaign(id))!) };
    },

    async deleteCampaign(campaignId: string) {
      const deleted = await repository.deleteCampaign(boundedId(campaignId, 'campaign_id'));
      if (!deleted) throw new ServerInputError(404, 'campaign_not_found', 'Không tìm thấy chiến dịch.');
      return { deleted: true };
    },

    async joinCampaign(campaignId: string) {
      const id = boundedId(campaignId, 'campaign_id');
      const campaign = await repository.getCampaign(id);
      const current = now().toISOString();
      if (!campaign || campaign.status !== 'active' || campaign.starts_at > current || campaign.ends_at < current) {
        throw new ServerInputError(404, 'campaign_not_active', 'Chiến dịch không hoạt động.');
      }
      await repository.joinCampaign(id, ownerId(), current);
      return { joined: true };
    },

    async leaveCampaign(campaignId: string) {
      const left = await repository.leaveCampaign(
        boundedId(campaignId, 'campaign_id'), ownerId(), now().toISOString(),
      );
      return { left };
    },

    async listCampaignMembers(campaignId: string) {
      const rows = await repository.listCampaignMembers(boundedId(campaignId, 'campaign_id'));
      return {
        members: (rows.results ?? []).map((row) => ({
          ownerId: row.owner_id,
          displayName: row.display_name?.trim() || 'Thành viên Quang Từ',
          avatarUrl: row.avatar_url || '',
          identityVisible: row.identity_visible === 1,
          joinedAt: row.joined_at,
          leftAt: row.left_at,
          contributionValue: Number(row.contribution_value ?? 0),
        })),
      };
    },

        async recordCompletedLogs(rawInput: unknown) {
      const owner = ownerId();
      const current = now();
      let logs;
      try { logs = normalizeCompletedLogs(rawInput, current); }
      catch { throw new ServerInputError(400, 'invalid_completed_logs', 'Công phu hoàn tất không hợp lệ.'); }
      return repository.recordCompletedLogs(owner, logs, current.toISOString());
    },

async contributeManualLog(campaignId: string, rawInput: unknown) {
      const id = boundedId(campaignId, 'campaign_id');
      const campaign = await repository.getCampaign(id);
      const current = now().toISOString();
      if (!campaign || campaign.status !== 'active' || campaign.starts_at > current || campaign.ends_at < current) {
        throw new ServerInputError(404, 'campaign_not_active', 'Chiến dịch không hoạt động.');
      }
      const input = manualLogInput(rawInput);
      const owner = ownerId();
      await repository.joinCampaign(id, owner, current);
      const result = await repository.recordManualCampaignContribution({
        campaignId: id,
        ownerId: owner,
        logId: input.logId,
        type: input.type,
        count: input.count,
        note: input.note,
        date: input.date,
        metric: campaign.metric,
        now: current,
      });
      return { contributed: true, ...result };
    },

    async deleteManualLogContribution(campaignId: string, logIdValue: unknown) {
      const id = boundedId(campaignId, 'campaign_id');
      const logId = Number(logIdValue);
      if (!Number.isFinite(logId) || logId <= 0) {
        throw new ServerInputError(400, 'invalid_log_id', 'Mã bản ghi không hợp lệ.');
      }
      const deleted = await repository.deleteManualCampaignContribution(ownerId(), id, logId);
      return { deleted };
    },
  };
}

function manualLogInput(raw: unknown): {
  logId: number;
  type: string;
  count: number;
  date: string;
  note: string;
} {
  const record = inputRecord(raw);
  const logId = Number(record.logId);
  const count = Math.max(1, Math.min(1_000_000, Number.parseInt(String(record.count ?? '1'), 10) || 1));
  const type = String(record.type || 'Chép kinh').trim().slice(0, 100);
  const date = String(record.date || '').trim();
  const note = String(record.note || '').trim().slice(0, 500);
  if (!Number.isFinite(logId) || logId <= 0) {
    throw new ServerInputError(400, 'invalid_log_id', 'Mã bản ghi không hợp lệ.');
  }
  return { logId, type, count, date, note };
}

async function listAllAcceptedActivities(repository: Repository, ownerId: string, toIso: string) {
  const activities: AcceptedPracticeActivityRow[] = [];
  let cursor: { completedAt: string; id: string } | null = null;
  const pageSize = 5_000;
  for (;;) {
    const page = await repository.listAcceptedActivitiesPage(ownerId, cursor, toIso, pageSize);
    const rows = page.results ?? [];
    activities.push(...rows);
    if (rows.length < pageSize) return activities;
    const last = rows.at(-1)!;
    cursor = { completedAt: last.completed_at, id: last.id };
  }
}

async function listAllPublicAcceptedActivities(repository: Repository, fromIso: string, toIso: string, viewerId: string | null) {
  const activities: PublicPracticeActivityRow[] = [];
  let cursor: { completedAt: string; id: string } | null = null;
  const pageSize = 5_000;
  for (;;) {
    const page = await repository.listPublicAcceptedActivitiesPage(fromIso, toIso, cursor, pageSize, viewerId);
    const rows = page.results ?? [];
    activities.push(...rows);
    if (rows.length < pageSize) return activities;
    const last = rows.at(-1)!;
    cursor = { completedAt: last.completed_at, id: last.id };
  }
}

function groupPublicRows(rows: PublicPracticeActivityRow[]) {
  const groups = new Map<string, {
    activities: Array<{ acceptedCount: number; acceptedDurationSeconds: number; completedAt: string }>;
    avatarUrl: string;
    authorId: string | undefined;
    isOwnProfile: boolean;
    displayName: string;
    selectedBadge: string | null;
    timeZone: string;
  }>();
  for (const row of rows) {
    const group = groups.get(row.owner_id) ?? {
      activities: [],
      avatarUrl: row.avatar_url || '',
      authorId: row.public_author_id,
      isOwnProfile: Boolean(row.is_own_profile),
      displayName: row.display_name?.trim() || 'Thành viên Quang Từ',
      selectedBadge: row.selected_badge,
      timeZone: row.time_zone ? validTimeZone(row.time_zone) : DEFAULT_TIME_ZONE,
    };
    group.activities.push({
      acceptedCount: Number(row.accepted_count),
      acceptedDurationSeconds: Number(row.accepted_duration_seconds),
      completedAt: row.completed_at,
    });
    groups.set(row.owner_id, group);
  }
  return groups;
}

function campaignInput(value: unknown) {
  const row = inputRecord(value);
  const title = String(row.title || '').trim();
  const description = String(row.description || '').trim();
  const metric = String(row.metric || 'sessions') as PracticeCampaignRow['metric'];
  const goalValue = Number(row.goalValue);
  const startsAt = normalizedDate(row.startsAt, 'starts_at');
  const endsAt = normalizedDate(row.endsAt, 'ends_at');
  const status = String(row.status || 'draft') as PracticeCampaignRow['status'];
  if (!title || title.length > 160 || description.length > 4_000) {
    throw new ServerInputError(400, 'invalid_campaign_text', 'Nội dung chiến dịch không hợp lệ.');
  }
  if (!['count', 'duration_seconds', 'sessions'].includes(metric)
    || !Number.isSafeInteger(goalValue) || goalValue <= 0
    || !['draft', 'active', 'closed'].includes(status)
    || endsAt <= startsAt) {
    throw new ServerInputError(400, 'invalid_campaign', 'Cấu hình chiến dịch không hợp lệ.');
  }
  return { title, description, metric, goalValue, startsAt, endsAt, status };
}

function serializeCampaign(row: PracticeCampaignRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metric: row.metric,
    goalValue: Number(row.goal_value),
    contributionValue: Number(row.contribution_value ?? 0),
    memberCount: Number(row.member_count ?? 0),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    joined: row.joined === 1,
  };
}

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServerInputError(400, 'invalid_input', 'Dữ liệu không hợp lệ.');
  }
  return value as Record<string, unknown>;
}

function strictBoolean(value: unknown, field: string): boolean {
  if (value !== true && value !== false) throw new ServerInputError(400, `invalid_${field}`, 'Tùy chọn riêng tư không hợp lệ.');
  return value;
}

function validTimeZone(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) throw new ServerInputError(400, 'invalid_time_zone', 'Múi giờ không hợp lệ.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format(new Date(0));
    return normalized;
  } catch {
    throw new ServerInputError(400, 'invalid_time_zone', 'Múi giờ không hợp lệ.');
  }
}

function normalizedDate(value: unknown, field: string): string {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) throw new ServerInputError(400, `invalid_${field}`, 'Thời gian chiến dịch không hợp lệ.');
  return new Date(parsed).toISOString();
}

function boundedId(value: string, field: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(normalized)) {
    throw new ServerInputError(400, `invalid_${field}`, 'Mã không hợp lệ.');
  }
  return normalized;
}

function shiftIsoDate(value: string, deltaDays: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
