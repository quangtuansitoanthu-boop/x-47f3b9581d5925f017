<script lang="ts">
  import { Award } from '@lucide/svelte';
  import './avatar-rings.css';
  import type { PracticeLeaderboardData } from '$lib/browser/practice-community';
  import { PRACTICE_BADGE_DEFINITIONS } from '$lib/domain/practice/progress-achievements';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import CommunitySafetyDialog from '$lib/components/comments/CommunitySafetyDialog.svelte';
  import type { CommunityAuthor } from '$lib/contracts/community-moderation';

  interface Props {
    leaderboard: PracticeLeaderboardData;
    principalId?: string;
  }

  let { leaderboard, principalId = 'anonymous' }: Props = $props();
  let safety = $state<{ mode: 'report' | 'block'; target: { type: 'profile'; id: string; authorId: string; displayName: string }; principalId: string } | null>(null);
  function openSafety(mode: 'report' | 'block', member: CommunityAuthor & { displayName: string }) {
    if (!member.authorId || member.isOwnProfile) return;
    safety = { mode, target: { type: 'profile', id: member.authorId, authorId: member.authorId, displayName: member.displayName }, principalId };
  }
  $effect(() => { if (safety && safety.principalId !== principalId) safety = null; });
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const numberFormat = $derived(new Intl.NumberFormat(isEn ? 'en-US' : 'vi-VN'));



  function badgeLabel(id: string | null): string {
    return PRACTICE_BADGE_DEFINITIONS.find((badge) => badge.id === id)?.label ?? '';
  }
</script>

<section class="practice-panel leaderboard" aria-labelledby="practice-leaderboard-title">
  <header>
    <div>
      <h2 id="practice-leaderboard-title">{isEn ? 'Diligent Practice Together' : 'Cùng nhau tinh tấn'}</h2>
      <p>{leaderboard.metric.description}</p>
    </div>
    <span>Top 10</span>
  </header>

  {#if leaderboard.ranking.length}
    <ol class="leaderboard__list">
      {#each leaderboard.ranking as member (member.rank)}
        <li class:leaderboard__podium={member.rank <= 3}>
          <strong class="leaderboard__rank">#{member.rank}</strong>
          <div class={`avatar-ring avatar-ring--leaderboard ${member.selectedBadge ? `avatar-ring--${member.selectedBadge}` : ''}`}>
            <span class="leaderboard__avatar" aria-hidden="true">
              {#if member.avatarUrl}<img src={member.avatarUrl} alt="" width="40" height="40" referrerpolicy="no-referrer" />{:else}{member.displayName.slice(0,1).toUpperCase()}{/if}
            </span>
          </div>
          <span class="leaderboard__identity">
            <b>{member.displayName}</b>
            {#if member.selectedBadge}<small><Award aria-hidden="true" size={13} strokeWidth={2} /> {badgeLabel(member.selectedBadge)}</small>{/if}
          </span>
          <span class="leaderboard__value"><b>{numberFormat.format(member.acceptedCount)}</b><small>{isEn ? 'valid counts' : 'biến hợp lệ'}</small></span>
          <span class="leaderboard__sessions"><b>{numberFormat.format(member.sessions)}</b><small>{isEn ? 'sessions' : 'phiên'}</small></span>
          {#if member.authorId && !member.isOwnProfile}
            <span class="leaderboard__safety">
              <button type="button" aria-label={isEn ? `Report profile ${member.displayName}` : `Báo cáo hồ sơ ${member.displayName}`} onclick={() => openSafety('report', member)}>{isEn ? 'Report' : 'Báo cáo'}</button>
              <button type="button" aria-label={isEn ? `Block ${member.displayName}` : `Chặn ${member.displayName}`} onclick={() => openSafety('block', member)}>{isEn ? 'Block' : 'Chặn'}</button>
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="leaderboard__empty">{isEn ? 'No members have actively joined the leaderboard in this 30-day period.' : 'Chưa có thành viên nào chủ động tham gia bảng xếp hạng trong 30 ngày này.'}</p>
  {/if}


</section>

{#if safety && safety.principalId === principalId}
  <CommunitySafetyDialog mode={safety.mode} target={safety.target} onClose={() => safety = null} onBlocked={() => safety = null} />
{/if}

<style>
  .practice-panel{border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card)}
  .leaderboard__safety{display:flex;grid-column:3 / -1;flex-wrap:wrap;justify-content:flex-end;gap:var(--pc-space-2)}
  .leaderboard__safety button{min-width:44px;min-height:44px;padding:var(--pc-space-2);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:inherit;font-size:var(--font-size-meta);cursor:pointer}
  .leaderboard__safety button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-4);padding:var(--pc-space-5);border-bottom:1px solid var(--border2)}
  h2{margin:0;color:var(--text);font-size:var(--pc-type-3);line-height:1.2;text-wrap:balance}
  header p{max-width:64ch;margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-1);line-height:1.6;text-wrap:pretty}
  header>span{flex:0 0 auto;padding:var(--pc-space-1) var(--pc-space-3);border-radius:var(--pc-radius-pill);background:var(--gold-light);color:var(--brown);font-size:var(--pc-type-0);font-weight:800}
  .leaderboard__list{margin:0;padding:0 var(--pc-space-5);list-style:none}
  .leaderboard__list li{display:grid;min-height:64px;align-items:center;grid-template-columns:40px 40px minmax(0,1fr) minmax(92px,auto) 56px;gap:var(--pc-space-3);border-bottom:1px solid var(--border2)}
  .leaderboard__list li:last-child{border-bottom:0}
  .leaderboard__list li.leaderboard__podium{background:color-mix(in srgb,var(--gold-light) 52%,transparent)}
  .leaderboard__rank{color:var(--muted);font-size:var(--pc-type-1);font-variant-numeric:tabular-nums;text-align:center}
  .leaderboard__podium .leaderboard__rank{color:var(--brown)}
  .leaderboard__avatar{display:grid;width:40px;height:40px;overflow:hidden;place-items:center;border-radius:50%;background:var(--bg3);color:var(--brown);font-size:var(--pc-type-1);font-weight:800}
  .leaderboard__avatar img{width:100%;height:100%;object-fit:cover}
  .leaderboard__identity{display:grid;min-width:0;gap:var(--pc-space-1)}
  .leaderboard__identity>b{overflow:hidden;color:var(--text);font-size:var(--pc-type-1);text-overflow:ellipsis;white-space:nowrap}
  .leaderboard__identity small{display:flex;overflow-wrap:anywhere;align-items:center;gap:var(--pc-space-1);color:var(--brown);font-size:var(--font-size-meta)}
  .leaderboard__value,.leaderboard__sessions{display:grid;text-align:right}
  .leaderboard__value b,.leaderboard__sessions b{color:var(--text);font-size:var(--pc-type-2);font-variant-numeric:tabular-nums}
  .leaderboard__value small,.leaderboard__sessions small{color:var(--muted);font-size:var(--font-size-meta)}
  .leaderboard__empty{margin:0;padding:var(--pc-space-6);color:var(--muted);font-size:var(--pc-type-1);text-align:center}
  @media(max-width:620px){header{align-items:flex-start;flex-direction:column}.leaderboard__list{padding-inline:var(--pc-space-4)}.leaderboard__list li{grid-template-columns:32px 40px minmax(0,1fr) auto}.leaderboard__sessions{display:none}.leaderboard__value b{font-size:var(--pc-type-1)}}
</style>
