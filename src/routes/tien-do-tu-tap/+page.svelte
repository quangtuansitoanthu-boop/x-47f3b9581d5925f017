<script lang="ts">
  import '$lib/styles/practice-theme.css';
  import PracticeProgressDashboard from '$lib/components/practice/community/PracticeProgressDashboard.svelte';
  import PracticeCommunityPublic from '$lib/components/practice/community/PracticeCommunityPublic.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import type { PracticeProgressData } from '$lib/browser/practice-community';

  let { data } = $props();
  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  const currentUser = $derived(sessionStore.value.user || data.user);
  const isAuthenticated = $derived(Boolean((sessionStore.value.authenticated && sessionStore.value.user) || currentUser));

  const fallbackProgress: PracticeProgressData = {
    profile: {
      leaderboardOptIn: false,
      presenceOptIn: false,
      selectedBadge: null,
      timeZone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh' : 'Asia/Ho_Chi_Minh',
    },
    heatmap: [],
    streaks: { current: 0, longest: 0 },
    badges: [],
    totals: { acceptedCount: 0, acceptedDurationSeconds: 0, sessions: 0 },
    breakdown: [],
    today: new Date().toISOString().slice(0, 10),
  };
</script>

<svelte:head>
  <title>{isEn ? 'Practice Progress — Practice with Quang Tu' : 'Tiến độ tu tập — Tu tập cùng Quang Từ'}</title>
  <meta name="description" content={isEn ? 'Your personal practice calendar, achievements and verified goals.' : 'Nhật lịch, thành tựu và mục tiêu tu tập riêng tư của bạn.'} />
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

{#if currentUser && isAuthenticated}
  <PracticeProgressDashboard
    initialProgress={data.progress || fallbackProgress}
    initialLeaderboard={data.leaderboard}
    initialCampaigns={data.campaigns}
    user={currentUser}
  />
{:else}
  <PracticeCommunityPublic initialLeaderboard={data.leaderboard} initialCampaigns={data.campaigns} />
{/if}
