<script lang="ts">
  import { Check, LogOut, Target, UsersRound } from '@lucide/svelte';
  import type { PracticeCampaign } from '$lib/browser/practice-community';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    authenticated?: boolean;
    busyCampaignId?: string | null;
    campaigns: PracticeCampaign[];
    errorCampaignId?: string | null;
    errorMessage?: string;
    onMembership: (campaign: PracticeCampaign) => void | Promise<void>;
  }

  let { authenticated = true, busyCampaignId = null, campaigns, errorCampaignId = null, errorMessage = '', onMembership }: Props = $props();
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const numberFormat = $derived(new Intl.NumberFormat(isEn ? 'en-US' : 'vi-VN'));

  function metricLabel(metric: PracticeCampaign['metric']): string {
    if (metric === 'count') return isEn ? 'counts' : 'biến';
    if (metric === 'duration_seconds') return isEn ? 'duration' : 'thời lượng';
    return isEn ? 'sessions' : 'phiên';
  }

  function formatValue(campaign: PracticeCampaign, value: number): string {
    if (campaign.metric !== 'duration_seconds') return numberFormat.format(value);
    const minutes = Math.floor(value / 60);
    if (minutes < 60) return `${numberFormat.format(minutes)} ${isEn ? 'mins' : 'phút'}`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${numberFormat.format(hours)}h ${remainder}m` : `${numberFormat.format(hours)} ${isEn ? 'hours' : 'giờ'}`;
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(isEn ? 'en-US' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<section class="practice-campaigns" aria-labelledby="practice-campaigns-title">
  <header>
    <div>
      <h2 id="practice-campaigns-title">{isEn ? 'Community Goals' : 'Mục tiêu chung'}</h2>
      <p>{isEn ? 'Voluntary participation. Valid sessions will contribute automatically to active campaigns.' : 'Tham gia tự nguyện. Phiên hợp lệ sẽ tự động góp vào chiến dịch đang hoạt động.'}</p>
    </div>
    <Target aria-hidden="true" size={28} strokeWidth={1.7} />
  </header>

  {#if campaigns.length}
    <div class="practice-campaigns__list">
      {#each campaigns as campaign (campaign.id)}
        <article>
          <div class="practice-campaigns__heading">
            <div><span>{metricLabel(campaign.metric)}</span><h3 id={`practice-campaign-title-${campaign.id}`}>{campaign.title}</h3></div>
            {#if campaign.joined}<span class="practice-campaigns__joined"><Check aria-hidden="true" size={13} strokeWidth={2.4} /> {isEn ? 'Joined' : 'Đã tham gia'}</span>{/if}
          </div>
          {#if campaign.description}<p>{campaign.description}</p>{/if}
          <div class="practice-campaigns__progress">
            <div><strong>{formatValue(campaign, campaign.contributionValue)}</strong><span>{isEn ? 'of' : 'trên'} {formatValue(campaign, campaign.goalValue)}</span></div>
            <progress aria-labelledby={`practice-campaign-title-${campaign.id}`} aria-valuetext={`${formatValue(campaign, campaign.contributionValue)} ${isEn ? 'of' : 'trên'} ${formatValue(campaign, campaign.goalValue)} ${campaign.metric === 'duration_seconds' ? '' : metricLabel(campaign.metric)}`.trim()} value={Math.min(campaign.contributionValue, campaign.goalValue)} max={campaign.goalValue}>{Math.min(100, Math.round(campaign.contributionValue / campaign.goalValue * 100))}%</progress>
          </div>
          <footer>
            <span><UsersRound aria-hidden="true" size={15} strokeWidth={1.8} /> {numberFormat.format(campaign.memberCount)} {isEn ? 'members' : 'thành viên'}</span>
            <span>{formatDate(campaign.startsAt)} {isEn ? 'to' : 'đến'} {formatDate(campaign.endsAt)}</span>
            <button
              class:leave={campaign.joined}
              type="button"
              disabled={busyCampaignId !== null}
              aria-describedby={errorCampaignId === campaign.id && errorMessage ? `campaign-error-${campaign.id}` : undefined}
              aria-label={!authenticated ? (isEn ? `Log in to join campaign ${campaign.title}` : `Đăng nhập để tham gia chiến dịch ${campaign.title}`) : campaign.joined ? (isEn ? `Leave campaign ${campaign.title}` : `Rời chiến dịch ${campaign.title}`) : (isEn ? `Join campaign ${campaign.title}` : `Tham gia chiến dịch ${campaign.title}`)}
              onclick={() => onMembership(campaign)}
            >
              {#if campaign.joined}<LogOut aria-hidden="true" size={15} strokeWidth={2} />{/if}
              {busyCampaignId === campaign.id ? (isEn ? 'Updating…' : 'Đang cập nhật…') : !authenticated ? (isEn ? 'Log in to join' : 'Đăng nhập để tham gia') : campaign.joined ? (isEn ? 'Leave campaign' : 'Rời chiến dịch') : (isEn ? 'Join' : 'Tham gia')}
            </button>
          </footer>
          {#if errorCampaignId === campaign.id && errorMessage}
            <p id={`campaign-error-${campaign.id}`} role="alert">{errorMessage}</p>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <div class="practice-campaigns__empty"><Target aria-hidden="true" size={32} strokeWidth={1.5} /><p>{isEn ? 'No active community goals currently.' : 'Chưa có mục tiêu cộng đồng đang mở.'}</p></div>
  {/if}
</section>

<style>
  .practice-campaigns{display:grid;gap:var(--pc-space-4)}
  .practice-campaigns>header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-4)}
  .practice-campaigns>header>:global(svg){color:var(--gold)}
  h2{margin:0;color:var(--text);font-size:var(--pc-type-4);line-height:1.2;text-wrap:balance}
  header p{max-width:64ch;margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-1);line-height:1.6;text-wrap:pretty}
  .practice-campaigns__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:var(--pc-space-4)}
  article{display:flex;min-width:0;flex-direction:column;padding:var(--pc-space-5);border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card)}
  .practice-campaigns__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-3)}
  .practice-campaigns__heading>div{min-width:0}.practice-campaigns__heading>div>span{display:block;margin-bottom:var(--pc-space-1);color:var(--brown);font-size:var(--font-size-meta);font-weight:800;text-transform:uppercase;letter-spacing:.08em}
  h3{margin:0;color:var(--text);font-size:var(--pc-type-3);line-height:1.3;text-wrap:balance;overflow-wrap:anywhere}
  article>p{overflow-wrap:anywhere;margin:var(--pc-space-3) 0 0;color:var(--text2);font-size:var(--pc-type-1);line-height:1.6;text-wrap:pretty}
  .practice-campaigns__joined{display:inline-flex;flex:0 0 auto;align-items:center;gap:var(--pc-space-1);padding:var(--pc-space-1) var(--pc-space-2);border-radius:var(--pc-radius-pill);background:color-mix(in srgb,var(--green-ok) 14%,var(--bg2));color:var(--green-ok);font-size:var(--font-size-meta);font-weight:800}
  .practice-campaigns__progress{display:grid;gap:var(--pc-space-2);margin-top:auto;padding-top:var(--pc-space-5)}
  .practice-campaigns__progress>div{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--pc-space-2)}
  .practice-campaigns__progress strong{color:var(--text);font-size:var(--pc-type-3);font-variant-numeric:tabular-nums}.practice-campaigns__progress span{color:var(--muted);font-size:var(--font-size-meta)}
  progress{width:100%;height:8px;overflow:hidden;border:0;border-radius:var(--pc-radius-pill);background:var(--bg3);color:var(--gold);accent-color:var(--gold)}
  progress::-webkit-progress-bar{background:var(--bg3)}progress::-webkit-progress-value{background:var(--gold)}progress::-moz-progress-bar{background:var(--gold)}
  footer{display:grid;align-items:center;margin-top:var(--pc-space-4);padding-top:var(--pc-space-3);border-top:1px solid var(--border2);grid-template-columns:1fr 1fr;gap:var(--pc-space-2);color:var(--muted);font-size:var(--font-size-meta)}
  footer>span{display:inline-flex;min-width:0;overflow-wrap:anywhere;align-items:center;gap:var(--pc-space-1)}
  footer button{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:var(--pc-space-2);padding:0 var(--pc-space-4);border:1px solid var(--gold);border-radius:var(--pc-radius);background:var(--gold);color:var(--on-gold);cursor:pointer;font:700 var(--pc-type-1) var(--font-app);grid-column:1/-1;transition:transform .12s var(--pc-ease),background .2s var(--pc-ease),color .2s var(--pc-ease)}
  footer button:hover{background:var(--gold2);transform:translateY(-2px)}footer button:active{transform:translateY(2px)}footer button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}footer button:disabled{cursor:wait;opacity:.64;transform:none}
  footer button.leave{border-color:var(--border);background:transparent;color:var(--text2)}footer button.leave:hover{border-color:var(--brown);background:var(--gold-light);color:var(--brown)}
  .practice-campaigns__empty{display:grid;min-height:160px;place-items:center;padding:var(--pc-space-6);border:1px dashed var(--border);border-radius:var(--pc-radius-lg);color:var(--muted);text-align:center}.practice-campaigns__empty p{margin:var(--pc-space-2) 0 0}
  @media(max-width:420px){article{padding:var(--pc-space-4)}.practice-campaigns__heading{flex-direction:column}footer{grid-template-columns:1fr}}
  @media(prefers-reduced-motion:reduce){footer button{transition:none}footer button:hover,footer button:active{transform:none}}
</style>
