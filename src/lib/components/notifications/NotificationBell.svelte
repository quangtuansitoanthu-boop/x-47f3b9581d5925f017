<script lang="ts">
  import { goto } from '$app/navigation';
  import { Bell, X } from '@lucide/svelte';
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  import { notificationReadBatches, validNotificationReadId } from '$lib/contracts/notification-read-state';
  import { requestNotificationReadState } from '$lib/browser/notification-read-state';
  import { getContext, onMount, untrack } from 'svelte';
  import { createInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/svelte-query';
  import { fetchMindfulNotifications } from '$lib/browser/mindful-community-client';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { SESSION_CONTEXT, type SessionStore } from '$lib/stores/session.svelte';
  import type { MindfulNotificationPage } from '$lib/contracts/mindful-notifications';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { getLunarEvent } from '$lib/components/lunar/lunar-events';
  import type { AdminNotificationItem, AdminNotificationsResponse } from '$lib/server/services/admin-notifications';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);
  const isEn = $derived(localeStore.current === 'en');

  export type NotificationBellItem = Omit<AdminNotificationItem, 'type' | 'badge'> & {
    type: string;
    badge?: string;
    principalId?: string;
  };

  interface Props {
    session: {
      authenticated: boolean;
      user: null | {
        avatarUrl?: string;
        displayName: string;
        email?: string;
        id?: string;
        role: 'user' | 'ctv' | 'admin';
      };
    };
  }

  let { session }: Props = $props();
  const sessionOwner = getContext<SessionStore | undefined>(SESSION_CONTEXT);
  const queryClient = useQueryClient();

  let isOpen = $state(false);
  let loading = $state(false);
  let adminNotifications = $state<NotificationBellItem[]>([]);
  let userNotifications = $state<NotificationBellItem[]>([]);
  let readIds = $state<Set<string>>(new Set());
  let popoverEl: HTMLElement | null = $state(null);
  let bellButtonEl: HTMLButtonElement | null = $state(null);
  let mounted = $state(false);
  let requestGeneration = 0;
  let requestController: AbortController | null = null;
  let firstOpen = true;
  let loadedForPrincipal = false;
  let loadedAt = 0;
  let selectedPrincipal: string | null = null;
  let previousAccountPrincipal: string | null = null;
  let pendingReadIds = new Set<string>();
  let readController: AbortController | null = null;
  let readSyncError = $state(false);
  let readSyncing = $state(false);
  let readSyncQueued = false;
  let readRefreshQueued = false;
  let bubbleTailRight = $state(20);
  let popoverTop = $state(80);
  const accountPrincipal = $derived(mounted && sessionOwner?.initialResolutionComplete !== false && session.authenticated && session.user?.id ? session.user.id : null);
  const accountInbox = createInfiniteQuery(() => ({
    queryKey: serverStateKeys.mindfulCommunity.notifications(accountPrincipal ?? 'guest'),
    queryFn: async ({ pageParam, signal, queryKey }) => ({ ...await fetchMindfulNotifications(pageParam, { signal }), principal: queryKey[1] }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: canLoadAccountInbox(),
    staleTime: 60_000, gcTime: 5 * 60_000,
    // Báo lỗi offline ngay, không giữ GET tạm dừng để tự chạy khi mạng trở lại.
    networkMode: 'always',
    // Trạng thái lỗi phải cập nhật cả khi popover đang đóng, không chỉ khi data đổi.
    notifyOnChangeProps: ['data', 'status', 'fetchStatus', 'dataUpdatedAt'],
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, retryOnMount: false,
  }));
  const accountNotifications = $derived<NotificationBellItem[]>(accountPrincipal ? (accountInbox.data?.pages ?? [])
    .filter(page => page.principal === accountPrincipal).flatMap(page => page.items)
    .filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index)
    .map<NotificationBellItem>(item => ({ id: `mindful-reaction:${item.id}`, principalId: accountPrincipal!, type: item.kind === 'repentance' ? 'mindful_prayer' : 'mindful_rejoice',
      title: item.kind === 'repentance' ? t.mindfulPrayerTitle : t.mindfulRejoiceTitle,
      message: (item.kind === 'repentance' ? t.mindfulPrayerMessage : t.mindfulRejoiceMessage).replace('{nickname}', item.nickname),
      timestamp: item.createdAt, level: 'info', link: `/tu-tap?communityPost=${encodeURIComponent(item.postId)}&communityReaction=${encodeURIComponent(item.id)}` })) : []);
  const notifications = $derived<NotificationBellItem[]>([...accountNotifications, ...userNotifications, ...adminNotifications]);

  function canLoadAccountInbox(): boolean {
    if (!accountPrincipal) return false;
    const cached = queryClient.getQueryState(serverStateKeys.mindfulCommunity.notifications(accountPrincipal));
    // Chỉ tự thử lại GET đầu bị ngắt trước khi có dữ liệu; cache thành công/lỗi giữ cho thao tác mở chuông.
    return !cached || (cached.status === 'pending' && cached.fetchStatus === 'idle' && cached.data === undefined);
  }

  $effect(() => {
    const principal = accountPrincipal;
    if (principal === previousAccountPrincipal) return;
    const previous = previousAccountPrincipal;
    previousAccountPrincipal = principal;
    if (previous) {
      const queryKey = serverStateKeys.mindfulCommunity.notifications(previous);
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.removeQueries({ queryKey, exact: true });
      const readKey = serverStateKeys.mindfulCommunity.notificationReadPrincipal(previous);
      void queryClient.cancelQueries({ queryKey: readKey });
      queryClient.removeQueries({ queryKey: readKey });
    }
  });

  const storageKey = $derived(`quangtu_notifications_read_${session.user?.id || 'anon'}`);
  const unreadNotifications = $derived(notifications.filter((n) => !readIds.has(n.id)));
  const unreadCount = $derived(unreadNotifications.length);

  const pendingStorageKey = () => `${storageKey}_pending_v1`;
  function savePendingReadState(): void {
    try { localStorage.setItem(pendingStorageKey(), JSON.stringify([...pendingReadIds])); } catch { /* Best effort, same as existing read state. */ }
  }

  async function syncReadState(force = false, writeOnly = false): Promise<void> {
    const principal = accountPrincipal;
    if (!principal || document.visibilityState === 'hidden') return;
    if (readSyncing) { readSyncQueued = true; readRefreshQueued ||= !writeOnly; return; }
    if (!writeOnly && (loading || accountInbox.isFetching)) return;
    const controller = new AbortController();
    readController = controller; readSyncing = true;
    const current = () => !controller.signal.aborted && accountPrincipal === principal && readController === controller;
    try {
      const next = new Set(readIds);
      // One bounded request per batch, not one request for each row.
      for (const ids of writeOnly ? [] : notificationReadBatches(notifications.map(item => item.id))) {
        const received = await queryClient.fetchQuery({
          queryKey: serverStateKeys.mindfulCommunity.notificationReads(principal, ids.join(',')),
          queryFn: () => requestNotificationReadState(ids, principal, false, controller.signal),
          staleTime: force ? 0 : 60_000, gcTime: 5 * 60_000, retry: false, networkMode: 'always',
        });
        if (!current()) return;
        for (const id of received) next.add(id);
      }
      if (!current()) return;
      // Include taps made while the GET was running; never turn a local read back on.
      readIds = new Set([...readIds, ...next]); saveReadState();
      // Migrate existing device reads gradually; keep the remaining queue for next open/resume.
      for (const ids of notificationReadBatches(pendingReadIds).slice(0, 2)) {
        const received = await requestNotificationReadState(ids, principal, true, controller.signal);
        if (!current()) return;
        for (const id of received) pendingReadIds.delete(id);
        savePendingReadState();
      }
      readSyncError = false;
    } catch {
      if (current()) readSyncError = true;
    } finally {
      if (readController === controller) {
        readController = null; readSyncing = false;
        if (readSyncQueued) {
          const refresh = readRefreshQueued; readSyncQueued = false; readRefreshQueued = false;
          void syncReadState(refresh, !refresh);
        }
      }
    }
  }

  $effect(() => {
    const principal = accountPrincipal;
    const ids = notifications.map(item => item.id).join(',');
    const ready = !loading && !accountInbox.isFetching;
    if (!principal || !ids || !ready) return;
    const timer = setTimeout(() => { void syncReadState(); }, 150);
    return () => clearTimeout(timer);
  });

  function loadReadState(): void {
    readIds = new Set();
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          readIds = new Set(parsed.filter((id): id is string => typeof id === 'string'));
        }
      }
    } catch {
      readIds = new Set();
    }
    pendingReadIds = new Set();
    if (accountPrincipal) {
      try {
        const pending = localStorage.getItem(pendingStorageKey());
        const parsed: unknown = pending === null ? [...readIds] : JSON.parse(pending);
        if (Array.isArray(parsed)) pendingReadIds = new Set(parsed.filter(validNotificationReadId));
        savePendingReadState();
      } catch { pendingReadIds = new Set([...readIds].filter(validNotificationReadId)); }
    }
  }

  function saveReadState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(readIds)));
    } catch {
      // localStorage is best-effort
    }
  }

  function loadUserNotifications(): void {
    const now = new Date();
    const items: NotificationBellItem[] = [];
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const lunarInfo = getLunarEvent(now, localeStore.current);

    if (lunarInfo.isThapTrai && lunarInfo.viaName) {
      items.push({
        id: `via_thaptrai_${dateKey}_${lunarInfo.lunarMonth}_${lunarInfo.lunarDay}`,
        type: 'lunar_via',
        badge: isEn ? 'Ten Fasting & Feast' : 'Thập Trai & Vía Phật',
        title: isEn ? `🙏 Today: Ten Fasting Day & ${lunarInfo.viaName}` : `🙏 Hôm nay: Thập Trai & ${lunarInfo.viaName}`,
        message: isEn
          ? `Today (day ${lunarInfo.lunarDay}, month ${lunarInfo.lunarMonth} lunar calendar) is a Ten Fasting Day and ${lunarInfo.viaName}. Fellow practitioners are warmly invited to observe vegetarian meals, keep precepts, chant, and practice virtue.`
          : `Hôm nay ngày ${lunarInfo.lunarDay} tháng ${lunarInfo.lunarMonth} âm lịch là ngày Thập Trai và ${lunarInfo.viaName}. Kính chúc quý đạo hữu vạn sự an lạc, tâm bồ đề kiên cố, phát tâm ăn chay, niệm Phật.`,
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0).toISOString(),
        level: 'success',
        link: '/tu-tap'
      });
    } else if (lunarInfo.viaName) {
      items.push({
        id: `via_${dateKey}_${lunarInfo.lunarMonth}_${lunarInfo.lunarDay}`,
        type: 'lunar_via',
        badge: isEn ? 'Buddhist Feast' : 'Vía Phật',
        title: isEn ? `🙏 Today: ${lunarInfo.viaName}` : `🙏 Hôm nay: ${lunarInfo.viaName}`,
        message: isEn
          ? `Today (day ${lunarInfo.lunarDay}, month ${lunarInfo.lunarMonth} lunar calendar) is ${lunarInfo.viaName}. May you be peaceful and mindful in your practice.`
          : `Hôm nay ngày ${lunarInfo.lunarDay} tháng ${lunarInfo.lunarMonth} âm lịch là ${lunarInfo.viaName}. Kính chúc quý đạo hữu vạn sự an lạc, tâm bồ đề kiên cố.`,
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0).toISOString(),
        level: 'success',
        link: '/tu-tap'
      });
    }

    if (lunarInfo.lunarDay === 15) {
      items.push({
        id: `ram_${dateKey}`,
        type: 'lunar_ram',
        badge: isEn ? 'Full Moon' : 'Ngày Rằm',
        title: isEn ? '🌕 Today is Full Moon Day' : '🌕 Hôm nay là ngày Rằm (Vọng Nhật)',
        message: isEn
          ? 'A sacred day for vegetarian meals, offering incense, reciting sutras and mindfulness.'
          : 'Ngày trăng tròn thanh tịnh, thích hợp dâng hương, ăn chay, phóng sinh và tụng kinh sám hối.',
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0).toISOString(),
        level: 'info',
        link: '/tu-tap'
      });
    } else if (lunarInfo.lunarDay === 1) {
      items.push({
        id: `mung1_${dateKey}`,
        type: 'lunar_mung1',
        badge: isEn ? 'New Moon' : 'Mùng Một',
        title: isEn ? '🌑 Today is New Moon Day' : '🌑 Hôm nay là ngày Mùng Một (Sóc Nhật)',
        message: isEn
          ? 'First day of the lunar month. Open your heart with compassion, pray for peace and practice mindfulness.'
          : 'Ngày đầu tháng âm lịch, khởi phát tâm từ, dâng hương lễ Phật, cầu nguyện bình an cho gia đình.',
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0).toISOString(),
        level: 'info',
        link: '/tu-tap'
      });
    } else if (lunarInfo.isThapTrai && !lunarInfo.viaName) {
      items.push({
        id: `thaptrai_${dateKey}_${lunarInfo.lunarDay}`,
        type: 'lunar_chay',
        badge: isEn ? 'Ten Fasting Day' : 'Thập Trai',
        title: isEn ? '🥗 Today is Ten Fasting Day' : '🥗 Hôm nay là ngày Ăn Chay (Thập Trai)',
        message: isEn
          ? `Lunar day ${lunarInfo.lunarDay} is an observance day. Keep body and mind pure, cultivating loving-kindness and virtue.`
          : `${lunarInfo.lunarDay <= 10 ? 'Mùng' : 'Ngày'} ${lunarInfo.lunarDay} âm lịch là ngày trai giới, giữ thân tâm thanh tịnh, nuôi dưỡng lòng từ bi.`,
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 30).toISOString(),
        level: 'info',
        link: '/tu-tap'
      });
    }

    if (lunarInfo.kiengDam) {
      items.push({
        id: `kiengdam_${dateKey}`,
        type: 'lunar_abstinence',
        badge: isEn ? 'Abstinence Day' : 'Kiêng Hành Dâm',
        title: isEn ? '⚠️ Abstinence Day Reminder' : '⚠️ Nhắc nhở: Ngày Kiêng Hành Dâm',
        message: isEn
          ? `Today is an abstinence day according to the Shou Kang Bao Jian calendar. Reason: "${lunarInfo.kiengDam.reason}"${lunarInfo.kiengDam.harm ? `, risk: "${lunarInfo.kiengDam.harm}"` : ''}.`
          : `Hôm nay là ngày kiêng thủ dâm, hành dâm (kể cả vợ chồng) theo Thọ Khang Bảo Giám. Lý do: "${lunarInfo.kiengDam.reason}"${lunarInfo.kiengDam.harm ? `, tác hại: "${lunarInfo.kiengDam.harm}"` : ''}.`,
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0).toISOString(),
        level: 'warning',
        link: '/tu-tap'
      });
    }

    const hour = now.getHours();
    if (hour >= 4 && hour < 11) {
      items.push({
        id: `practice_morning_${dateKey}`,
        type: 'practice_morning',
        badge: isEn ? 'Morning' : 'Tu Sáng',
        title: isEn ? '🌅 Early Morning Practice Session' : '🌅 Thời khóa tu tập sáng sớm',
        message: isEn
          ? 'Begin a peaceful day with 15–30 minutes of meditation, chanting or mindful contemplation.'
          : 'Bắt đầu ngày mới an lành bằng 15-30 phút tọa thiền, niệm Phật hoặc tụng kinh tĩnh tâm.',
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0).toISOString(),
        level: 'info',
        link: '/tu-tap'
      });
    } else if (hour >= 18 && hour <= 23) {
      items.push({
        id: `practice_evening_${dateKey}`,
        type: 'practice_evening',
        badge: isEn ? 'Evening' : 'Tu Tối',
        title: isEn ? '🌙 Evening Practice Session' : '🌙 Thời khóa tu tập buổi tối',
        message: isEn
          ? 'End your day peacefully with evening chanting, reflection and tracking your practice progress.'
          : 'Kết thúc ngày công phu, cùng lắng lòng niệm Phật, sám hối muộn phiền và ghi nhận tiến độ.',
        timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30).toISOString(),
        level: 'info',
        link: '/tu-tap'
      });
    }

    userNotifications = items;
  }

  $effect(() => {
    if (isEn !== undefined) {
      loadUserNotifications();
    }
  });

  $effect(() => {
    const principal = `${session.authenticated}:${session.user?.id ?? 'anon'}:${session.user?.role ?? 'user'}`;
    if (!mounted || principal === selectedPrincipal) return;
    selectedPrincipal = principal;
    untrack(() => {
      requestGeneration += 1;
      readController?.abort(); readController = null; readSyncing = false; readSyncError = false; readSyncQueued = false; readRefreshQueued = false;
      requestController?.abort();
      requestController = null;
      loading = false;
      isOpen = false;
      adminNotifications = [];
      firstOpen = true;
      loadedForPrincipal = false;
      loadedAt = 0;
      loadReadState();
      void fetchNotifications();
    });
  });

  async function fetchNotifications(): Promise<void> {
    loadUserNotifications();
    if (!session.authenticated || (session.user?.role !== 'admin' && session.user?.role !== 'ctv')) {
      adminNotifications = [];
      return;
    }
    if (loading) return;
    const generation = ++requestGeneration;
    const controller = new AbortController();
    requestController = controller;
    try {
      loading = true;
      const response = await fetchWithSessionRefresh('/api/admin/notifications', { signal: controller.signal });
      if (response.ok) {
        const data: AdminNotificationsResponse = await response.json();
        if (generation !== requestGeneration || controller.signal.aborted) return;
        adminNotifications = data.notifications || [];
        loadedForPrincipal = true;
        loadedAt = Date.now();
      }
    } catch (e) {
      if (!controller.signal.aborted) console.warn('Failed to fetch notifications:', e);
    } finally {
      if (generation === requestGeneration) {
        loading = false;
        requestController = null;
      }
    }
  }

  function toggleOpen(): void {
    isOpen = !isOpen;
    if (isOpen) {
      const bell = bellButtonEl?.getBoundingClientRect();
      if (bell) {
        bubbleTailRight = Math.max(0, window.innerWidth - bell.left - bell.width / 2 - 26);
        popoverTop = bell.bottom + 16;
      }
      void syncReadState(true);
      // Chỉ dùng lại lượt tải ban đầu trong 30 giây, không giữ thông báo cũ khi để app lâu.
      if (!firstOpen || !loadedForPrincipal || Date.now() - loadedAt > 30_000) void fetchNotifications();
      firstOpen = false;
      if (accountPrincipal) {
        const cached = queryClient.getQueryState(serverStateKeys.mindfulCommunity.notifications(accountPrincipal));
        if (cached?.status !== 'error' && cached?.fetchStatus !== 'fetching'
          && Date.now() - (cached?.dataUpdatedAt ?? 0) >= 60_000) refreshAccountNotifications();
      }
    }
  }

  function refreshAccountNotifications(): void {
    if (!accountPrincipal || queryClient.getQueryState(serverStateKeys.mindfulCommunity.notifications(accountPrincipal))?.fetchStatus === 'fetching') return;
    const key = serverStateKeys.mindfulCommunity.notifications(accountPrincipal);
    // Làm mới chỉ trang đầu, không đọc lại toàn bộ các trang cũ đã mở.
    queryClient.setQueryData<InfiniteData<MindfulNotificationPage & { principal: string }>>(key, data => data && ({
      pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1),
    }));
    void accountInbox.refetch({ cancelRefetch: false });
  }

  function loadMoreAccountNotifications(): void {
    if (!accountPrincipal || queryClient.getQueryState(serverStateKeys.mindfulCommunity.notifications(accountPrincipal))?.fetchStatus === 'fetching') return;
    void accountInbox.fetchNextPage({ cancelRefetch: false });
  }

  function markAllAsRead(): void {
    const next = new Set(readIds);
    for (const n of notifications) {
      next.add(n.id);
      if (accountPrincipal) pendingReadIds.add(n.id);
    }
    readIds = next;
    saveReadState();
    if (accountPrincipal) { savePendingReadState(); void syncReadState(false, true); }
  }

  async function handleItemClick(item: NotificationBellItem): Promise<void> {
    if (item.principalId && item.principalId !== accountPrincipal) return;
    const next = new Set(readIds);
    next.add(item.id);
    if (accountPrincipal) pendingReadIds.add(item.id);
    readIds = next;
    saveReadState();
    if (accountPrincipal) { savePendingReadState(); void syncReadState(false, true); }
    isOpen = false;
    if (item.link) {
      let destination: URL;
      try { destination = new URL(item.link, window.location.href); }
      catch { return; }
      if (destination.protocol !== 'http:' && destination.protocol !== 'https:') return;
      if (item.type?.startsWith('mindful_') && destination.origin === window.location.origin
        && destination.pathname === '/tu-tap' && destination.searchParams.has('communityPost')) {
        const current = new URL(window.location.href);
        if (current.pathname === '/tu-tap') {
          current.searchParams.set('communityPost', destination.searchParams.get('communityPost')!);
          if (destination.searchParams.has('communityReaction')) current.searchParams.set('communityReaction', destination.searchParams.get('communityReaction')!);
          destination = current;
        }
      }
      // Giữ root player và session khi thông báo dẫn tới một màn trong app.
      if (destination.origin === window.location.origin) await goto(destination.href);
      else window.location.assign(destination.href);
    }
  }

  function formatRelativeTime(dateString: string): string {
    const parsed = Date.parse(dateString);
    if (!Number.isFinite(parsed)) return '';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    if (diffSeconds < 60) return t.timeJustNow;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} ${t.timeMinutesAgo}`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} ${t.timeHoursAgo}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return t.timeYesterday;
    if (diffDays < 7) return `${diffDays} ${t.timeDaysAgo}`;
    const date = new Date(parsed);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  }

  function handleClickOutside(event: MouseEvent): void {
    if (!isOpen) return;
    const path = event.composedPath();
    if ((popoverEl && path.includes(popoverEl)) || (bellButtonEl && path.includes(bellButtonEl))) return;
    const target = event.target as Node | null;
    if (popoverEl && !popoverEl.contains(target) && bellButtonEl && !bellButtonEl.contains(target)) {
      isOpen = false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen) {
      isOpen = false;
      bellButtonEl?.focus();
    }
  }

  onMount(() => {
    mounted = true;
    const resume = () => { if (document.visibilityState !== 'hidden') void syncReadState(true); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { requestGeneration += 1; requestController?.abort(); readController?.abort(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  });
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="notification-bell-container">
    <button
      bind:this={bellButtonEl}
      class="notification-bell-btn"
      class:active={isOpen}
      type="button"
      aria-label="{t.bellAria} ({unreadCount} {t.bellNew})"
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      onclick={toggleOpen}
    >
      <Bell aria-hidden="true" size={18} strokeWidth={2.2} />
      {#if unreadCount > 0}
        <span class="notification-badge" aria-label="{unreadCount} {t.bellUnreadAria}">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      {/if}
    </button>

    {#if isOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="notification-scrim" onclick={() => isOpen = false}></div>

      <div
        bind:this={popoverEl}
        class="notification-popover"
        style:--notification-tail-right={`${bubbleTailRight}px`}
        style:--notification-popover-top={`${popoverTop}px`}
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-label={t.bellPopoverTitle}
      >
        <svg class="notification-tail" viewBox="0 0 48 26" aria-hidden="true"><path d="M0 26C18 25 28 14 32 1C35 10 32 20 48 26Z" /></svg>
        <header class="notification-popover-header">
          <div class="notification-header-title">
            <strong>{t.bellPopoverTitle}</strong>
            {#if unreadCount > 0}
              <span class="notification-header-count">{unreadCount} {t.bellNew}</span>
            {/if}
          </div>
          <div class="notification-header-actions">
            {#if unreadCount > 0}
              <button
                class="mark-all-btn"
                type="button"
                title={t.bellMarkAllRead}
                aria-label={t.bellMarkAllRead}
                onclick={markAllAsRead}
              >
                <span class="mark-all-text">{t.bellMarkAllRead}</span>
              </button>
            {/if}
            <button
              class="close-popover-btn"
              type="button"
              aria-label={t.bellClose}
              onclick={() => isOpen = false}
            >
              <X aria-hidden="true" size={16} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div class="notification-list" role="feed">
          {#if readSyncError}<div class="notification-read-error" role="status">{t.readSyncError} <button type="button" disabled={readSyncing} onclick={() => void syncReadState(true)}>{t.mindfulRetry}</button></div>{/if}
          {#if accountPrincipal && accountInbox.isFetching && accountInbox.isPending}
            <p class="notification-load-state" role="status">{t.mindfulLoading}</p>
          {:else if accountPrincipal && accountInbox.isError}
            <div class="notification-load-state" role="status">
              <strong>{t.mindfulLoadError}</strong><p>{t.mindfulOffline}</p>
              <button type="button" disabled={accountInbox.isFetching} onclick={() => accountInbox.isFetchNextPageError ? loadMoreAccountNotifications() : refreshAccountNotifications()}>{t.mindfulRetry}</button>
            </div>
          {/if}
          {#if notifications.length === 0 && !(accountPrincipal && (accountInbox.isPending || accountInbox.isError))}
            <div class="notification-empty">
              <div class="empty-icon">🔔</div>
              <strong>{t.bellEmptyTitle}</strong>
              <p>{accountPrincipal ? t.mindfulEmpty : t.bellEmptyDesc}</p>
            </div>
          {:else}
            {#each notifications as item (item.id)}
              {@const isRead = readIds.has(item.id)}
              <button
                class="notification-item"
                class:unread={!isRead}
                class:level-warning={item.level === 'warning'}
                class:level-error={item.level === 'error'}
                class:level-success={item.level === 'success'}
                class:level-info={item.level === 'info'}
                class:mindful-item={item.type.startsWith('mindful_')}
                type="button"
                onclick={() => handleItemClick(item)}
              >
                <div class="item-icon-col">
                  <span class="item-badge-pill" aria-hidden="true">
                    <AppArtwork name={item.type === 'new_member' ? 'personal' : item.type === 'lunar_abstinence' ? 'abstinence' : item.type.includes('article') ? 'books' : item.type.startsWith('practice_') ? 'rosary' : 'practice'} size={40} />
                  </span>
                </div>
                <div class="item-content-col">
                    <strong class="item-title">{item.title}</strong>
                    <p class="item-message">{item.message}</p>
                    <time class="item-time" datetime={item.timestamp}>{formatRelativeTime(item.timestamp)}</time>
                </div>
                {#if !isRead}
                  <span class="item-unread-dot" aria-hidden="true"></span>
                {/if}
              </button>
            {/each}
          {/if}
          {#if accountPrincipal && accountInbox.hasNextPage}
            <button class="notification-more" type="button" disabled={accountInbox.isFetching} onclick={loadMoreAccountNotifications}>{accountInbox.isFetchingNextPage ? t.mindfulLoading : t.mindfulMore}</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

<style>
  .notification-load-state { padding:var(--space-page);text-align:center;color:var(--text2);overflow-wrap:anywhere; }
  .notification-load-state button,.notification-more { min-height:44px;padding:calc(var(--space-page)*.5);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--text);font:inherit;cursor:pointer; }
  .notification-more { display:block;margin:calc(var(--space-page)*.5) auto; }
  .notification-load-state button:focus-visible,.notification-more:focus-visible { outline:2px solid var(--gold);outline-offset:2px; }
  .notification-item.mindful-item { padding:var(--space-page) calc(var(--space-page)*.7); }
  .notification-item.mindful-item.level-info.unread { background:var(--gold-light); }
  .mindful-item .item-content-col { display:grid;gap:calc(var(--space-page)*.25); }
  .mindful-item .item-title { white-space:normal;overflow-wrap:anywhere; }
  .notification-item.mindful-item.level-info .item-badge-pill { color:var(--gold);background:transparent; }
  .mindful-item .item-unread-dot { position:static;flex:none;margin-top:calc(var(--space-page)*.4);background:var(--gold); }
  .mark-all-text { display:none; }
  button { min-width:44px; min-height:44px; }
  .notification-bell-container {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .notification-bell-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
    border-radius: 9999px;
    background: var(--card, #ffffff);
    color: var(--text, #1c1a15);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme='dark']) .notification-bell-btn,
  :global(.dark) .notification-bell-btn {
    background: var(--card, #1c1812);
    border-color: var(--border, #3a3226);
    color: var(--text, #ede8df);
  }

  .notification-bell-btn:hover,
  .notification-bell-btn.active {
    background: var(--gold-bg, rgba(200, 150, 62, 0.14));
    border-color: var(--gold, #c8963e);
    color: var(--gold, #c8963e);
    transform: translateY(-1px);
  }

  :global([data-theme='dark']) .notification-bell-btn:hover,
  :global([data-theme='dark']) .notification-bell-btn.active,
  :global(.dark) .notification-bell-btn:hover,
  :global(.dark) .notification-bell-btn.active {
    background: rgba(212, 168, 75, 0.18);
    border-color: var(--gold, #d4a84b);
    color: var(--gold, #d4a84b);
  }

  .notification-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9999px;
    background: var(--gold);
    color: var(--on-gold);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    box-shadow: var(--shadow);
    animation: pulseBadge .8s ease-out 2;
  }

  @keyframes pulseBadge {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.12); }
  }

  @media (prefers-reduced-motion: reduce) {
    .notification-badge { animation: none; }
  }

  .notification-popover {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: 360px;
    max-width: calc(100vw - 24px);
    max-height: 480px;
    display: flex;
    flex-direction: column;
    background: var(--card);
    border: 1px solid var(--dialog-surface-border,var(--border));
    border-radius: 16px;
    box-shadow: var(--dialog-surface-shadow,var(--shadow-xl));
    z-index: 9999;
    overflow: hidden;
    animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme='dark']) .notification-popover,
  :global(.dark) .notification-popover {
    background: var(--card);
    border-color: var(--dialog-surface-border,var(--border));
    box-shadow: var(--dialog-surface-shadow,var(--shadow-xl));
  }

  @keyframes popoverFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .notification-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.08));
    background: var(--bg2, rgba(0, 0, 0, 0.02));
  }

  :global([data-theme='dark']) .notification-popover-header,
  :global(.dark) .notification-popover-header {
    background: var(--bg3, #231e16);
    border-bottom-color: var(--border, #3a3226);
  }

  .notification-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    flex: 1;
    min-width: 0;
    color: var(--text, #1a202c);
  }

  :global([data-theme='dark']) .notification-header-title,
  :global(.dark) .notification-header-title {
    color: var(--text, #ede8df);
  }

  .notification-header-count {
    padding: 2px 7px;
    border-radius: 9999px;
    background: var(--gold-light);
    color: var(--text2);
    font-size: 11px;
    font-weight: 700;
  }

  .notification-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .mark-all-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--gold, #c8963e);
    font-size: var(--font-size-label);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .mark-all-btn:hover {
    background: var(--gold-bg, rgba(200, 150, 62, 0.12));
  }

  .close-popover-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted, #718096);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .close-popover-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text, #1a202c);
  }

  :global([data-theme='dark']) .close-popover-btn:hover,
  :global(.dark) .close-popover-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .notification-list {
    flex: 1;
    overflow-y: auto;
    max-height: 380px;
  }

  .notification-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 20px;
    text-align: center;
    color: var(--muted, #718096);
  }

  :global([data-theme='dark']) .notification-empty,
  :global(.dark) .notification-empty {
    color: var(--muted, #8a7e6e);
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.7;
  }

  .notification-empty strong {
    font-size: var(--font-size-card-title);
    color: var(--text, #2d3748);
    margin-bottom: 4px;
  }

  :global([data-theme='dark']) .notification-empty strong,
  :global(.dark) .notification-empty strong {
    color: var(--text, #ede8df);
  }

  .notification-empty p {
    font-size: var(--font-size-body);
    line-height: 1.4;
    margin: 0;
  }

  .notification-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.06));
    background: transparent;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  :global([data-theme='dark']) .notification-item,
  :global(.dark) .notification-item {
    border-bottom-color: var(--border, #3a3226);
  }

  .notification-item:last-child {
    border-bottom: none;
  }

  .notification-item:hover,
  .notification-item:focus-visible {
    background: var(--hover, rgba(0, 0, 0, 0.03));
    outline: none;
  }

  :global([data-theme='dark']) .notification-item:hover,
  :global([data-theme='dark']) .notification-item:focus-visible,
  :global(.dark) .notification-item:hover,
  :global(.dark) .notification-item:focus-visible {
    background: var(--hover, #2a2318);
  }

  .notification-item.unread {
    background: rgba(200, 150, 62, 0.06);
  }

  :global([data-theme='dark']) .notification-item.unread,
  :global(.dark) .notification-item.unread {
    background: rgba(212, 168, 75, 0.12);
  }

  .item-icon-col {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .item-badge-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
  }

  .level-warning .item-badge-pill {
    background: rgba(217, 119, 6, 0.15);
    color: #d97706;
  }

  .level-error .item-badge-pill {
    background: rgba(220, 38, 38, 0.15);
    color: #dc2626;
  }

  .level-success .item-badge-pill {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .level-info .item-badge-pill {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  :global([data-theme='dark']) .level-warning .item-badge-pill,
  :global(.dark) .level-warning .item-badge-pill {
    background: rgba(217, 119, 6, 0.25);
    color: #f59e0b;
  }

  :global([data-theme='dark']) .level-error .item-badge-pill,
  :global(.dark) .level-error .item-badge-pill {
    background: rgba(220, 38, 38, 0.25);
    color: #f87171;
  }

  :global([data-theme='dark']) .level-success .item-badge-pill,
  :global(.dark) .level-success .item-badge-pill {
    background: rgba(16, 185, 129, 0.25);
    color: #34d399;
  }

  :global([data-theme='dark']) .level-info .item-badge-pill,
  :global(.dark) .level-info .item-badge-pill {
    background: rgba(59, 130, 246, 0.25);
    color: #60a5fa;
  }

  .item-content-col {
    flex: 1;
    min-width: 0;
  }

  .item-title {
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text, #1a202c);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global([data-theme='dark']) .item-title,
  :global(.dark) .item-title {
    color: var(--text, #ede8df);
  }

  .item-time {
    font-size: var(--font-size-meta);
    color: var(--muted, #8a7b68);
    white-space: nowrap;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .item-time,
  :global(.dark) .item-time {
    color: var(--muted, #8a7e6e);
  }

  .item-message {
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.4;
    color: var(--text2, #4a4033);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  :global([data-theme='dark']) .item-message,
  :global(.dark) .item-message {
    color: var(--text2, #c8bfb0);
  }

  .item-unread-dot {
    position: absolute;
    top: 14px;
    right: 12px;
    width: 7px;
    height: 7px;
    border-radius: 9999px;
    background: #e53e3e;
  }

  .notification-scrim {
    display: none;
  }

  @media (max-width: 640px) {
    .notification-bell-container {
      position: static;
    }

    .notification-bell-btn {
      flex-shrink: 0;
    }

    .notification-scrim {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      z-index: 9998;
      animation: scrimFade 0.2s ease;
    }

    @keyframes scrimFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .notification-popover {
      position: fixed;
      top: calc(var(--nav-h, 56px) + 8px);
      left: 10px;
      right: 10px;
      width: auto;
      max-width: none;
      max-height: min(480px, calc(100dvh - var(--nav-h, 56px) - env(safe-area-inset-bottom, 0px) - 86px));
      margin: 0;
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35), 0 4px 16px rgba(0, 0, 0, 0.15);
      z-index: 9999;
    }

    .notification-popover-header {
      padding: 12px 14px;
    }

    .notification-header-actions {
      gap: 4px;
    }

    .mark-all-btn {
      padding: 4px 6px;
      font-size: var(--font-size-label);
    }

    .notification-item {
      padding: 12px 14px;
      gap: 10px;
    }

    .item-title {
      font-size: var(--font-size-card-title);
    }

    .item-message {
      font-size: var(--font-size-body);
    }
  }

  /* Approved compact glass notification panel; shell/navigation remain at their owner. */
  .notification-popover,
  :global([data-theme='dark']) .notification-popover,
  :global(.dark) .notification-popover {
    overflow: visible;
    background: var(--dialog-glass-background);
    border-color: var(--dialog-glass-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-lg);
    backdrop-filter: var(--dialog-glass-filter);
    -webkit-backdrop-filter: var(--dialog-glass-filter);
  }
  .notification-tail { position:absolute;top:calc(var(--space-page)*-1.15);right:calc(var(--space-page)*.3);width:calc(var(--space-page)*2.4);height:calc(var(--space-page)*1.3);fill:var(--bg);pointer-events:none; }
  .notification-popover-header,
  :global([data-theme='dark']) .notification-popover-header,
  :global(.dark) .notification-popover-header { position:relative;padding:calc(var(--space-page)*.4) calc(var(--space-page)*.6);background:var(--bg);border-radius:var(--radius-card) var(--radius-card) 0 0;border-bottom-color:var(--border2);gap:calc(var(--space-page)*.3); }
  .notification-header-title { gap:calc(var(--space-page)*.4); }
  .notification-header-count { padding:0;background:transparent;color:var(--muted);font-size:var(--font-size-meta);font-weight:400;white-space:nowrap; }
  .mark-all-text { display:inline; }
  .mark-all-btn { color:var(--brown);white-space:nowrap;padding:calc(var(--space-page)*.3); }
  .close-popover-btn { width:44px;height:44px; }
  .notification-list { border-radius:0 0 var(--radius-card) var(--radius-card);min-height:0; }
  .notification-item,
  .notification-item.mindful-item { align-items:center;padding:calc(var(--space-page)*.6);gap:calc(var(--space-page)*.5);background:color-mix(in srgb,var(--card) 97%,transparent);border-bottom-color:var(--border2); }
  .notification-item.unread,
  .notification-item.mindful-item.level-info.unread,
  :global([data-theme='dark']) .notification-item.unread,
  :global(.dark) .notification-item.unread { background:color-mix(in srgb,var(--gold-light) 97%,transparent); }
  .item-content-col { display:grid;gap:calc(var(--space-page)*.2); }
  .item-title,.mindful-item .item-title { font-size:var(--font-size-body);font-weight:600;line-height:1.45;white-space:normal;overflow-wrap:anywhere; }
  .item-message { font-size:var(--font-size-label);line-height:1.5; }
  .item-icon-col { margin:0; }
  .item-badge-pill { width:calc(var(--space-page)*2);height:calc(var(--space-page)*2); }
  .notification-item .item-badge-pill { background:transparent; }
  .item-unread-dot,.mindful-item .item-unread-dot { position:static;flex-shrink:0;margin:0 0 0 auto;background:var(--gold); }
  .notification-read-error { padding:calc(var(--space-page)*.6);color:var(--text2);font-size:var(--font-size-label); }
  .notification-read-error button { border:0;background:transparent;color:var(--brown);font:inherit;cursor:pointer; }
  .notification-item:focus-visible,.notification-read-error button:focus-visible { outline:2px solid var(--gold);outline-offset:-2px; }
  @media(max-width:640px) {
    .notification-popover { top:var(--notification-popover-top);max-height:min(480px,calc(100dvh - var(--notification-popover-top) - env(safe-area-inset-bottom,0px) - var(--space-page))); }
    .notification-tail { right:var(--notification-tail-right); }
    .notification-scrim { background:var(--practice-dialog-backdrop); }
    .notification-list { max-height:none; }
  }
  @media(prefers-reduced-motion:reduce) { .notification-popover,.notification-scrim { animation:none; } }
</style>
