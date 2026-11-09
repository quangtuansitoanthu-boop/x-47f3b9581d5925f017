<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createReadingActivityClient,
    isReadingActivityCapacityError,
    type ReadingActivitySession,
  } from '$lib/browser/reading-activity-client';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  interface Props { initialSession: PageSessionDTO }
  let { initialSession }: Props = $props();
  let client: ReturnType<typeof createReadingActivityClient> | null = null;
  let offeredUserId = $state<string | null>(null);
  let currentUserId = $state<string | null>(null);
  let busy = $state(false);
  let adoptionError = $state('');

  function activitySession(session: PageSessionDTO): ReadingActivitySession {
    return {
      authenticated: session.authenticated,
      csrfToken: session.csrfToken,
      user: session.user ? { id: session.user.id } : null,
    };
  }

  function selectSession(session: PageSessionDTO): void {
    const next = activitySession(session);
    client?.setSession(next);
    const userId = next.authenticated ? next.user?.id ?? null : null;
    currentUserId = userId;
    offeredUserId = userId && client?.shouldOfferAnonymousAdoption(userId) ? userId : null;
    busy = false;
    adoptionError = '';
  }

  function keepSeparate(): void {
    if (!offeredUserId) return;
    adoptionError = '';
    try {
      client?.keepAnonymousQueueSeparate(offeredUserId);
    } catch {
      adoptionError = 'Không thể lưu lựa chọn trên thiết bị. Hãy giải phóng dung lượng rồi thử lại.';
      return;
    }
    offeredUserId = null;
  }

  async function adopt(): Promise<void> {
    const userId = offeredUserId;
    if (!client || !userId) return;
    busy = true;
    adoptionError = '';
    try {
      await client.prepareAnonymousAdoption(userId);
    } catch {
      if (currentUserId === userId) {
        adoptionError = 'Cần kết nối mạng để đối chiếu dữ liệu tài khoản trước khi gộp.';
        busy = false;
      }
      return;
    }
    if (currentUserId !== userId) return;
    try {
      client.adoptAnonymousQueue(userId);
    } catch (cause) {
      if (currentUserId === userId) {
        adoptionError = isReadingActivityCapacityError(cause)
          ? 'Hàng đợi đọc quá lớn để gộp an toàn. Hãy kết nối mạng để đồng bộ tài khoản rồi thử lại.'
          : 'Thiết bị chưa thể lưu dữ liệu đã gộp. Hãy giải phóng dung lượng rồi thử lại.';
        busy = false;
      }
      return;
    }
    offeredUserId = null;
    try {
      await client.flush();
    } catch {
      // The adopted account queue remains durable and will retry when connectivity returns.
    } finally {
      if (currentUserId === userId) window.location.reload();
      else busy = false;
    }
  }

  onMount(() => {
    client = createReadingActivityClient(fetch, localStorage);
    selectSession(initialSession);
    const sessionChanged = (event: Event) => {
      selectSession((event as CustomEvent<PageSessionDTO>).detail);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  });
</script>

{#if offeredUserId}
  <aside class="reading-adoption" aria-labelledby="reading-adoption-title" aria-live="polite">
    <div>
      <strong id="reading-adoption-title">{t.adoptTitle}</strong>
      <span>{t.adoptDesc}</span>
    </div>
    <div class="actions">
      <button type="button" disabled={busy} onclick={keepSeparate}>{t.adoptKeepSeparate || 'Giữ riêng'}</button>
      <button class="primary" type="button" disabled={busy} onclick={adopt}>
        {busy ? (t.adoptLinking || 'Đang liên kết...') : (t.adoptLink || 'Gộp vào tài khoản')}
      </button>
    </div>
    {#if adoptionError}<p role="alert">{adoptionError}</p>{/if}
  </aside>
{/if}

<style>
  .reading-adoption{position:relative;z-index:9998;display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--gold,#c8963e) 55%,var(--border,#ddd));border-radius:16px;background:var(--white,#fff);box-shadow:0 8px 28px rgba(45,31,15,.18);color:var(--text2,#47351f);font-family:var(--font-app)}
  .reading-adoption div:first-child{display:grid;gap:4px}.reading-adoption strong{color:var(--brown,#5f421f);font-size:15px}.reading-adoption span{color:var(--muted,#766957);font-size:var(--font-size-body);line-height:1.45}.actions{display:flex;flex-shrink:0;gap:8px}.actions button{min-height:42px;padding:0 14px;cursor:pointer;border:1px solid var(--border,#ddd);border-radius:999px;background:var(--white,#fff);color:inherit;font:700 var(--font-size-label)/1 var(--font-app)}.actions button.primary{border-color:var(--gold,#c8963e);background:var(--gold,#c8963e);color:#24180c}.actions button:disabled{cursor:wait;opacity:.7}.actions button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold,#c8963e) 45%,transparent);outline-offset:2px}
  .reading-adoption p{width:100%;margin:0;color:#9a2f24;font-size:var(--font-size-body)}
  @media(max-width:680px){.reading-adoption{align-items:stretch;flex-direction:column}.actions{display:grid;grid-template-columns:1fr 1fr}.actions button{padding:0 10px}}
</style>
