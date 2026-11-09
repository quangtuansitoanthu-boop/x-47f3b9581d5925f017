<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import {
    guideConfirmState,
    detectGuideConfirmType,
    type GuideConfirmType
  } from './guide-confirm-store.svelte';

  const localeStore = getLocaleContext();
  // Store dùng chung không được giữ lời xác nhận của route Hướng Dẫn đã rời đi.
  onDestroy(() => guideConfirmState.close());
  const t = $derived(localeStore.t.guidePage.confirmModal);
  const isEn = $derived(localeStore.current === 'en');

  const type = $derived<GuideConfirmType>(
    detectGuideConfirmType(guideConfirmState.item)
  );

  const modalIcon = $derived.by(() => {
    switch (type) {
      case 'practice':
        return '📿';
      case 'book':
        return '📖';
      case 'talk':
        return '🎧';
      default:
        return '🪷';
    }
  });

  const modalTag = $derived.by(() => {
    switch (type) {
      case 'practice':
        return t?.tagPractice || (isEn ? 'Practice & Chanting' : 'Tu Tập & Trì Tụng');
      case 'book':
        return t?.tagBook || (isEn ? 'Buddhist Books & Karma' : 'Kinh Sách & Luân Hồi');
      case 'talk':
        return t?.tagTalk || (isEn ? 'Dharma Talks & Audio' : 'Pháp Thoại & Thính Pháp');
      default:
        return t?.tagGeneric || (isEn ? 'Navigation' : 'Chuyển Trang');
    }
  });

  const modalTitle = $derived.by(() => {
    switch (type) {
      case 'practice':
        return t?.titlePractice || (isEn ? 'Confirm Practice Session' : 'Xác nhận vào Tu Tập');
      case 'book':
        return t?.titleBook || (isEn ? 'Confirm Reading Book' : 'Xác nhận mở Kinh Sách');
      case 'talk':
        return t?.titleTalk || (isEn ? 'Confirm Dharma Talk' : 'Xác nhận nghe Pháp Thoại');
      default:
        return t?.titleGeneric || (isEn ? 'Confirm Navigation' : 'Xác nhận chuyển trang');
    }
  });

  const modalPrompt = $derived.by(() => {
    switch (type) {
      case 'practice':
        return t?.promptPractice || (isEn ? 'Would you like to navigate to Practice and start this session now?' : 'Bạn có muốn chuyển sang mục Tu Tập để thực hành bài này ngay không?');
      case 'book':
        return t?.promptBook || (isEn ? 'Would you like to navigate to Books and read this work now?' : 'Bạn có muốn chuyển sang mục Kinh Sách để đọc tác phẩm này ngay không?');
      case 'talk':
        return t?.promptTalk || (isEn ? 'Would you like to navigate to Dharma Talks and listen to this lecture now?' : 'Bạn có muốn chuyển sang mục Pháp Thoại để nghe bài giảng này ngay không?');
      default:
        return t?.promptGeneric || (isEn ? 'Would you like to navigate to this page now?' : 'Bạn có muốn chuyển sang trang nội dung này ngay không?');
    }
  });

  const confirmBtnLabel = $derived.by(() => {
    if (guideConfirmState.item?.buttonLabel) {
      return `${guideConfirmState.item.buttonLabel} →`;
    }
    switch (type) {
      case 'practice':
        return t?.btnConfirmPractice || (isEn ? 'Start Practice →' : 'Vào Tu Tập ngay →');
      case 'book':
        return t?.btnConfirmBook || (isEn ? 'Read Book →' : 'Đọc sách ngay →');
      case 'talk':
        return t?.btnConfirmTalk || (isEn ? 'Listen Now →' : 'Nghe pháp thoại ngay →');
      default:
        return t?.btnConfirmGeneric || (isEn ? 'Continue →' : 'Đồng ý chuyển →');
    }
  });

</script>

{#if guideConfirmState.isOpen && guideConfirmState.item}
  <dialog
    use:modalDialog
    class="guide-confirm-scrim"
    aria-labelledby="guide-confirm-title"
    aria-describedby="guide-confirm-desc"
    oncancel={(event) => { event.preventDefault(); guideConfirmState.close(); }}
    onclick={(event) => event.target === event.currentTarget && guideConfirmState.close()}
  >
    <div
      class="guide-confirm-dialog"
      data-dialog-glass
    >
      <div class="guide-confirm-header">
        <div class="guide-confirm-icon-wrap" aria-hidden="true">
          <span class="guide-confirm-icon">{modalIcon}</span>
        </div>
        <span class="guide-confirm-badge">{modalTag}</span>
        <h3 id="guide-confirm-title">{modalTitle}</h3>
        <p id="guide-confirm-desc" class="guide-confirm-prompt">{modalPrompt}</p>
      </div>

      <!-- Item Preview Card -->
      <div class="guide-confirm-preview-card">
        <div class="guide-confirm-preview-title">
          <span class="preview-bullet" aria-hidden="true">✦</span>
          <strong>{guideConfirmState.item.label}</strong>
        </div>
        {#if guideConfirmState.item.text}
          <p class="guide-confirm-preview-text">{guideConfirmState.item.text}</p>
        {/if}
      </div>

      <!-- Action Buttons -->
      <div class="guide-confirm-actions dialog-actions-balanced">
        <button
          type="button"
          class="guide-btn-cancel"
          data-modal-focus
          onclick={() => guideConfirmState.close()}
        >
          {t?.btnCancel || (isEn ? 'Stay on Guide' : 'Ở lại đọc tiếp')}
        </button>
        <button
          type="button"
          class="guide-btn-confirm"
          onclick={() => guideConfirmState.confirm()}
        >
          {confirmBtnLabel}
        </button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .guide-confirm-scrim {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.62);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    animation: fadeIn 0.18s ease-out;
  }

  .guide-confirm-scrim::backdrop {
    background: transparent;
  }

  .guide-confirm-dialog {
    width: min(410px, 100%);
    max-height: calc(100dvh - 40px);
    overflow-y: auto;
    background: var(--dialog-surface-background, var(--card));
    border: 1.5px solid var(--dialog-surface-border, var(--border2));
    border-radius: 20px;
    padding: 22px 20px 18px;
    text-align: center;
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    animation: popUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .guide-confirm-icon-wrap {
    width: 58px;
    height: 58px;
    margin: 0 auto 10px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.18), rgba(200, 150, 62, 0.06));
    border: 1px solid rgba(200, 150, 62, 0.3);
    box-shadow: 0 4px 14px rgba(200, 150, 62, 0.15);
  }

  .guide-confirm-icon {
    font-size: 28px;
    line-height: 1;
  }

  .guide-confirm-badge {
    display: inline-block;
    padding: 3px 11px;
    border-radius: 999px;
    font-size: var(--font-size-meta);
    font-weight: 750;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--gold);
    background: rgba(200, 150, 62, 0.12);
    border: 1px solid rgba(200, 150, 62, 0.25);
    margin-bottom: 8px;
  }

  .guide-confirm-dialog h3 {
    margin: 0 0 6px;
    font-size: var(--font-size-section-title);
    font-weight: 800;
    color: var(--text);
    line-height: 1.32;
  }

  .guide-confirm-prompt {
    margin: 0 0 16px;
    font-size: var(--font-size-body);
    color: var(--muted);
    line-height: 1.5;
  }

  .guide-confirm-preview-card {
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 18px;
    text-align: left;
  }

  .guide-confirm-preview-title {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: var(--font-size-body);
    line-height: 1.4;
    color: var(--gold);
    margin-bottom: 4px;
  }

  .preview-bullet {
    font-size: 10px;
    line-height: 1.6;
    flex-shrink: 0;
  }

  .guide-confirm-preview-title strong {
    color: var(--text);
    font-weight: 750;
  }

  .guide-confirm-preview-text {
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.5;
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .guide-confirm-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .guide-btn-cancel {
    flex: 1;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1.5px solid var(--border2);
    background: transparent;
    color: var(--text2);
    font-size: var(--font-size-body);
    font-weight: 650;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .guide-btn-cancel:hover {
    background: var(--bg2);
    color: var(--text);
  }

  .guide-btn-confirm {
    flex: 1.25;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, var(--gold) 0%, color-mix(in srgb, var(--gold) 80%, #000) 100%);
    color: #ffffff;
    font-size: var(--font-size-body);
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(180, 130, 45, 0.32);
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .guide-btn-confirm:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(180, 130, 45, 0.42);
    filter: brightness(1.05);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes popUp {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @media (max-width: 360px) {
    .guide-confirm-dialog {
      padding: 18px 14px 16px;
    }
    .guide-confirm-actions {
      flex-direction: column;
      gap: 8px;
    }
    .guide-btn-cancel,
    .guide-btn-confirm {
      width: 100%;
      flex: none;
    }
  }
</style>
