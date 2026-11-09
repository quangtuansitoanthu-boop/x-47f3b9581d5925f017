import type { CloudflareRequestContext } from '../cloudflare-context';
import { vietnamDateKey } from '../domain/visitor-client';
import { createAdminCommunityRepository } from '../repositories/admin-community-repository';
import type { AdminDashboardData } from './admin-dashboard';

export type CommunityPeriod = 'week' | 'month' | 'year';

export interface AdminCommunityData {
  generatedAt: string;
  online: {
    members: number;
    guests: number;
    internal: number;
    total: number;
    visitors: AdminDashboardData['onlineVisitors'];
  };
  period: CommunityPeriod;
  ranking: Array<{
    activeDays: number;
    avatarUrl: string;
    displayName: string;
    logCount: number;
    rank: number;
    streak: number;
    totalsByType: Array<{ count: number; type: string }>;
  }>;
}

export function normalizeCommunityPeriod(value: unknown): CommunityPeriod {
  return value === 'week' || value === 'year' ? value : 'month';
}

export function createAdminCommunityService(context: CloudflareRequestContext) {
  const repository = createAdminCommunityRepository(context.env);
  return {
    async getCommunity(periodInput: unknown, now = Date.now()): Promise<AdminCommunityData> {
      const period = normalizeCommunityPeriod(periodInput);
      const today = vietnamDateKey(now);
      const startDate = periodStart(today, period);
      const aggregateRows = await repository.practiceRanking(startDate, today);
      const ranking = aggregateRows.map((row) => ({
        activeDays: number(row.active_days),
        avatarUrl: row.avatar_url || '',
        displayName: row.display_name?.trim() || 'Thành viên Quang Từ',
        internalId: row.id,
        logCount: number(row.log_count),
        streak: number(row.streak),
        totalsByType: parseTotals(row.totals_json),
      })).sort((left, right) => right.activeDays - left.activeDays
        || right.streak - left.streak
        || right.logCount - left.logCount
        || left.displayName.localeCompare(right.displayName, 'vi')
        || left.internalId.localeCompare(right.internalId))
        .slice(0, 50)
        .map(({ internalId: _internalId, ...row }, index) => ({ ...row, rank: index + 1 }));

      return {
        generatedAt: new Date(now).toISOString(),
        online: { members: 0, guests: 0, internal: 0, total: 0, visitors: [] },
        period,
        ranking,
      };
    },
  };
}

function periodStart(today: string, period: CommunityPeriod): string {
  if (period === 'week') return shiftVietnamDate(today, -6);
  return period === 'year' ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
}

function shiftVietnamDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function parseTotals(value: string): Array<{ count: number; type: string }> {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({ count: number(entry?.count), type: String(entry?.type || 'Khác') }));
  } catch { return []; }
}

function number(value: unknown): number {
  const result = Number(value || 0);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}
