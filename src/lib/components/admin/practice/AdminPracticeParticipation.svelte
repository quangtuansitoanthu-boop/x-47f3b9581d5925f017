<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { tick } from 'svelte';
  import { RefreshCw } from '@lucide/svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { PARTICIPATION_MODULES, type ParticipationRow } from '$lib/contracts/practice-participation';
  import { participationCopy, participationEvents, participationLabels } from '$lib/i18n/participation';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { readAdminParticipation, ParticipationReadError } from '$lib/browser/admin-participation';
  import '$lib/styles/admin-participation.css';
  const session = getSessionContext(); const locale = getLocaleContext();
  const language = $derived(locale.current === 'en' ? 'en' : 'vi');
  const copy = $derived(participationCopy[language]); const labels = $derived(participationLabels[language]);
  const events = $derived(participationEvents[language]);
  const owner = $derived(session.value.user?.id ?? '');
  const allowed = $derived(session.value.authenticated && session.value.user?.role === 'admin');
  let module = $state('all'); let period = $state('7'); let account = $state('');
  let applied = $state({module:'all',period:'7',account:''});
  let cursors = $state<(string|null)[]>([null]); let page = $state(0);
  let selected = $state<ParticipationRow|null>(null);
  let inventoryHeading = $state<HTMLHeadingElement>();
  let detailHeading = $state<HTMLHeadingElement>();
  const params = $derived(new URLSearchParams({...applied,...(cursors[page] ? {cursor:cursors[page]!} : {})}).toString());
  const list = createQuery(() => ({queryKey:serverStateKeys.participation.page(owner,params),queryFn:({queryKey,signal})=>readAdminParticipation(queryKey[3],signal),enabled:allowed && !selected,retry:false,networkMode:'always',refetchOnWindowFocus:false,refetchOnReconnect:false}));
  const detail = createQuery(() => ({queryKey:serverStateKeys.participation.detail(owner,selected?.ownerId ?? ''),queryFn:({queryKey,signal})=>readAdminParticipation(new URLSearchParams({owner:queryKey[3]}).toString(),signal),enabled:allowed && Boolean(selected),retry:false,networkMode:'always',refetchOnWindowFocus:false,refetchOnReconnect:false}));
  const activeQuery = $derived(selected ? detail : list);
  const dateFormat = $derived(new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}));
  function date(value: string) { return Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '—'; }
  function apply(event: SubmitEvent) { event.preventDefault(); applied={module,period,account:account.trim()}; cursors=[null]; page=0; }
  function next() { const cursor=list.data?.next; if(cursor) { cursors=[...cursors.slice(0,page+1),cursor]; page++; } }
  async function open(row: ParticipationRow) { selected=row; await tick(); detailHeading?.focus(); }
  async function back() { selected=null; await tick(); inventoryHeading?.focus(); }
  function errorText(error: unknown) { return error instanceof ParticipationReadError && [404,503].includes(error.status) ? copy.unavailable : error instanceof ParticipationReadError && error.status===403 ? copy.forbidden : copy.error; }
</script>

<main class="ap-participation">
  <header class="participation-heading"><div><h1>{copy.title}</h1><p>{copy.description}</p></div><button type="button" disabled={!allowed || activeQuery.isFetching} onclick={() => void activeQuery.refetch()}><RefreshCw size={16} aria-hidden="true" />{copy.refresh}</button></header>
  {#if !allowed}<p role="alert">{copy.forbidden}</p>
  {:else if selected}
    <button type="button" onclick={back}>{copy.back}</button>
    <section class="participation-person"><h2 bind:this={detailHeading} tabindex="-1">{selected.name}</h2><p>{selected.email}</p><p>{copy.id}: {selected.ownerId}</p></section>
    <section class="participation-inventory"><h2>{copy.modules}</h2>
      {#if detail.isPending}<p role="status">{copy.loading}</p>
      {:else if detail.error}<p role="alert">{errorText(detail.error)}</p><button type="button" onclick={() => void detail.refetch()}>{copy.retry}</button>
      {:else}<ul class="participation-modules">{#each PARTICIPATION_MODULES as key (key)}{@const row=detail.data?.rows.find(item=>item.module===key)}<li><strong>{labels[key]}</strong><small>{row ? `${events[row.event]} · ${date(row.at)}` : copy.missing}</small></li>{/each}</ul>{/if}
    </section><p class="participation-note">{copy.privacy}</p>
  {:else}
    <form class="participation-filters" onsubmit={apply}>
      <label>{copy.module}<select bind:value={module}><option value="all">{copy.all}</option><option value="precepts">{copy.precepts}</option>{#each PARTICIPATION_MODULES as key (key)}<option value={key}>{labels[key]}</option>{/each}</select></label>
      <label>{copy.period}<select bind:value={period}><option value="7">{copy.week}</option><option value="30">{copy.month}</option><option value="all">{copy.anytime}</option></select></label>
      <label>{copy.account}<input type="search" bind:value={account} maxlength="254" placeholder={copy.search} /></label><button class="participation-primary" type="submit">{copy.apply}</button>
    </form>
    <section class="participation-inventory" aria-busy={list.isFetching}>
      <header><h2 bind:this={inventoryHeading} tabindex="-1">{copy.list}</h2><small>{copy.zone}</small></header>
      {#if list.isPending}<p class="participation-empty" role="status">{copy.loading}</p>
      {:else if list.error}<div class="participation-empty" role="alert"><p>{errorText(list.error)}</p><button type="button" onclick={() => void list.refetch()}>{copy.retry}</button></div>
      {:else if !list.data?.rows.length}<div class="participation-empty"><strong>{copy.empty}</strong><p>{copy.emptyHint}</p></div>
      {:else}<table><thead><tr><th>{copy.account}</th><th>{copy.module}</th><th>{copy.event}</th><th>{copy.latest}</th></tr></thead><tbody>{#each list.data.rows as row (`${row.ownerId}:${row.module}`)}<tr><td><button type="button" class="participation-account" onclick={()=>void open(row)}>{row.name} →</button><small>{row.email}</small><small>{row.ownerId}</small></td><td>{labels[row.module]}</td><td><span class="participation-state">{events[row.event]}</span></td><td><span class="participation-mobile-label">{copy.latest}: </span>{date(row.at)}</td></tr>{/each}</tbody></table>{/if}
      <footer class="participation-pages"><small>{copy.pageSize}</small><button type="button" disabled={page===0 || list.isFetching} onclick={()=>page--}>{copy.previous}</button><button type="button" disabled={!list.data?.next || list.isFetching || Boolean(list.error)} onclick={next}>{copy.next}</button></footer>
    </section><p class="participation-note">{copy.note}</p>
  {/if}
</main>
