<script lang="ts">
  import { onDestroy } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  const TOPICS = [
    { id: 'feature', icon: '💡', vi: 'Góp ý tính năng mới', en: 'Feature Suggestion' },
    { id: 'bug', icon: '🐞', vi: 'Báo cáo lỗi ứng dụng', en: 'Bug Report' },
    { id: 'dharma', icon: '🌸', vi: 'Thắc mắc Phật pháp & Tu tập', en: 'Dharma & Practice Question' },
    { id: 'other', icon: '📝', vi: 'Ý kiến đóng góp khác', en: 'General Feedback' }
  ];

  let selectedTopicId = $state('feature');
  let subjectText = $state('');
  let messageText = $state('');
  let includeDeviceInfo = $state(true);
  let copiedNotice = $state(false);
  let copyFailed = $state(false);
  let copying = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let copyAttempt = 0;

  function clearCopyTimer() {
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = null;
  }

  onDestroy(() => { copyAttempt += 1; clearCopyTimer(); });

  $effect(() => {
    if (!open) {
      copyAttempt += 1;
      clearCopyTimer();
      copiedNotice = false;
      copyFailed = false;
      copying = false;
    }
  });

  const officialEmail = 'tutap.phatphap26@gmail.com';

  $effect(() => {
    if (open) {
      copiedNotice = false;
      const found = TOPICS.find((t) => t.id === selectedTopicId);
      if (found && !subjectText) {
        subjectText = isEn ? `[Tu Tap Feedback] ${found.en}` : `[Góp ý Tu Tập] ${found.vi}`;
      }
    }
  });

  function selectTopic(id: string) {
    triggerHaptic('selection');
    selectedTopicId = id;
    const found = TOPICS.find((t) => t.id === id);
    if (found) {
      subjectText = isEn ? `[Tu Tap Feedback] ${found.en}` : `[Góp ý Tu Tập] ${found.vi}`;
    }
  }

  function getFullBody(): string {
    let body = messageText.trim();
    if (includeDeviceInfo && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const platform = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : 'Web';
      body += `\n\n---\nThông tin thiết bị:\n- Ứng dụng: Tu Tập (tutam-mobile)\n- Thiết bị: ${platform}\n- Ngày gửi: ${new Date().toLocaleString('vi-VN')}`;
    }
    return body;
  }

  function handleSendEmail() {
    triggerHaptic('medium');
    const subject = encodeURIComponent(subjectText || (isEn ? 'Tu Tap App Feedback' : 'Góp ý ứng dụng Tu Tập'));
    const body = encodeURIComponent(getFullBody());
    const mailtoUrl = `mailto:${officialEmail}?subject=${subject}&body=${body}`;

    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      const intentUrl = `intent://co?to=${officialEmail}&subject=${subject}&body=${body}#Intent;scheme=googlegmail;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(mailtoUrl)};end`;
      window.location.href = intentUrl;
      setTimeout(() => {
        window.location.href = mailtoUrl;
      }, 700);
      onClose();
      return;
    }
    window.location.href = mailtoUrl;
    onClose();
  }

  async function handleCopyAll() {
    if (copying) return;
    triggerHaptic('light');
    clearCopyTimer();
    copiedNotice = false;
    copyFailed = false;
    copying = true;
    const attempt = ++copyAttempt;
    const content = `Người nhận: ${officialEmail}\nTiêu đề: ${subjectText}\n\nNội dung:\n${getFullBody()}`;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(content);
      if (!open || attempt !== copyAttempt) return;
      copiedNotice = true;
      copyTimer = setTimeout(() => {
        copiedNotice = false;
        copyTimer = null;
      }, 2800);
    } catch {
      if (open && attempt === copyAttempt) copyFailed = true;
    } finally {
      if (attempt === copyAttempt) copying = false;
    }
  }
</script>

{#if open}
  <dialog class="fem-backdrop" use:modalDialog aria-labelledby="fem-modal-title" oncancel={(event) => { event.preventDefault(); onClose(); }} onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div
      class="fem-dialog" data-dialog-glass
    >
      <!-- Header -->
      <div class="fem-header">
        <div class="fem-title-wrap">
          <span class="fem-header-icon" aria-hidden="true">✉️</span>
          <h2 id="fem-modal-title" class="fem-title" tabindex="-1" data-modal-focus>
            {isEn ? 'Compose Feedback Email' : 'Soạn Thư Góp Ý'}
          </h2>
        </div>
        <button
          type="button"
          class="fem-close-btn"
          onclick={onClose}
          aria-label={isEn ? 'Close' : 'Đóng'}
        >
          ✕
        </button>
      </div>

      <div class="fem-body">
        <!-- Recipient -->
        <div class="fem-field-group">
          <span class="fem-field-label">{isEn ? 'Recipient' : 'Người nhận'}:</span>
          <div class="fem-recipient-row">
            <span class="fem-email-text">{officialEmail}</span>
            <span class="fem-badge-official">{isEn ? 'Official' : 'Chính thức'}</span>
          </div>
        </div>

        <!-- Topic Pills -->
        <div class="fem-field-group">
          <span class="fem-field-label">{isEn ? 'Subject Category' : 'Chủ đề'}:</span>
          <div class="fem-topics-pills">
            {#each TOPICS as topic}
              <button
                type="button"
                class="fem-topic-pill"
                class:fem-topic-pill--active={selectedTopicId === topic.id}
                onclick={() => selectTopic(topic.id)}
              >
                <span>{topic.icon}</span>
                <span>{isEn ? topic.en : topic.vi}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Subject Input -->
        <div class="fem-field-group">
          <label for="fem-input-subject" class="fem-field-label">
            {isEn ? 'Subject' : 'Tiêu đề thư'}:
          </label>
          <input
            id="fem-input-subject"
            type="text"
            class="fem-input"
            bind:value={subjectText}
            placeholder={isEn ? 'Enter email subject...' : 'Nhập tiêu đề thư...'}
          />
        </div>

        <!-- Message Body Textarea -->
        <div class="fem-field-group">
          <label for="fem-textarea-body" class="fem-field-label">
            {isEn ? 'Message Content' : 'Nội dung góp ý'}:
          </label>
          <textarea
            id="fem-textarea-body"
            class="fem-textarea"
            rows="5"
            bind:value={messageText}
            placeholder={isEn
              ? 'Please describe your thoughts, feature ideas, or issues you encountered...'
              : 'Kính gửi Ban biên tập Tu Tập, con/tôi xin có một số ý kiến đóng góp như sau...'}
          ></textarea>
        </div>

        <!-- Include Device Info Checkbox -->
        <label class="fem-check-label">
          <input type="checkbox" bind:checked={includeDeviceInfo} />
          <span>{isEn ? 'Include basic device & app info to help diagnostics' : 'Đính kèm thông tin thiết bị cơ bản để hỗ trợ kỹ thuật nhanh hơn'}</span>
        </label>
      </div>

      {#if copyFailed}<p class="fem-copy-error" role="alert">{localeStore.t.feedback.copyFailed}</p>{/if}
      <!-- Footer Actions -->
      <div class="fem-footer dialog-actions-balanced">
        <button
          type="button"
          class="fem-btn-copy"
          onclick={handleCopyAll}
          disabled={copying}
          aria-busy={copying}
        >
          {copiedNotice ? (isEn ? 'Copied ✓' : 'Đã sao chép ✓') : (isEn ? 'Copy Mail' : 'Sao chép thư')}
        </button>

        <button
          type="button"
          class="fem-btn-send"
          onclick={handleSendEmail}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>{isEn ? 'Send via Email App' : 'Mở ứng dụng gửi thư'}</span>
        </button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .fem-copy-error { margin: 0; padding: var(--radius-control) var(--radius-card); color: var(--danger-text); }
  .fem-backdrop {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    box-sizing: border-box;
    color: var(--text);
    z-index: 11000;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: grid;
    place-items: center;
    padding: 16px;
    animation: femFadeIn 0.2s ease-out;
  }
  .fem-backdrop::backdrop { background: transparent; }

  @keyframes femFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .fem-dialog {
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 20px;
    background: var(--dialog-surface-background,var(--card));
    border: 1px solid var(--dialog-surface-border,var(--border));
    box-shadow: var(--dialog-surface-shadow,var(--shadow-xl));
    display: flex;
    flex-direction: column;
    animation: femSlideUp 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
  }

  @keyframes femSlideUp {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .fem-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--border);
  }

  .fem-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fem-header-icon {
    font-size: 20px;
  }

  .fem-title {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 800;
    color: var(--text);
  }

  .fem-close-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    border-radius: 50%;
  }

  .fem-close-btn:hover {
    background: var(--bg2);
    color: var(--text);
  }

  .fem-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .fem-field-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .fem-field-label {
    font-size: var(--font-size-label);
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .fem-recipient-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--bg2);
    border: 1px solid var(--border);
  }

  .fem-email-text {
    font-size: var(--font-size-body);
    font-weight: 700;
    color: var(--gold);
    flex: 1;
  }

  .fem-badge-official {
    font-size: var(--font-size-meta);
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gold) 20%, transparent);
    color: var(--gold);
  }

  .fem-topics-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .fem-topic-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 11px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: inherit;
    font-weight: 600;
    font-size: var(--font-size-label);
    line-height: 1;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .fem-topic-pill:hover {
    border-color: var(--gold);
  }

  .fem-topic-pill--active {
    background: var(--gold);
    color: #fff;
    border-color: var(--gold);
  }

  .fem-input, .fem-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1.5px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: inherit;
    font-weight: 500;
    font-size: 16px;
    line-height: 1.4;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .fem-input:focus, .fem-textarea:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 2px rgba(200, 150, 62, 0.15);
  }

  .fem-textarea {
    resize: vertical;
    min-height: 100px;
  }

  .fem-check-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-label);
    color: var(--muted);
    cursor: pointer;
  }

  .fem-check-label input {
    accent-color: var(--gold);
    width: 16px;
    height: 16px;
  }

  .fem-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 18px 16px;
    border-top: 1px solid var(--border);
  }

  .fem-btn-copy {
    padding: 9px 15px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: inherit;
    font-weight: 600;
    font-size: var(--font-size-label);
    line-height: 1;
    cursor: pointer;
  }

  .fem-btn-send {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    border-radius: 999px;
    border: 0;
    background: var(--gold);
    color: #fff;
    font-family: inherit;
    font-weight: 700;
    font-size: var(--font-size-label);
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 3px 12px rgba(200, 150, 62, 0.28);
    transition: transform 0.12s ease;
  }

  .fem-btn-send:active {
    transform: scale(0.97);
  }
</style>
