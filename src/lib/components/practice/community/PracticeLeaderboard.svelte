<script lang="ts">
  import { Award, Clock3, UsersRound } from '@lucide/svelte';
  import './avatar-rings.css';
  import type { PresenceSnapshot } from '$lib/browser/presence';
  import type { PracticeLeaderboardData } from '$lib/browser/practice-community';
  import { PRACTICE_BADGE_DEFINITIONS } from '$lib/domain/practice/progress-achievements';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import CommunitySafetyDialog from '$lib/components/comments/CommunitySafetyDialog.svelte';
  import type { CommunityAuthor } from '$lib/contracts/community-moderation';

  interface Props {
    leaderboard: PracticeLeaderboardData;
    presence: PresenceSnapshot | null;
    principalId?: string;
  }

  let { leaderboard, presence, principalId = 'anonymous' }: Props = $props();
  let safety = $state<{ mode: 'report' | 'block'; target: { type: 'profile'; id: string; authorId: string; displayName: string }; principalId: string } | null>(null);
  function openSafety(mode: 'report' | 'block', member: CommunityAuthor & { displayName: string }) {
    if (!member.authorId || member.isOwnProfile) return;
    safety = { mode, target: { type: 'profile', id: member.authorId, authorId: member.authorId, displayName: member.displayName }, principalId };
  }
  $effect(() => { if (safety && safety.principalId !== principalId) safety = null; });
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const numberFormat = $derived(new Intl.NumberFormat(isEn ? 'en-US' : 'vi-VN'));

  const activityLabels = $derived<Record<string, string>>({
    meditation: isEn ? 'meditating' : 'đang thiền',
    rosary: isEn ? 'reciting beads' : 'đang lần hạt',
    scripture: isEn ? 'chanting scripture' : 'đang tụng đọc',
    model_chant: isEn ? 'listening to chant' : 'đang nghe tụng mẫu',
    dharma_talk: isEn ? 'listening to Dharma talk' : 'đang nghe Pháp thoại',
  });

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

  <aside class="practice-live" aria-labelledby="practice-live-title">
    <div>
      <UsersRound aria-hidden="true" size={20} strokeWidth={1.8} />
      <span><strong id="practice-live-title">{isEn ? 'Practicing Right Now' : 'Đang cùng tu tập'}</strong><small>{isEn ? 'Only shows members who opted into presence sharing.' : 'Chỉ hiện người đã tự bật chia sẻ hiện diện.'}</small></span>
    </div>
    {#if presence?.practitioners?.length}
      <ul>
        {#each presence.practitioners as practitioner, index (`${practitioner.displayName}-${practitioner.startedAt}-${index}`)}
          <li><b>{practitioner.displayName}</b><span>{activityLabels[practitioner.activity] ?? (isEn ? 'practicing' : 'đang công phu')}</span>{#if practitioner.startedAt}<small><Clock3 aria-hidden="true" size={12} /> {isEn ? 'since' : 'từ'} {new Date(practitioner.startedAt).toLocaleTimeString(isEn ? 'en-US' : 'vi-VN',{hour:'2-digit',minute:'2-digit'})}</small>{/if}
            {#if practitioner.authorId && !practitioner.isOwnProfile}<span class="leaderboard__safety"><button type="button" aria-label={isEn ? `Report profile ${practitioner.displayName}` : `Báo cáo hồ sơ ${practitioner.displayName}`} onclick={() => openSafety('report', practitioner)}>{isEn ? 'Report' : 'Báo cáo'}</button><button type="button" aria-label={isEn ? `Block ${practitioner.displayName}` : `Chặn ${practitioner.displayName}`} onclick={() => openSafety('block', practitioner)}>{isEn ? 'Block' : 'Chặn'}</button></span>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p>Chưa có ai đang công khai phiên tu tập lúc này.</p>
    {/if}
  </aside>
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
  .practice-live{margin:var(--pc-space-4);padding:var(--pc-space-4);border-radius:var(--pc-radius);background:var(--bg2)}
  .practice-live>div{display:flex;align-items:center;gap:var(--pc-space-3);color:var(--gold)}
  .practice-live>div span{display:grid}.practice-live>div strong{color:var(--text);font-size:var(--pc-type-1)}.practice-live>div small{color:var(--muted);font-size:var(--font-size-meta)}
  .practice-live>p{margin:var(--pc-space-3) 0 0;color:var(--muted);font-size:var(--pc-type-1)}
  .practice-live ul{display:flex;flex-wrap:wrap;gap:var(--pc-space-2);margin:var(--pc-space-3) 0 0;padding:0;list-style:none}
  .practice-live li{display:flex;min-width:0;max-width:100%;flex-wrap:wrap;min-height:36px;align-items:center;gap:var(--pc-space-2);padding:var(--pc-space-2) var(--pc-space-3);border:1px solid var(--border);border-radius:var(--pc-radius-pill);background:var(--card);font-size:var(--font-size-meta)}
  .practice-live li b{min-width:0;overflow-wrap:anywhere;color:var(--text)}.practice-live li span,.practice-live li small{color:var(--muted)}.practice-live li small{display:inline-flex;white-space:nowrap;align-items:center;gap:var(--pc-space-1)}
  @media(max-width:620px){header{align-items:flex-start;flex-direction:column}.leaderboard__list{padding-inline:var(--pc-space-4)}.leaderboard__list li{grid-template-columns:32px 40px minmax(0,1fr) auto}.leaderboard__sessions{display:none}.leaderboard__value b{font-size:var(--pc-type-1)}}
</style>
