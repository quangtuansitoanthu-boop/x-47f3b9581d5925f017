import type {
  PracticeCampaignListData,
  PracticeLeaderboardData,
  PracticeProgressData,
} from '$lib/browser/practice-community';
import type { PageLoad } from './$types';

/**
 * Load phía client (universal) thay cho `+page.server.ts`.
 * Bản native build tĩnh không có server: mọi `+*.server.ts` khiến SvelteKit
 * gọi `__data.json` -> nhận index.html -> trang lỗi "500 Internal Error".
 */
// Queries in the mounted view own the only request and deduplicate by principal.
export const load: PageLoad = async ({ parent }) => {
  const { session } = await parent();

  const emptyLeaderboard: PracticeLeaderboardData = {
    generatedAt: new Date().toISOString(),
    metric: { key: 'count', windowDays: 7, description: 'Lượt tu tập' },
    ranking: [],
  };
  const emptyCampaigns: PracticeCampaignListData = { campaigns: [] };

  return {
    progress: null as PracticeProgressData | null,
    leaderboard: emptyLeaderboard,
    campaigns: emptyCampaigns,
    user: session?.authenticated ? session.user : null,
  };
};
