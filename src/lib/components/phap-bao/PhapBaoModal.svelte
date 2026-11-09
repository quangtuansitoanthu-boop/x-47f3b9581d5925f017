<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import {
    REQUIRED_RECITATION_COUNT,
    RECITATION_TARGETS,
    verifyRecitationLines,
    isLineMatchingTarget,
    getRecitationDisplayName,
    type RecitationTitleKind,
    type RecitationVerificationReport
  } from '$lib/domain/phap-bao/recitation';
  import type { PhapBaoItemRecord } from '$lib/server/services/phap-bao';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { isHtmlResponse } from '$lib/browser/native-api';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    open: boolean;
    session?: {
      authenticated: boolean;
      user: null | { id?: string; displayName: string; role: string };
    };
    onClose: () => void;
  }

  let { open = $bindable(false), session = { authenticated: false, user: null }, onClose }: Props = $props();

  const DRAFT_STORAGE_KEY = 'tutam_phap_bao_draft_v1';
  const isAdmin = $derived(session.authenticated && session.user?.role === 'admin');

  // State
  let items = $state<PhapBaoItemRecord[]>([]);
  let loadingItems = $state(false);
  let loadError = $state('');
  let draftBlocked = $state(false);
  let draftIssue = $state<'unreadable' | 'save' | null>(null);

  let step = $state<'select_title' | 'recite' | 'completed' | 'history'>('select_title');
  let selectedTitleKind = $state<RecitationTitleKind>('dia_tang');

  const activeShopeeUrl = $derived.by(() => {
    // 1. Ưu tiên đường link Shopee chi tiết (khác link trang chủ chung https://shopee.vn)
    const specificItem = items.find(
      (i) => i.link_shopee && i.link_shopee.trim() !== '' && i.link_shopee.replace(/\/+$/, '') !== 'https://shopee.vn'
    );
    if (specificItem?.link_shopee) return specificItem.link_shopee.trim();

    // 2. Nếu không có, lấy link của item mới nhất hoặc item có link
    const validItem = [...items].reverse().find((i) => i.link_shopee && i.link_shopee.trim() !== '');
    if (validItem?.link_shopee) return validItem.link_shopee.trim();

    // 3. Fallback từ localStorage nếu đã từng tải trước đó
    if (typeof localStorage !== 'undefined') {
      const cachedLink = localStorage.getItem('tutam_cached_shopee_link');
      if (cachedLink && cachedLink.trim() !== '') return cachedLink.trim();
    }

    return 'https://shopee.vn/product/84427568/54218649079/';
  });

  // Recitation input state
  let lines = $state<string[]>(Array.from({ length: REQUIRED_RECITATION_COUNT }, () => ''));
  let verificationReport = $state<RecitationVerificationReport | null>(null);
  let pasteNotice = $state('');
  let claiming = $state(false);
  let claimSuccess = $state(false);

  // History state
  let historyList = $state<Array<{ id: string; item_title: string; item_loai: string; danh_hieu: string; created_at: string }>>([]);
  let loadingHistory = $state(false);

  // Admin Shopee link management
  let editingShopeeLink = $state(false);
  let newShopeeUrl = $state('');
  let savingShopeeLink = $state(false);
  let saveShopeeMsg = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  function startEditShopeeLink() {
    newShopeeUrl = activeShopeeUrl;
    saveShopeeMsg = null;
    editingShopeeLink = true;
  }

  async function handleSaveShopeeLink() {
    const trimmed = newShopeeUrl.trim();
    if (!trimmed) {
      saveShopeeMsg = { type: 'error', text: 'Vui lòng nhập đường link Shopee.' };
      return;
    }
    savingShopeeLink = true;
    saveShopeeMsg = null;
    try {
      const csrf = await requireBrowserCsrf().catch(() => '');
      const res = await fetchWithSessionRefresh('/api/admin/phap-bao/link-shopee', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {})
        },
        body: JSON.stringify({ link_shopee: trimmed })
      });
      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể lưu đường link Shopee.');
      }
      saveShopeeMsg = { type: 'success', text: '✅ Đã lưu và cập nhật đường link Shopee thành công!' };
      await loadItems();
      setTimeout(() => {
        if (saveShopeeMsg?.type === 'success') {
          editingShopeeLink = false;
          saveShopeeMsg = null;
        }
      }, 1500);
    } catch (e) {
      saveShopeeMsg = { type: 'error', text: e instanceof Error ? e.message : 'Lỗi khi lưu link Shopee.' };
    } finally {
      savingShopeeLink = false;
    }
  }

  const completedCount = $derived(
    lines.filter((l) => l.trim().length > 0).length
  );

  const validLinesCount = $derived(
    lines.filter((l) => isLineMatchingTarget(l, selectedTitleKind)).length
  );

  const targetTitleConfig = $derived(RECITATION_TARGETS[selectedTitleKind]);
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const targetDisplayName = $derived(
    isEn
      ? (targetTitleConfig.displayNameEn || targetTitleConfig.displayName)
      : targetTitleConfig.displayName
  );

  function formatHistoryDanhHieu(danhHieu: string): string {
    if (!isEn || !danhHieu) return danhHieu;
    const upper = danhHieu.toUpperCase();
    if (upper.includes('ĐỊA TẠNG') || upper.includes('DIA TANG') || upper.includes('KSITIGARBHA') || upper.includes('DIZANG')) {
      return 'NAMO KSITIGARBHA BODHISATTVA';
    }
    if (upper.includes('QUÁN THẾ ÂM') || upper.includes('QUAN THE AM') || upper.includes('AVALOKIT') || upper.includes('GUANYIN')) {
      return 'NAMO AVALOKITESHVARA BODHISATTVA';
    }
    if (upper.includes('A DI ĐÀ') || upper.includes('A DI DA') || upper.includes('AMITABHA') || upper.includes('AMIDA')) {
      return 'NAMO AMITABHA BUDDHA';
    }
    return danhHieu;
  }

  // Load items from API
  async function loadItems() {
    loadingItems = true;
    loadError = '';
    try {
      const res = await fetchWithSessionRefresh('/api/phap-bao');
      if (!res.ok) throw new Error('Không thể tải danh sách kinh / pháp bảo.');
      if (isHtmlResponse(res)) throw new Error('Không thể tải danh sách kinh / pháp bảo.');
      const data = await res.json() as { items: PhapBaoItemRecord[] };
      items = data.items ?? [];
      const link = items.find((i) => i.link_shopee && i.link_shopee.trim() !== '')?.link_shopee;
      if (link && typeof localStorage !== 'undefined') {
        localStorage.setItem('tutam_cached_shopee_link', link.trim());
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Lỗi kết nối máy chủ.';
    } finally {
      loadingItems = false;
    }
  }

  // Load draft from localStorage
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.lines)
        || !parsed.lines.every((line: unknown) => typeof line === 'string')) {
        throw new Error('invalid_phap_bao_draft');
      }
      if (parsed && Array.isArray(parsed.lines) && parsed.lines.length > 0) {
        lines = parsed.lines.slice(0, REQUIRED_RECITATION_COUNT);
        while (lines.length < REQUIRED_RECITATION_COUNT) lines.push('');
        if (parsed.selectedTitleKind === 'dia_tang' || parsed.selectedTitleKind === 'quan_the_am' || parsed.selectedTitleKind === 'a_di_da') {
          selectedTitleKind = parsed.selectedTitleKind;
        }
      }
    } catch {
      draftBlocked = true;
      draftIssue = 'unreadable';
    }
  }

  function saveDraft() {
    if (draftBlocked) return;
    try {
      const payload = {
        lines,
        selectedTitleKind,
        updatedAt: Date.now()
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      draftIssue = null;
    } catch {
      draftIssue = 'save';
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      draftIssue = 'save';
      return;
    }
    draftBlocked = false;
    draftIssue = null;
    lines = Array.from({ length: REQUIRED_RECITATION_COUNT }, () => '');
    verificationReport = null;
    claimSuccess = false;
  }

  // Anti-paste warning
  function triggerPasteNotice() {
    pasteNotice = isEn
      ? '🙏 Dharma treasures honor sincere devotion! Please type each letter by hand without copying and pasting.'
      : '🙏 Pháp bảo quý ở lòng thành! Quý vị vui lòng gõ tay từng chữ, không sao chép dán.';
    setTimeout(() => {
      pasteNotice = '';
    }, 4500);
  }

  function chooseTitleKind(kind: RecitationTitleKind) {
    if (draftBlocked) return;
    if (selectedTitleKind !== kind) {
      selectedTitleKind = kind;
      // Requirement: khi chuyển qua danh hiệu khác thì phải trống để gõ từ đầu
      lines = Array.from({ length: REQUIRED_RECITATION_COUNT }, () => '');
      verificationReport = null;
      saveDraft();
    }
  }

  function handleLineInput(index: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    lines[index] = upper;

    // Requirement: Quản trị viên chỉ cần gõ 1 dòng đầu danh hiệu là nó tự nhảy hết full dòng
    if (isAdmin && index === 0 && isLineMatchingTarget(upper, selectedTitleKind)) {
      for (let i = 1; i < REQUIRED_RECITATION_COUNT; i++) {
        lines[i] = upper;
      }
    }

    if (verificationReport) {
      verificationReport = verifyRecitationLines(lines, selectedTitleKind, REQUIRED_RECITATION_COUNT, isEn ? 'en' : 'vi');
    }
    saveDraft();
  }

  function adminAutoFillFull() {
    if (!isAdmin) return;
    const textToFill = isEn
      ? (targetTitleConfig.displayNameEn || targetTitleConfig.displayName)
      : targetTitleConfig.displayName;
    for (let i = 0; i < REQUIRED_RECITATION_COUNT; i++) {
      lines[i] = textToFill;
    }
    if (verificationReport) {
      verificationReport = verifyRecitationLines(lines, selectedTitleKind, REQUIRED_RECITATION_COUNT, isEn ? 'en' : 'vi');
    }
    saveDraft();
  }

  function handleLinePaste(index: number, event: ClipboardEvent) {
    if (!isAdmin) {
      event.preventDefault();
      triggerPasteNotice();
      return;
    }

    const text = event.clipboardData?.getData('text') ?? '';
    if (!text) return;
    event.preventDefault();
    const pastedLines = text
      .split(/\r?\n/)
      .map((l) => l.trim().toUpperCase())
      .filter((l) => l.length > 0);

    // QTV tiện ích: Dán 1 lần ở dòng đầu (index 0) nó tự nhảy full 108 dòng!
    if (index === 0) {
      const defaultText = isEn
        ? (targetTitleConfig.displayNameEn || targetTitleConfig.displayName)
        : targetTitleConfig.displayName;
      const fillText = pastedLines[0] || defaultText;
      for (let i = 0; i < REQUIRED_RECITATION_COUNT; i++) {
        lines[i] = pastedLines[i] || fillText;
      }
    } else {
      for (let i = 0; i < pastedLines.length && index + i < REQUIRED_RECITATION_COUNT; i++) {
        lines[index + i] = pastedLines[i];
      }
    }

    if (verificationReport) {
      verificationReport = verifyRecitationLines(lines, selectedTitleKind, REQUIRED_RECITATION_COUNT, isEn ? 'en' : 'vi');
    }
    saveDraft();
  }

  function handleLineKeyDown(index: number, event: KeyboardEvent) {
    // Enter to next line
    if (event.key === 'Enter') {
      event.preventDefault();

      // QTV tiện ích: Bấm Enter ở dòng 1 cũng tự động điền đầy đủ 108 dòng nếu đã gõ
      if (isAdmin && index === 0 && lines[0].trim().length > 0) {
        const defaultText = isEn
          ? (targetTitleConfig.displayNameEn || targetTitleConfig.displayName)
          : targetTitleConfig.displayName;
        const textToFill = isLineMatchingTarget(lines[0], selectedTitleKind)
          ? lines[0]
          : defaultText;
        for (let i = 0; i < REQUIRED_RECITATION_COUNT; i++) {
          lines[i] = textToFill;
        }
        if (verificationReport) {
          verificationReport = verifyRecitationLines(lines, selectedTitleKind, REQUIRED_RECITATION_COUNT, isEn ? 'en' : 'vi');
        }
        saveDraft();
        return;
      }

      if (index < REQUIRED_RECITATION_COUNT - 1) {
        focusLine(index + 1);
      } else {
        submitVerification();
      }
    }

    // Up arrow to previous line
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      focusLine(index - 1);
    }

    // Down arrow to next line
    if (event.key === 'ArrowDown' && index < REQUIRED_RECITATION_COUNT - 1) {
      event.preventDefault();
      focusLine(index + 1);
    }
  }

  function focusLine(index: number) {
    void tick().then(() => {
      const el = document.getElementById(`pb-line-input-${index}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: uiScrollBehavior(), block: 'nearest' });
      }
    });
  }

  // 15s Countdown to Shopee timer state
  let countdownSeconds = $state(15);
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  function startShopeeCountdown() {
    stopShopeeCountdown();
    countdownSeconds = 15;
    countdownTimer = setInterval(() => {
      countdownSeconds -= 1;
      if (countdownSeconds <= 0) {
        countdownSeconds = 0;
        stopShopeeCountdown();
        void tick().then(() => {
          const actionBox = document.getElementById('pb-ready-action-box');
          if (actionBox) {
            actionBox.scrollIntoView({ behavior: uiScrollBehavior(), block: 'center' });
          }
        });
      }
    }, 1000);
  }

  function stopShopeeCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  // Verification
  function submitVerification() {
    const report = verifyRecitationLines(lines, selectedTitleKind, REQUIRED_RECITATION_COUNT, isEn ? 'en' : 'vi');
    verificationReport = report;

    if (report.isComplete) {
      step = 'completed';
      void tick().then(() => {
        const bodyEl = document.getElementById('pb-body-container') || document.querySelector('.pb-body');
        if (bodyEl) {
          bodyEl.scrollTop = 0;
        }
      });
      // Bắt đầu đếm ngược 15 giây để chuyển sang link Shopee (trên điện thoại sẽ mở App Shopee)
      startShopeeCountdown();
    } else {
      // Scroll to first invalid line
      if (report.invalidLineNumbers.length > 0) {
        const firstInvalidIdx = report.invalidLineNumbers[0] - 1;
        focusLine(firstInvalidIdx);
      }
    }
  }

  // Handle claim / Open Shopee (Web or Mobile App)
  function handleOpenShopee() {
    stopShopeeCountdown();
    claiming = true;

    try {
      const shopeeUrl = activeShopeeUrl;

      // 1. Ghi nhận lịch sử thỉnh ngầm (không await để tránh làm chậm điều hướng)
      if (session.authenticated && session.user?.id) {
        void fetchWithSessionRefresh('/api/phap-bao/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: items.find((i) => i.link_shopee === shopeeUrl)?.id || items[0]?.id || null,
            itemTitle: isEn ? 'Buddhist Scriptures & Dharma Treasures (Shopee fee 5,000₫ · Free items 0₫)' : 'Ấn Phẩm Kinh & Pháp Bảo (Phí sàn 5.000đ · Pháp bảo 0đ)',
            itemLoai: 'hon_hop',
            danhHieu: isEn ? (targetTitleConfig.displayNameEn || targetTitleConfig.displayName) : targetTitleConfig.displayName,
            shopeeUrl
          })
        }).catch(() => {});
      }

      // Xoá bản nháp sau khi chuyển sang link Shopee
      clearDraft();
      claimSuccess = true;

      // 2. Mở Shopee: Trên điện thoại ưu tiên kích hoạt mở App Shopee
      if (typeof window !== 'undefined') {
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);

        if (isMobile) {
          if (isAndroid) {
            // Android: Kích hoạt Intent trực tiếp vào App Shopee Việt Nam (package com.shopee.vn)
            // S.browser_fallback_url: Android tự chuyển về link web nếu máy chưa cài App Shopee, không dùng setTimeout gây xung đột
            const rawNoProtocol = shopeeUrl.replace(/^https?:\/\//, '');
            const intentUrl = `intent://${rawNoProtocol}#Intent;scheme=https;package=com.shopee.vn;S.browser_fallback_url=${encodeURIComponent(shopeeUrl)};end`;
            window.location.href = intentUrl;
          } else {
            // iOS (iPhone/iPad): Điều hướng trực tiếp bằng window.location kích hoạt Universal Links mở App Shopee
            window.location.href = shopeeUrl;
          }
        } else {
          // Máy tính để bàn: Mở tab mới
          const opened = window.open(shopeeUrl, '_blank', 'noopener,noreferrer');
          if (!opened || opened.closed || typeof opened.closed === 'undefined') {
            window.location.href = shopeeUrl;
          }
        }
      }
    } finally {
      claiming = false;
    }
  }

  async function loadUserHistory() {
    if (!session.authenticated) return;
    loadingHistory = true;
    try {
      const res = await fetchWithSessionRefresh('/api/phap-bao/history');
      if (res.ok && !isHtmlResponse(res)) {
        const data = await res.json() as { history: typeof historyList };
        historyList = data.history ?? [];
      }
    } catch {
      // Ignore
    } finally {
      loadingHistory = false;
    }
  }

  let previousStep = $state<'select_title' | 'recite' | 'completed'>('select_title');
  let pushedModalHistory = false;

  function handleOpenHistory() {
    if (step !== 'history') {
      previousStep = step as 'select_title' | 'recite' | 'completed';
    }
    step = 'history';
    void loadUserHistory();
  }

  function handleHeaderBack() {
    if (step === 'history') {
      step = previousStep || 'select_title';
    } else if (step === 'recite') {
      step = 'select_title';
    } else if (step === 'completed') {
      clearDraft();
      step = 'select_title';
      claimSuccess = false;
    } else {
      handleClose();
    }
  }

  let resetConfirmationPending = false;
  async function resetAll() {
    if (resetConfirmationPending) return;
    const expectedPrincipal = JSON.stringify([session.authenticated, session.user?.id, session.user?.role]);
    stopShopeeCountdown();
    const msg = isEn
      ? 'Are you sure you want to clear all typed lines and start over?'
      : 'Quý vị có chắc muốn xoá nội dung đã gõ và làm lại từ đầu không?';
    resetConfirmationPending = true;
    try {
      if (await confirmInApp(msg) && open && expectedPrincipal === JSON.stringify([session.authenticated, session.user?.id, session.user?.role])) {
        clearDraft();
        step = 'select_title';
      }
    } finally { resetConfirmationPending = false; }
  }

  function handleClose(popHistory = true) {
    stopShopeeCountdown();
    if (step === 'completed' || claimSuccess) {
      clearDraft();
      step = 'select_title';
      claimSuccess = false;
    }
    if (popHistory && pushedModalHistory && typeof window !== 'undefined') {
      pushedModalHistory = false;
      if (window.history.state?.phapBaoModal) {
        window.history.back();
      }
    }
    onClose();
  }

  function onModalPopState(e: PopStateEvent) {
    if (!open) return;
    if (step === 'history') {
      step = previousStep || 'select_title';
    } else if (step === 'recite') {
      step = 'select_title';
    } else if (step === 'completed') {
      clearDraft();
      step = 'select_title';
      claimSuccess = false;
    } else {
      pushedModalHistory = false;
      handleClose(false);
    }
  }

  onDestroy(() => {
    stopShopeeCountdown();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onModalPopState);
    }
  });

  onMount(() => {
    void loadItems().then(() => {
      loadDraft();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', onModalPopState);
    }
  });

  let previousOpen = false;
  $effect(() => {
    const isNowOpen = open;
    if (isNowOpen && !previousOpen) {
      if (items.length === 0) void loadItems();
      // Push history state để nút Back của trình duyệt / Android có thể lùi modal thay vì thoát trang
      if (typeof window !== 'undefined' && !pushedModalHistory) {
        window.history.pushState({ ...window.history.state, phapBaoModal: true }, '', window.location.href);
        pushedModalHistory = true;
      }
      // Tự động đưa về Bước 1 (select_title) nếu lần trước đã hoàn tất thỉnh, giúp người dùng thỉnh món khác mà không cần xóa cache
      untrack(() => {
        if (step === 'completed' || claimSuccess) {
          clearDraft();
          step = 'select_title';
          claimSuccess = false;
        }
      });
    } else if (!isNowOpen && previousOpen) {
      pushedModalHistory = false;
    }
    previousOpen = isNowOpen;
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="pb-overlay"
    role="presentation"
    onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
  >
    <div
      class="pb-modal-container pb-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pb-dialog-title"
      tabindex="-1"
    >
      <!-- Header -->
      <header class="pb-header">
        <div class="pb-header-inner">
          <div class="pb-header-left">
            {#if step !== 'select_title'}
              <button
                class="pb-btn-header-back pb-btn-back"
                type="button"
                onclick={handleHeaderBack}
                title={isEn ? "Go back" : "Quay lại"}
                aria-label={isEn ? "Go back" : "Quay lại"}
              >
                <span class="back-icon" aria-hidden="true">‹</span>
                <span class="back-text">{isEn ? 'Back' : 'Quay lại'}</span>
              </button>
            {:else}
              <span class="pb-lotus-icon" aria-hidden="true">🪷</span>
            {/if}
            <div>
              <h2 id="pb-dialog-title" class="pb-title">
                {isEn ? 'Request Scriptures & Dharma Treasures' : 'Thỉnh Kinh & Pháp Bảo Gieo Duyên'}
              </h2>
              <p class="pb-subtitle">
                {isEn ? '⚠️ Note: Deliveries strictly within Vietnam · Free Dharma gifts (5,000₫ Shopee fee)' : '⚠️ Lưu ý: Chỉ giao nhận tại Việt Nam · Pháp bảo tặng 0đ (5.000đ phí sàn Shopee)'}
              </p>
            </div>
          </div>
          <div class="pb-header-actions">
            {#if isAdmin}
              <button
                class="pb-btn-header-action pb-btn-admin-edit"
                type="button"
                onclick={startEditShopeeLink}
                title={isEn ? "Admin updates Shopee link" : "Quản trị viên cập nhật đường link Shopee"}
                aria-label={isEn ? "Edit Shopee link" : "Sửa link Shopee"}
              >
                <span class="action-icon" aria-hidden="true">⚙️</span>
                <span class="action-text">{isEn ? 'Edit link' : 'Sửa link'}</span>
              </button>
            {/if}
            {#if session.authenticated}
              <button
                class="pb-btn-header-action pb-btn-history"
                type="button"
                onclick={handleOpenHistory}
                title={isEn ? "View request history" : "Xem lịch sử thỉnh"}
                aria-label={isEn ? "Request history" : "Lịch sử thỉnh"}
              >
                <span class="action-icon" aria-hidden="true">📜</span>
                <span class="action-text">{isEn ? 'History' : 'Lịch sử'}</span>
              </button>
            {/if}
            <button class="pb-close-btn" type="button" onclick={() => handleClose()} aria-label={isEn ? "Close" : "Đóng"}>✕</button>
          </div>
        </div>
      </header>

      <!-- Admin Shopee Link Editor Drawer -->
      {#if isAdmin && editingShopeeLink}
        <div class="pb-admin-shopee-drawer">
          <div class="drawer-inner">
            <div class="drawer-header">
              <span class="drawer-title">{isEn ? '⚙️ Admin: Update Shopee Link' : '⚙️ Quản Trị Viên: Cập nhật đường link Shopee'}</span>
              <button type="button" class="drawer-close" onclick={() => editingShopeeLink = false}>✕</button>
            </div>
            <p class="drawer-desc">
              {isEn ? 'This link will be opened for all users after completing 108 recitation lines.' : 'Đường link này sẽ được mở cho toàn bộ người dùng sau khi họ hoàn thành 108 câu chép danh hiệu.'}
            </p>
            <div class="drawer-form">
              <label for="admin-shopee-input" class="drawer-label">{isEn ? 'Shopee link (product or store):' : 'Đường link Shopee (sản phẩm hoặc gian hàng):'}</label>
              <div class="drawer-input-row">
                <input
                  id="admin-shopee-input"
                  type="url"
                  class="drawer-input"
                  bind:value={newShopeeUrl}
                  placeholder="https://shopee.vn/..."
                />
                <button
                  type="button"
                  class="pb-btn pb-btn-primary"
                  disabled={savingShopeeLink}
                  onclick={handleSaveShopeeLink}
                >
                  {savingShopeeLink ? (isEn ? 'Saving...' : 'Đang lưu...') : (isEn ? 'Save link' : 'Lưu link')}
                </button>
              </div>
              {#if saveShopeeMsg}
                <div class="drawer-msg" class:msg-success={saveShopeeMsg.type === 'success'} class:msg-error={saveShopeeMsg.type === 'error'}>
                  {saveShopeeMsg.text}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Main Body -->
      <div class="pb-body" id="pb-body-container">
        {#if draftIssue}
          <p class="pb-draft-error" role="alert">{draftIssue === 'unreadable' ? localeStore.t.phapBao.draftUnreadable : localeStore.t.phapBao.draftSaveFailed}</p>
        {/if}
        <!-- STEP 1: SELECT TITLE -->
        {#if step === 'select_title'}
          <div class="pb-step-view">
            <div class="pb-view-intro">
              <h3 class="pb-view-heading">{isEn ? 'Select Sacred Name to Recite and Copy' : 'Chọn Danh Hiệu Phát Tâm Chép'}</h3>
              <p class="pb-view-desc">
                {#if isEn}
                  <strong class="pb-country-badge">⚠️ Only available when you are in Vietnam.</strong> Devoutly type <strong>108 recitations of the sacred name</strong> to receive Buddhist scriptures and Dharma treasures for practice via Shopee. Each request is <strong>5,000₫</strong> (to cover Shopee platform fees; all Dharma treasures are <strong>free of charge</strong>).
                {:else}
                  <strong class="pb-country-badge">⚠️ Chỉ khả dụng khi bạn ở Việt Nam.</strong> Chí thành gõ đủ <strong>108 biến danh hiệu</strong> để thỉnh kinh sách, pháp bảo về tu tập qua Shopee. Mỗi đơn thỉnh có giá <strong>5.000đ</strong> (để duy trì phí sàn Shopee, còn pháp bảo đều được <strong>tặng miễn phí</strong>).
                {/if}
              </p>
            </div>

            <!-- Anti-scam warning notice -->
            <div class="pb-scam-notice" role="alert">
              <div class="pb-scam-notice-header">
                <span class="pb-scam-icon">🛡️</span>
                <span class="pb-scam-notice-title">{isEn ? 'FRAUD & SCAM WARNING' : 'LƯU Ý CẢNH GIÁC LỪA ĐẢO'}</span>
              </div>
              <div class="pb-scam-notice-body">
                {#if isEn}
                  <p class="pb-scam-text">
                    ⚠️ Any pages claiming to be <strong>Duc</strong> or <strong>Quang Tu</strong> selling scriptures and Dharma treasures are <strong>scams</strong>.
                  </p>
                  <p class="pb-scam-text">
                    ⚠️ Any social media accounts (Zalo, Facebook, etc.) proactively contacting you asking for bank transfers or charity donations are <strong>NOT</strong> Duc or Quang Tu.
                  </p>
                  <p class="pb-scam-text">
                    📦 When ordering, please track your order proactively on Shopee. <strong>Do not provide personal information</strong> to anyone!
                  </p>
                {:else}
                  <p class="pb-scam-text">
                    ⚠️ Các trang nhân danh <strong>em Đức</strong> hoặc <strong>Quang Từ</strong> để bán kinh, pháp bảo đều là <strong>lừa đảo</strong>.
                  </p>
                  <p class="pb-scam-text">
                    ⚠️ Mọi tài khoản mạng xã hội (Zalo, Facebook...) chủ động nhắn tin liên hệ với mọi người kêu chuyển khoản, xin suất ăn từ thiện... đều <strong>không phải</strong> là em Đức hoặc anh Quang Từ.
                  </p>
                  <p class="pb-scam-text">
                    📦 Khi đặt hàng, cô chú anh chị chủ động theo dõi đơn hàng. <strong>Không cung cấp thông tin cá nhân</strong> cho bất kỳ ai!
                  </p>
                {/if}
              </div>
            </div>

            <div class="pb-title-options" role="radiogroup" aria-label={isEn ? "Select Bodhisattva or Buddha Name" : "Chọn danh hiệu Bồ Tát"}>
              <button
                class="pb-title-card"
                class:selected={selectedTitleKind === 'dia_tang'}
                type="button"
                role="radio"
                disabled={draftBlocked}
                aria-checked={selectedTitleKind === 'dia_tang'}
                onclick={() => chooseTitleKind('dia_tang')}
              >
                <div class="pb-title-radio">
                  <span class="dot" class:checked={selectedTitleKind === 'dia_tang'}></span>
                </div>
                <span class="pb-title-text">
                  {#if isEn}
                    NAMO KSITIGARBHA BODHISATTVA
                    <small class="pb-title-sub">Nam Mô Địa Tạng Bồ Tát</small>
                  {:else}
                    NAM MÔ ĐỊA TẠNG BỒ TÁT
                  {/if}
                </span>
              </button>

              <button
                class="pb-title-card"
                class:selected={selectedTitleKind === 'quan_the_am'}
                type="button"
                role="radio"
                disabled={draftBlocked}
                aria-checked={selectedTitleKind === 'quan_the_am'}
                onclick={() => chooseTitleKind('quan_the_am')}
              >
                <div class="pb-title-radio">
                  <span class="dot" class:checked={selectedTitleKind === 'quan_the_am'}></span>
                </div>
                <span class="pb-title-text">
                  {#if isEn}
                    NAMO AVALOKITESHVARA BODHISATTVA
                    <small class="pb-title-sub">Nam Mô Quán Thế Âm Bồ Tát</small>
                  {:else}
                    NAM MÔ QUÁN THẾ ÂM BỒ TÁT
                  {/if}
                </span>
              </button>

              <button
                class="pb-title-card"
                class:selected={selectedTitleKind === 'a_di_da'}
                type="button"
                role="radio"
                disabled={draftBlocked}
                aria-checked={selectedTitleKind === 'a_di_da'}
                onclick={() => chooseTitleKind('a_di_da')}
              >
                <div class="pb-title-radio">
                  <span class="dot" class:checked={selectedTitleKind === 'a_di_da'}></span>
                </div>
                <span class="pb-title-text">
                  {#if isEn}
                    NAMO AMITABHA BUDDHA
                    <small class="pb-title-sub">Nam Mô A Di Đà Phật</small>
                  {:else}
                    NAM MÔ A DI ĐÀ PHẬT
                  {/if}
                </span>
              </button>
            </div>

            <div class="pb-view-footer">
              <button
                class="pb-btn pb-btn-primary"
                type="button"
                onclick={() => step = 'recite'}
                disabled={draftBlocked}
              >
                {isEn ? 'Start typing 108 recitations ›' : 'Bắt đầu chép 108 lần ›'}
              </button>
            </div>
          </div>

        <!-- STEP 2: RECITING INPUT (CHÉP 108 LẦN) -->
        {:else if step === 'recite'}
          <div class="pb-step-view pb-recite-view">
            <!-- Notification banner for paste attempt -->
            {#if pasteNotice}
              <div class="pb-alert-paste" role="alert">{pasteNotice}</div>
            {/if}

            <!-- Guide and Target Preview -->
            <div class="pb-recite-guide-box">
              <div class="pb-guide-header">
                <div>
                  <div class="pb-guide-tags-row">
                    <span class="pb-guide-tag">
                      {isEn ? '🪷 Free Dharma Gifts (5,000₫ Shopee Fee)' : '🪷 Pháp Bảo Miễn Phí (5.000đ Phí Sàn Shopee)'}
                    </span>
                    {#if isAdmin}
                      <button
                        type="button"
                        class="pb-btn-admin-fill"
                        onclick={adminAutoFillFull}
                        title={isEn ? "Admin quick test" : "Dành riêng cho QTV kiểm thử nhanh"}
                      >
                        {isEn ? '⚡ Admin: Fill 108 lines' : '⚡ QTV: Điền nhanh 108 câu'}
                      </button>
                    {/if}
                  </div>
                  <div class="pb-target-canonical">
                    {isEn ? 'Sacred Name to type: ' : 'Danh hiệu cần gõ: '}
                    {#if isEn}
                      <strong class="text-gold">{targetDisplayName}</strong>
                      <span class="pb-target-en">({targetTitleConfig.displayName})</span>
                    {:else}
                      <strong class="text-gold">{targetTitleConfig.displayName}</strong>
                    {/if}
                  </div>
                </div>
                <div class="pb-guide-counter">
                  <span class="counter-num">{validLinesCount} / 108</span>
                  <span class="counter-label">{isEn ? 'valid lines' : 'câu đạt chuẩn'}</span>
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="pb-progress-track">
                <div class="pb-progress-fill" style="width: {(validLinesCount / 108) * 100}%"></div>
              </div>

              <p class="pb-rule-hint">
                {#if isEn}
                  ✍️ <em>Rules:</em> Type each letter by hand (auto-capitalized, copy-paste disabled). After each line, press <strong>Enter (new line)</strong> to advance. Complete all 108 lines.
                {:else}
                  ✍️ <em>Quy tắc:</em> Gõ tay từng chữ (hệ thống tự viết hoa, không cho dán). Gõ xong mỗi câu bấm <strong>Enter (xuống hàng)</strong> để chuyển sang câu tiếp theo. Gõ đủ 108 lần.
                {/if}
              </p>
            </div>

            <!-- Verification error notice if any -->
            {#if verificationReport && !verificationReport.isComplete}
              <div class="pb-report-alert">
                <div class="report-header">
                  {#if isEn}
                    <strong>⚠️ You have completed {verificationReport.validCount} / 108 valid lines.</strong>
                    <span>({verificationReport.missingCount} remaining)</span>
                  {:else}
                    <strong>⚠️ Quý vị đã hoàn thành {verificationReport.validCount} / 108 câu hợp lệ.</strong>
                    <span>(Còn thiếu {verificationReport.missingCount} câu)</span>
                  {/if}
                </div>
                <p class="report-sub">
                  {#if isEn}
                    Valid lines are preserved. Please review or complete the missing/invalid lines highlighted below:
                  {:else}
                    Các câu đúng đã được giữ nguyên vẹn. Quý vị chỉ cần sửa hoặc gõ bổ sung các câu bị thiếu/chưa đúng đánh dấu viền vàng bên dưới:
                  {/if}
                  <span class="invalid-tags">
                    {#each verificationReport.invalidLineNumbers.slice(0, 10) as num}
                      <button type="button" class="pb-line-jump-btn" onclick={() => focusLine(num - 1)}>{isEn ? `Line ${num}` : `Câu ${num}`}</button>
                    {/each}
                    {#if verificationReport.invalidLineNumbers.length > 10}
                      <span>{isEn ? `and ${verificationReport.invalidLineNumbers.length - 10} more lines...` : `và ${verificationReport.invalidLineNumbers.length - 10} câu khác...`}</span>
                    {/if}
                  </span>
                </p>
              </div>
            {/if}

            <!-- 108 Inputs List -->
            <div class="pb-lines-container">
              {#each lines as line, index}
                {@const lineNum = index + 1}
                {@const reportResult = verificationReport?.lineResults?.[index]}
                {@const isRealtimeValid = isLineMatchingTarget(line, selectedTitleKind)}
                {@const hasTyped = line.trim().length > 0}
                {@const isValid = reportResult ? reportResult.isValid : isRealtimeValid}
                {@const isInvalid = reportResult ? !reportResult.isValid : (hasTyped && !isRealtimeValid && line.trim().length >= 6)}

                <div
                  class="pb-line-row"
                  class:row-valid={isValid}
                  class:row-invalid={isInvalid}
                >
                  <label class="pb-line-num" for={`pb-line-input-${index}`}>{lineNum}.</label>
                  <input
                    id={`pb-line-input-${index}`}
                    class="pb-line-input"
                    disabled={draftBlocked}
                    type="text"
                    value={line}
                    placeholder={isEn ? `Type: ${targetDisplayName}` : `Gõ: ${targetTitleConfig.displayName}`}
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    oninput={(e) => handleLineInput(index, e)}
                    onkeydown={(e) => handleLineKeyDown(index, e)}
                    onpaste={(e) => handleLinePaste(index, e)}
                    oncopy={(e) => { if (!isAdmin) e.preventDefault(); }}
                    oncut={(e) => { if (!isAdmin) e.preventDefault(); }}
                  />
                  <div class="pb-line-status">
                    {#if isValid}
                      <span class="pb-badge-valid" title={isEn ? "Valid" : "Đạt yêu cầu"}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    {:else if isInvalid}
                      <span class="pb-badge-invalid" title={reportResult?.errorReason || (isEn ? `Incorrect sacred name (${targetDisplayName})` : `Chưa đúng danh hiệu (${targetTitleConfig.displayName})`)}>⚠️</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <!-- Status notice right at the footer so user always sees progress -->
            {#if verificationReport && !verificationReport.isComplete}
              <div class="pb-submit-error-bottom">
                {#if isEn}
                  ⚠️ You haven't reached 108 valid lines yet (currently <strong>{verificationReport.validCount}/108</strong> valid lines). Please complete or edit lines marked with ⚠️.
                {:else}
                  ⚠️ Quý vị chưa hoàn thành đủ 108 câu (đang đạt <strong>{verificationReport.validCount}/108</strong> câu hợp lệ). Vui lòng bổ sung hoặc sửa các câu chưa đúng (đã được đánh dấu ⚠️).
                {/if}
              </div>
            {:else if validLinesCount < 108}
              <div class="pb-submit-hint-bottom">
                {#if isEn}
                  📝 Progress: <strong>{validLinesCount}/108</strong> valid lines (108 required to request Dharma gifts; 5,000₫ Shopee fee per order, gifts are free).
                {:else}
                  📝 Tiến độ: <strong>{validLinesCount}/108</strong> câu đạt chuẩn (cần đủ 108 câu để gửi thỉnh pháp bảo; mỗi đơn 5.000đ phí sàn Shopee, pháp bảo tặng miễn phí).
                {/if}
              </div>
            {/if}

            <!-- Action buttons -->
            <div class="pb-view-footer space-between">
              <div class="pb-footer-left">
                <button class="pb-btn pb-btn-outline" type="button" onclick={() => step = 'select_title'}>
                  {isEn ? '‹ Change name' : '‹ Đổi danh hiệu'}
                </button>
                <button class="pb-btn pb-btn-ghost text-muted" type="button" onclick={resetAll}>
                  {isEn ? 'Reset all' : 'Làm lại từ đầu'}
                </button>
              </div>
              <button
                class="pb-btn pb-btn-primary"
                type="button"
                onclick={submitVerification}
              >
                {isEn ? `Verify & Receive Gifts (${validLinesCount}/108) ›` : `Gửi Kiểm Tra & Nhận Ấn Phẩm (${validLinesCount}/108) ›`}
              </button>
            </div>
          </div>

        <!-- STEP 3: COMPLETED / THANK YOU & COUNTDOWN TO SHOPEE -->
        {:else if step === 'completed'}
          <div class="pb-step-view pb-completed-view">
            <div class="pb-congrats-card">
              <div class="pb-congrats-lotus">🪷</div>
              <div class="pb-congrats-badge">{isEn ? 'GRATITUDE & REJOICING IN MERIT' : 'TRI ÂN & TÁN THÁN CÔNG ĐỨC'}</div>
              <h3 class="pb-congrats-title">{isEn ? 'Namo Amitabha Buddha!' : 'Nam Mô A Di Đà Phật!'}</h3>

              <div class="pb-blessing-card">
                <p class="pb-blessing-text pb-blessing-lead">
                  {#if isEn}
                    We express our heartfelt <strong>gratitude and rejoicing in merit</strong> to you for devoutly and diligently completing <strong>108 recitations of {targetDisplayName}</strong>.
                  {:else}
                    Kính gửi lời <strong>cảm ơn và tri ân công đức</strong> sâu sắc đến quý vị đã chí thành, tinh tấn chép trọn vẹn <strong>108 biến danh hiệu {targetTitleConfig.displayName}</strong>.
                  {/if}
                </p>
                <p class="pb-blessing-text pb-blessing-wish">
                  {#if isEn}
                    🙏 Wishing you and your family lasting peace, boundless wisdom, auspicious fortune, and steadfast perseverance on the Dharma path!
                  {:else}
                    🙏 Kính chúc quý vị cùng gia quyến thân tâm thường an lạc, phước huệ trang nghiêm, vạn sự kiết tường và luôn tinh tấn trên con đường tu tập Phật pháp!
                  {/if}
                </p>
              </div>

              <!-- 15s Countdown to Shopee banner -->
              {#if countdownSeconds > 0}
                <div class="pb-countdown-card">
                  <div class="pb-countdown-badge">
                    <span class="countdown-pulse"></span>
                    <span>{isEn ? 'PLEASE WAIT FOR CONFIRMATION' : 'VUI LÒNG ĐỢI XÁC NHẬN'}</span>
                  </div>
                  <div class="pb-countdown-timer">
                    <span class="countdown-digit">{countdownSeconds}</span>
                    <span class="countdown-unit">{isEn ? 'sec' : 'giây'}</span>
                  </div>
                  <p class="pb-countdown-desc">
                    {#if isEn}
                      The system is preparing the Dharma gift link. The <strong>Request Now</strong> button will appear in <strong>{countdownSeconds} seconds</strong>...
                    {:else}
                      Hệ thống đang chuẩn bị liên kết thỉnh ấn phẩm. Nút <strong>Thỉnh ngay</strong> sẽ xuất hiện sau <strong>{countdownSeconds} giây</strong> nữa...
                    {/if}
                  </p>
                  <p class="pb-mobile-notice">
                    {#if isEn}
                      📱 <em>Note:</em> After the 15-second timer completes, the <strong>Request Now</strong> button will appear to open the Shopee app.
                    {:else}
                      📱 <em>Lưu ý:</em> Sau khi đồng hồ chạy hết 15 giây, nút <strong>Thỉnh ngay</strong> sẽ hiển thị để quý vị bấm vào mở ứng dụng Shopee.
                    {/if}
                  </p>
                  {#if isAdmin}
                    <div style="margin-top: 8px;">
                      <button
                        type="button"
                        class="pb-admin-skip-btn"
                        onclick={() => {
                          countdownSeconds = 0;
                          stopShopeeCountdown();
                          void tick().then(() => {
                            document.getElementById('pb-ready-action-box')?.scrollIntoView({ behavior: uiScrollBehavior(), block: 'center' });
                          });
                        }}
                      >
                        {isEn ? '⚡ [Admin: Skip 15s wait for fast test]' : '⚡ [QTV: Bỏ qua 15s chờ để kiểm tra nhanh]'}
                      </button>
                    </div>
                  {/if}
                </div>
              {:else}
                <!-- Khi hết 15 giây: Banner nhỏ gọn "Bấm vào đây để thỉnh" -->
                <button
                  type="button"
                  class="pb-shopee-hint-banner"
                  aria-label={isEn ? "Tap here to request" : "Bấm vào đây để thỉnh"}
                  id="pb-ready-action-box"
                  onclick={handleOpenShopee}
                >
                  <div class="pb-hint-pill">
                    <span class="pb-hint-badge" aria-hidden="true">
                      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                    <span class="pb-hint-text">{isEn ? 'Tap here to request' : 'Bấm vào đây để thỉnh'}</span>
                    <span class="pb-hint-hand" aria-hidden="true">👇</span>
                  </div>
                  <div class="pb-hint-pointer" aria-hidden="true"></div>
                </button>

                <div class="pb-shopee-action-wrap">
                  <button
                    type="button"
                    class="pb-btn-shopee pb-btn-shopee-ready"
                    onclick={handleOpenShopee}
                  >
                    <span class="shopee-bag-icon">🛍️</span>
                    <span class="shopee-btn-text">
                      <strong>{isEn ? 'Request Now' : 'Thỉnh ngay'}</strong>
                      <small>{isEn ? 'Open Shopee app (5,000₫ platform fee · Dharma gifts free)' : 'Mở ứng dụng Shopee (Mỗi đơn 5.000đ phí sàn · Pháp bảo tặng 0đ)'}</small>
                    </span>
                  </button>
                </div>
              {/if}

              <!-- Warning banner in Step 3 before/after button -->
              <div class="pb-scam-notice pb-scam-notice-compact" role="alert">
                <div class="pb-scam-notice-header">
                  <span class="pb-scam-icon">🛡️</span>
                  <span class="pb-scam-notice-title">{isEn ? 'Fraud & Scam Warning:' : 'Lưu Ý Cảnh Giác Lừa Đảo:'}</span>
                </div>
                <div class="pb-scam-notice-body">
                  {#if isEn}
                    <p class="pb-scam-text">
                      ⚠️ Any pages claiming to be <strong>Duc</strong> or <strong>Quang Tu</strong> selling scriptures and Dharma treasures are <strong>scams</strong>.
                    </p>
                    <p class="pb-scam-text">
                      ⚠️ Any social media accounts (Zalo, Facebook, etc.) proactively contacting you asking for bank transfers or charity donations are <strong>NOT</strong> Duc or Quang Tu.
                    </p>
                    <p class="pb-scam-text">
                      📦 When ordering, please track your package proactively on Shopee, <strong>do not provide personal information</strong> to anyone!
                    </p>
                  {:else}
                    <p class="pb-scam-text">
                      ⚠️ Mọi trang nhân danh <strong>em Đức</strong> hoặc <strong>Quang Từ</strong> để bán kinh, pháp bảo đều là <strong>lừa đảo</strong>.
                    </p>
                    <p class="pb-scam-text">
                      ⚠️ Mọi tài khoản mạng xã hội (Zalo, Facebook...) chủ động nhắn tin liên hệ với mọi người kêu chuyển khoản, xin suất ăn từ thiện... đều <strong>không phải</strong> là em Đức hoặc anh Quang Từ.
                    </p>
                    <p class="pb-scam-text">
                      📦 Khi đặt hàng, cô chú anh chị chủ động theo dõi đơn hàng, <strong>không cung cấp thông tin cá nhân</strong> cho bất kỳ ai!
                    </p>
                  {/if}
                </div>
              </div>

              <div class="pb-shopee-guide">
                <p>💡 <em>{isEn ? 'Notes when requesting on Shopee:' : 'Lưu ý khi thỉnh trên Shopee:'}</em></p>
                <ul>
                  {#if isEn}
                    <li>Each order is <strong>5,000₫</strong> to cover Shopee fees; Dharma treasures are completely <strong>free of charge</strong>.</li>
                    <li>Remember to apply the <strong>Free Shipping Voucher (Freeship Xtra)</strong> in your Shopee cart for free or discounted delivery.</li>
                    {#if !session.authenticated}
                      <li class="guest-warn">Guest mode: Session data will be cleared automatically after opening Shopee for security.</li>
                    {:else}
                      <li class="auth-note">Member: This request has been saved to your practice history.</li>
                    {/if}
                  {:else}
                    <li>Mỗi đơn thỉnh có giá <strong>5.000đ</strong> để duy trì phí sàn Shopee, pháp bảo đều được <strong>tặng miễn phí</strong>.</li>
                    <li>Nhớ áp <strong>Mã Miễn Phí Vận Chuyển (Freeship Xtra)</strong> tại giỏ hàng Shopee để được giảm hoặc miễn phí ship.</li>
                    {#if !session.authenticated}
                      <li class="guest-warn">Khách chưa đăng nhập: Hệ thống sẽ tự động dọn dẹp dữ liệu phiên chép sau khi mở Shopee để bảo mật.</li>
                    {:else}
                      <li class="auth-note">Thành viên: Lần thỉnh này đã được ghi nhớ vào lịch sử tu tập của quý vị.</li>
                    {/if}
                  {/if}
                </ul>
              </div>

              <!-- Non-sticky secondary actions -->
              <div class="pb-completed-actions">
                <button
                  class="pb-btn pb-btn-outline"
                  type="button"
                  onclick={() => {
                    clearDraft();
                    step = 'select_title';
                    claimSuccess = false;
                  }}
                >
                  {isEn ? '🌸 Recite another sacred name' : '🌸 Chép lại danh hiệu khác'}
                </button>
                <button class="pb-btn pb-btn-ghost text-muted" type="button" onclick={() => handleClose()}>
                  {isEn ? 'Close window' : 'Đóng cửa sổ'}
                </button>
              </div>
            </div>
          </div>

        <!-- HISTORY VIEW -->
        {:else if step === 'history'}
          <div class="pb-step-view">
            <div class="pb-view-intro">
              <h3 class="pb-view-heading">{isEn ? 'Scripture & Dharma Gift History' : 'Lịch Sử Thỉnh Kinh & Pháp Bảo'}</h3>
              <p class="pb-view-desc">{isEn ? 'Records of scriptures and Dharma gifts you have completed recitations for and requested.' : 'Ghi chép các ấn phẩm quý vị đã hoàn mãn chép kinh và thỉnh thành công.'}</p>
            </div>

            {#if loadingHistory}
              <div class="pb-state-msg">{isEn ? 'Loading history…' : 'Đang tải lịch sử…'}</div>
            {:else if historyList.length === 0}
              <div class="pb-state-msg">{isEn ? 'No Dharma gift requests recorded yet.' : 'Quý vị chưa có ghi chép thỉnh pháp bảo nào.'}</div>
            {:else}
              <div class="pb-history-table-wrap">
                <table class="pb-history-table">
                  <thead>
                    <tr>
                      <th>{isEn ? 'Time' : 'Thời gian'}</th>
                      <th>{isEn ? 'Publication' : 'Ấn phẩm'}</th>
                      <th>{isEn ? 'Category' : 'Loại'}</th>
                      <th>{isEn ? 'Recited Name' : 'Danh hiệu đã chép'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each historyList as record (record.id)}
                      <tr>
                        <td class="history-date">
                          {new Date(record.created_at).toLocaleString(isEn ? 'en-US' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td class="history-item"><strong>{record.item_title}</strong></td>
                        <td>
                          <span class="history-badge">
                            {record.item_loai === 'kinh'
                              ? (isEn ? '📖 Scriptures' : '📖 Kinh Sách')
                              : (isEn ? '📿 Dharma Gifts' : '📿 Pháp Bảo')}
                          </span>
                        </td>
                        <td class="history-danh-hieu">{formatHistoryDanhHieu(record.danh_hieu)} ({isEn ? '108 recitations' : '108 biến'})</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            <div class="pb-view-footer">
              <button class="pb-btn pb-btn-outline pb-btn-back" type="button" onclick={handleHeaderBack}>
                {isEn ? '‹ Back' : '‹ Quay lại'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

{/if}

<style>
  .pb-draft-error { margin: 0 0 var(--radius-control); padding: var(--radius-control); color: var(--danger-text); }
  .pb-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    padding: 0;
    animation: pbFadeIn 0.25s ease-out;
  }
  @keyframes pbFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .pb-modal-container,
  .pb-card {
    background: var(--bg);
    color: var(--text);
    width: 100vw;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    max-width: 100%;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    animation: pbSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes pbSlideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Header */
  .pb-header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border2);
    padding: 0 20px;
    height: 56px;
    min-height: 56px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    z-index: 20;
  }
  .pb-header-inner {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .pb-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
  .pb-header-left > div {
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
  .pb-btn-header-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(200, 150, 62, 0.15);
    border: 1px solid rgba(200, 150, 62, 0.35);
    border-radius: 20px;
    color: var(--gold);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
    font-family: inherit;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }
  .pb-btn-header-back:hover,
  .pb-btn-header-back:active {
    background: rgba(200, 150, 62, 0.25);
    transform: translateX(-2px);
  }
  .pb-btn-header-back .back-icon {
    font-size: 18px;
    line-height: 0.9;
  }
  .pb-lotus-icon {
    font-size: 26px;
    line-height: 1;
    filter: drop-shadow(0 2px 4px rgba(200, 150, 62, 0.4));
    flex-shrink: 0;
  }
  .pb-title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--gold);
    letter-spacing: -0.2px;
    line-height: 1.25;
  }
  .pb-subtitle {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.2;
  }
  .pb-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .pb-close-btn {
    border: none;
    background: rgba(0, 0, 0, 0.06);
    color: var(--text2);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  .pb-close-btn:hover {
    background: var(--hover);
    color: var(--text);
  }

  .pb-btn-header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: rgba(200, 150, 62, 0.12);
    border: 1px solid rgba(200, 150, 62, 0.35);
    color: var(--gold);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
    line-height: 1;
  }
  .pb-btn-header-action:hover {
    background: rgba(200, 150, 62, 0.22);
    border-color: var(--gold);
  }
  .pb-btn-admin-edit {
    color: var(--gold);
  }
  .pb-btn-history {
    color: var(--text2);
    border-color: var(--border2);
    background: var(--card);
  }
  .pb-btn-history:hover {
    color: var(--text);
    border-color: var(--gold);
  }
  .action-icon {
    font-size: 14px;
    line-height: 1;
  }
  .action-text {
    font-size: 12px;
  }

  /* Admin Shopee Drawer */
  .pb-admin-shopee-drawer {
    background: var(--bg3);
    border-bottom: 2px solid var(--gold);
    padding: 14px 20px;
    box-shadow: inset 0 -4px 12px rgba(0, 0, 0, 0.08);
    animation: pbSlideDown 0.25s ease-out;
    flex-shrink: 0;
  }
  .drawer-inner {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
  }
  @keyframes pbSlideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .drawer-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--gold);
  }
  .drawer-close {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
  }
  .drawer-close:hover {
    color: var(--text);
  }
  .drawer-desc {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--text2);
    line-height: 1.4;
  }
  .drawer-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .drawer-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .drawer-input-row {
    display: flex;
    gap: 10px;
  }
  .drawer-input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
  }
  .drawer-input:focus {
    border-color: var(--gold);
    outline: none;
  }
  .drawer-msg {
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .drawer-msg.msg-success {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .drawer-msg.msg-error {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  /* Body */
  .pb-body {
    padding: 24px 20px 32px;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .pb-step-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 100%;
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .pb-view-intro {
    margin-bottom: 18px;
  }
  .pb-view-heading {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
  }
  .pb-view-desc {
    margin: 0;
    font-size: 14px;
    color: var(--text2);
    line-height: 1.5;
    text-align: justify;
  }

  /* Anti-scam Alert Box */
  .pb-scam-notice {
    background: rgba(239, 68, 68, 0.08);
    border: 1.5px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 18px;
    text-align: justify;
  }
  .pb-scam-notice-compact {
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 12.5px;
  }
  .pb-scam-notice-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .pb-scam-icon {
    font-size: 18px;
    line-height: 1;
  }
  .pb-scam-notice-title {
    font-size: 13px;
    font-weight: 800;
    color: #dc2626;
    letter-spacing: 0.3px;
  }
  :global([data-theme='dark']) .pb-scam-notice-title {
    color: #f87171;
  }
  .pb-scam-notice-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pb-scam-text {
    margin: 0;
    font-size: 13px;
    color: var(--text);
    line-height: 1.55;
    text-align: justify;
  }
  .pb-scam-text strong {
    color: #b91c1c;
  }
  :global([data-theme='dark']) .pb-scam-text strong {
    color: #fca5a5;
  }

  /* Step 2: Title cards */
  .pb-title-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }
  .pb-title-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: var(--card);
    border: 2px solid var(--border2);
    border-radius: 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .pb-title-card:hover {
    border-color: var(--gold2);
  }
  .pb-title-card.selected {
    border-color: var(--gold);
    background: var(--gold-light);
  }
  .pb-title-radio {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pb-title-radio .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: block;
    position: relative;
    transition: border-color 0.2s;
  }
  .pb-title-radio .dot.checked {
    border-color: var(--gold);
  }
  .pb-title-radio .dot.checked::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--gold);
  }
  .pb-title-text {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: 0.4px;
    line-height: 1.3;
  }
  .pb-title-sub {
    display: block;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.75;
    margin-top: 3px;
    letter-spacing: normal;
  }
  .pb-country-badge {
    display: inline-block;
    color: #dc2626;
    font-weight: 700;
    margin-bottom: 4px;
  }
  :global([data-theme='dark']) .pb-country-badge {
    color: #f87171;
  }
  .pb-target-en {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--gold);
    margin-top: 2px;
  }

  /* Step 2: Reciting inputs */
  .pb-recite-guide-box {
    background: var(--gold-light);
    border: 1px solid var(--gold-muted);
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 16px;
  }
  .pb-guide-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .pb-guide-tags-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .pb-btn-admin-fill {
    border: 1px dashed var(--gold);
    background: var(--gold-light);
    color: var(--brown);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .pb-btn-admin-fill:hover {
    background: var(--gold);
    color: #fff;
  }
  .pb-guide-tag {
    display: inline-block;
    background: var(--gold);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }
  .pb-target-canonical {
    font-size: 14px;
    color: var(--text);
  }
  .text-gold {
    color: var(--gold);
  }
  .pb-guide-counter {
    text-align: right;
  }
  .counter-num {
    display: block;
    font-size: 20px;
    font-weight: 800;
    color: var(--gold);
  }
  .counter-label {
    font-size: 11px;
    color: var(--muted);
  }
  .pb-progress-track {
    height: 8px;
    background: var(--border2);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .pb-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold), var(--gold2));
    transition: width 0.25s ease;
  }
  .pb-rule-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text2);
    line-height: 1.4;
    text-align: justify;
  }

  /* Alert paste */
  .pb-alert-paste {
    background: #fff3cd;
    border: 1px solid #ffeeba;
    color: #856404;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 14px;
    animation: pbShake 0.4s ease;
  }
  @keyframes pbShake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }

  /* Report alert */
  .pb-report-alert {
    background: #fff8eb;
    border: 1px solid #f6cf7d;
    color: #925400;
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 16px;
    font-size: 13px;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .report-sub {
    margin: 0;
    line-height: 1.5;
  }
  .invalid-tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-left: 6px;
    margin-top: 4px;
  }
  .pb-line-jump-btn {
    border: 1px solid #d49520;
    background: #fff;
    color: #b36b00;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .pb-line-jump-btn:hover {
    background: #ffe3a8;
  }

  /* Lines list */
  .pb-lines-container {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg2);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .pb-line-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card);
    border: 1px solid var(--border2);
    border-radius: 6px;
    padding: 4px 10px;
    transition: all 0.2s;
  }
  .pb-line-row:focus-within {
    border-color: var(--gold);
    box-shadow: 0 0 0 2px var(--gold-light);
  }
  .pb-line-row.row-invalid {
    border-color: #e09920;
    background: #fffaf0;
  }
  .pb-line-row.row-valid {
    border-color: rgba(34, 197, 94, 0.6);
    background: #f0fdf4;
  }
  .pb-line-num {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    min-width: 32px;
  }
  .pb-line-input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    padding: 6px 0;
    outline: none;
    letter-spacing: 0.4px;
  }
  .pb-line-input::placeholder {
    color: var(--muted);
    opacity: 0.4;
    font-weight: 400;
  }
  .pb-line-status {
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .pb-badge-valid {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: #22c55e;
    color: #fff;
    box-shadow: 0 1px 3px rgba(34, 197, 94, 0.4);
    animation: pbBadgePop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .pb-badge-valid svg {
    width: 13px;
    height: 13px;
    stroke: #fff;
    stroke-width: 2.8;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pb-badge-invalid {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    line-height: 1;
    animation: pbBadgePop 0.2s ease-out;
  }
  @keyframes pbBadgePop {
    from { transform: scale(0.6); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  /* Step 4: Completed */
  .pb-completed-view {
    padding-bottom: 28px;
  }
  .pb-congrats-card {
    text-align: center;
    padding: 12px 14px 20px;
    max-width: 540px;
    margin: 0 auto;
    width: 100%;
  }
  .pb-congrats-lotus {
    font-size: 44px;
    margin-bottom: 8px;
    animation: pbFloat 3s ease-in-out infinite;
  }
  @keyframes pbFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  .pb-congrats-badge {
    display: inline-block;
    background: linear-gradient(135deg, var(--gold), var(--brown));
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 12px;
    border-radius: 20px;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
  }
  .pb-congrats-title {
    margin: 0 0 10px;
    font-size: 21px;
    font-weight: 800;
    color: var(--gold);
  }
  .pb-blessing-card {
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.08) 0%, rgba(200, 150, 62, 0.02) 100%);
    border: 1px solid rgba(200, 150, 62, 0.25);
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 14px;
    text-align: center;
  }
  .pb-blessing-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text);
    text-align: justify;
  }
  .pb-blessing-lead {
    font-size: 14px;
    margin-bottom: 6px;
    color: var(--text);
  }
  .pb-blessing-wish {
    font-style: italic;
    color: var(--gold);
    font-weight: 500;
  }

  /* Countdown Card */
  .pb-countdown-card {
    background: linear-gradient(135deg, rgba(238, 77, 45, 0.08) 0%, rgba(255, 107, 61, 0.04) 100%);
    border: 2px solid rgba(238, 77, 45, 0.35);
    border-radius: 14px;
    padding: 14px 18px;
    margin-bottom: 16px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .pb-countdown-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #ee4d2d;
    background: rgba(238, 77, 45, 0.12);
    padding: 3px 10px;
    border-radius: 20px;
    margin-bottom: 6px;
  }
  .countdown-pulse {
    width: 7px;
    height: 7px;
    background: #ee4d2d;
    border-radius: 50%;
    animation: countdownBlink 1s infinite alternate;
  }
  @keyframes countdownBlink {
    from { opacity: 0.3; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1.2); }
  }
  .pb-countdown-timer {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    margin: 2px 0 6px;
  }
  .countdown-digit {
    font-size: 38px;
    font-weight: 900;
    line-height: 1;
    color: #ee4d2d;
    font-variant-numeric: tabular-nums;
  }
  .countdown-unit {
    font-size: 13px;
    font-weight: 600;
    color: var(--text2);
  }
  .pb-countdown-desc {
    margin: 0 0 4px;
    font-size: 13.5px;
    color: var(--text);
  }
  .pb-mobile-notice {
    margin: 0;
    font-size: 12px;
    color: #ee4d2d;
    font-weight: 600;
  }
  .pb-admin-skip-btn {
    background: none;
    border: 1px dashed var(--gold);
    color: var(--gold);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .pb-admin-skip-btn:hover {
    opacity: 0.8;
  }

  /* Floating Hint Banner (Inspired by AudioMiniPlayer Expand Hint) */
  .pb-shopee-hint-banner {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    margin: 8px auto 14px;
    z-index: 10;
    user-select: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    animation: pbHintSlideBounce 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .pb-hint-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    background: linear-gradient(135deg, #2c2014 0%, #1a140d 100%);
    border: 1.5px solid var(--gold);
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(40, 25, 10, 0.25), 0 0 12px rgba(200, 150, 62, 0.25);
    color: #fff;
    white-space: nowrap;
    animation: pbHintFloat 2.4s ease-in-out infinite;
  }
  :global([data-theme="dark"]) .pb-hint-pill {
    background: linear-gradient(135deg, #241c13 0%, #16120b 100%);
    border-color: var(--gold2);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 12px rgba(218, 165, 32, 0.2);
  }
  .pb-hint-badge {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--gold);
    color: #1a140a;
    flex-shrink: 0;
    animation: pbChevronDown 1.2s ease-in-out infinite;
  }
  .pb-hint-text {
    font-size: 13px;
    font-weight: 700;
    color: #fdfaf3;
    letter-spacing: 0.1px;
    line-height: 1.2;
  }
  .pb-hint-hand {
    font-size: 14px;
    display: inline-block;
    animation: pbHandPoint 1.2s ease-in-out infinite;
  }
  .pb-hint-pointer {
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--gold);
    margin-top: 1px;
  }
  :global([data-theme="dark"]) .pb-hint-pointer {
    border-top-color: var(--gold2);
  }

  @keyframes pbHintSlideBounce {
    0% { opacity: 0; transform: translateY(-8px) scale(0.92); }
    60% { opacity: 1; transform: translateY(2px) scale(1.02); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes pbHintFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  @keyframes pbChevronDown {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(2px); }
  }
  @keyframes pbHandPoint {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(3px); }
  }

  .pb-shopee-action-wrap {
    margin-bottom: 16px;
    width: 100%;
  }
  .pb-btn-shopee-ready {
    animation: pbPulseGlow 2s infinite;
  }
  @keyframes pbPulseGlow {
    0%, 100% { box-shadow: 0 6px 20px rgba(238, 77, 45, 0.35); }
    50% { box-shadow: 0 8px 28px rgba(238, 77, 45, 0.65); transform: translateY(-1px); }
  }
  .pb-btn-shopee {
    width: 100%;
    padding: 14px 22px;
    background: linear-gradient(135deg, #ee4d2d 0%, #ff6b3d 100%);
    color: #fff;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    text-decoration: none;
    box-sizing: border-box;
    box-shadow: 0 6px 20px rgba(238, 77, 45, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .pb-btn-shopee:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(238, 77, 45, 0.45);
    color: #fff;
  }
  .shopee-bag-icon {
    font-size: 24px;
  }
  .shopee-btn-text {
    display: flex;
    flex-direction: column;
    text-align: left;
  }
  .shopee-btn-text strong {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .shopee-btn-text small {
    font-size: 11.5px;
    opacity: 0.92;
  }

  .pb-shopee-guide {
    text-align: justify;
    background: var(--bg3);
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 12px;
    color: var(--text2);
    margin-bottom: 16px;
  }
  .pb-shopee-guide p {
    margin: 0 0 6px;
    font-weight: 700;
    text-align: justify;
  }
  .pb-shopee-guide ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: justify;
  }
  .pb-shopee-guide li {
    text-align: justify;
  }

  .pb-completed-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border2);
  }
  @media (max-width: 600px) {
    .pb-completed-actions {
      flex-direction: column;
      gap: 8px;
    }
    .pb-completed-actions .pb-btn {
      width: 100%;
    }
  }

  .pb-submit-error-bottom {
    margin: 12px 0 6px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 8px;
    color: #f87171;
    font-size: 13px;
    line-height: 1.5;
  }
  .pb-submit-hint-bottom {
    margin: 10px 0 6px;
    font-size: 13px;
    color: var(--text2);
    text-align: right;
  }

  /* History Table */
  .pb-history-table-wrap {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow-x: auto;
    margin-bottom: 20px;
  }
  .pb-history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .pb-history-table th {
    background: var(--bg2);
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    color: var(--muted);
  }
  .pb-history-table td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border2);
  }
  .history-date {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .history-badge {
    display: inline-block;
    background: var(--bg3);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
  }

  /* State messages */
  .pb-state-msg {
    text-align: center;
    padding: 30px 16px;
    color: var(--muted);
    font-size: 14px;
  }

  /* View Footer & Buttons */
  .pb-view-footer {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: 16px 0;
    background: var(--bg);
    border-top: 1px solid var(--border2);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    z-index: 25;
    box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.06);
  }
  .pb-view-footer.space-between {
    justify-content: space-between;
  }
  .pb-footer-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pb-btn {
    border: none;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .pb-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .pb-btn-primary {
    background: var(--gold);
    color: #fff;
    box-shadow: 0 4px 14px rgba(200, 150, 62, 0.3);
  }
  .pb-btn-primary:hover:not(:disabled) {
    background: var(--gold2);
    transform: translateY(-1px);
  }
  .pb-btn-outline {
    background: none;
    border: 1px solid var(--border);
    color: var(--text2);
  }
  .pb-btn-outline:hover {
    background: var(--hover);
  }
  .pb-btn-ghost {
    background: none;
    color: var(--text2);
  }

  @media (max-width: 680px) {
    .pb-subtitle {
      display: none;
    }
    .pb-header {
      padding: max(10px, env(safe-area-inset-top)) 14px 10px;
      height: auto;
      min-height: 48px;
    }
    .pb-header-left {
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .pb-lotus-icon {
      font-size: 22px;
    }
    .pb-title {
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pb-header-actions {
      gap: 6px;
      flex-shrink: 0;
    }
    .pb-btn-header-action {
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 50%;
      font-size: 15px;
    }
    .pb-btn-header-action .action-text {
      display: none;
    }
    .pb-close-btn {
      width: 32px;
      height: 32px;
    }
    .pb-body {
      padding: 16px 14px 20px;
    }
    .pb-line-input {
      font-size: 16px; /* Prevents auto-zoom on mobile iOS */
    }
    .pb-view-footer {
      padding: 12px 0 max(14px, env(safe-area-inset-bottom));
      box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.12);
    }
    .pb-view-footer .pb-btn {
      width: 100%;
      padding: 13px 18px;
      font-size: 15px;
      font-weight: 800;
    }
    .pb-view-footer.space-between {
      flex-direction: column-reverse;
      gap: 10px;
    }
    .pb-view-footer.space-between .pb-footer-left {
      width: 100%;
      display: flex;
      gap: 8px;
    }
    .pb-view-footer.space-between .pb-footer-left .pb-btn {
      flex: 1;
      padding: 10px;
      font-size: 13px;
    }
  }



  /* Dark mode text contrast & readability overrides */
  :global([data-theme='dark']) .pb-title-card {
    background: var(--card);
    border-color: var(--border);
  }
  :global([data-theme='dark']) .pb-title-card:hover {
    border-color: var(--gold2);
    background: rgba(212, 168, 75, 0.08);
  }
  :global([data-theme='dark']) .pb-title-card.selected {
    border-color: var(--gold);
    background: rgba(212, 168, 75, 0.16);
  }
  :global([data-theme='dark']) .pb-title-text {
    color: var(--text);
  }

  :global([data-theme='dark']) .pb-alert-paste {
    background: rgba(212, 168, 75, 0.18);
    border-color: rgba(212, 168, 75, 0.45);
    color: #fcefd4;
  }
  :global([data-theme='dark']) .pb-report-alert {
    background: rgba(212, 168, 75, 0.16);
    border-color: rgba(212, 168, 75, 0.45);
    color: #fcefd4;
  }
  :global([data-theme='dark']) .pb-line-jump-btn {
    background: var(--bg2);
    border-color: var(--gold);
    color: var(--gold2);
  }
  :global([data-theme='dark']) .pb-line-jump-btn:hover {
    background: var(--gold);
    color: #1a140a;
  }
  :global([data-theme='dark']) .pb-line-row.row-invalid {
    background: rgba(224, 153, 32, 0.16);
    border-color: #f0a830;
  }
  :global([data-theme='dark']) .pb-line-row.row-valid {
    background: rgba(34, 197, 94, 0.14);
    border-color: rgba(34, 197, 94, 0.55);
  }
  :global([data-theme='dark']) .pb-line-num {
    color: var(--text2);
  }
  :global([data-theme='dark']) .pb-line-input::placeholder {
    color: var(--muted);
    opacity: 0.65;
  }
  :global([data-theme='dark']) .pb-guide-tag {
    background: var(--gold);
    color: #1a140a;
    font-weight: 800;
  }
  :global([data-theme='dark']) .counter-label {
    color: var(--text2);
  }
  :global([data-theme='dark']) .pb-history-table th,
  :global([data-theme='dark']) .history-date {
    color: var(--text2);
  }
  :global([data-theme='dark']) .pb-view-footer {
    background: var(--bg);
    border-top-color: var(--border);
    box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.45);
  }
  :global([data-theme='dark']) .pb-btn-admin-fill {
    background: rgba(212, 168, 75, 0.2);
    border-color: rgba(212, 168, 75, 0.45);
    color: #f7ecd5;
  }
  :global([data-theme='dark']) .pb-btn-admin-fill:hover {
    background: var(--gold);
    color: #1a140a;
  }
</style>
