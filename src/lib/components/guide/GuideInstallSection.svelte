<script lang="ts">
  import { onMount } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.guidePage.installSection);

  interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  interface Props {
    open: boolean;
    onToggle: (open: boolean) => void;
  }

  let { open, onToggle }: Props = $props();
  let installPrompt: InstallPromptEvent | null = $state(null);
  let installFallbackVisible = $state(false);
  let installIsIos = $state(false);
  let installIsStandalone = $state(false);

  async function installApp(): Promise<void> {
    if (!installPrompt) {
      installFallbackVisible = true;
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === 'accepted') installIsStandalone = true;
  }

  onMount(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    installIsStandalone = window.matchMedia('(display-mode: standalone)').matches
      || navigatorWithStandalone.standalone === true;
    const userAgent = navigator.userAgent.toLowerCase();
    installIsIos = /ipad|iphone|ipod/u.test(userAgent)
      && /safari/u.test(userAgent)
      && !/chrome|crios|crmo/u.test(userAgent);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      installPrompt = event as InstallPromptEvent;
      installFallbackVisible = false;
    };
    const markInstalled = () => {
      installPrompt = null;
      installIsStandalone = true;
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  });
</script>

<details
  id="cai-app"
  class="guide-section guide-focus-target"
  {open}
  ontoggle={(event) => onToggle(event.currentTarget.open)}
>
  <summary class="guide-section__summary">
    <span class="guide-section__title-group">
      <span class="guide-icon-badge" aria-hidden="true">📱</span>
      <span class="guide-section__title-text">{t.summary}</span>
    </span>
    <span class="guide-section__chevron" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </span>
  </summary>
  <div class="guide-section__body">
    <p>{t.description}</p>
    {#if installIsStandalone}
      <p class="guide-install-status" role="status">{t.alreadyInstalled}</p>
    {:else if installIsIos}
      <ol class="guide-install-steps">
        <li>{t.iosStep1}<strong>{t.iosShare}</strong>.</li>
        <li>{t.iosStep2}<strong>{t.iosAddToHome}</strong><!-- Thêm vào Màn hình chính -->.</li>
        <li>{t.iosStep3}<strong>{t.iosAdd}</strong>{t.iosFinish}</li>
      </ol>
    {:else}
      <button class="guide-install-button" type="button" onclick={installApp}>
        <span aria-hidden="true">⇩</span> {t.installBtn}
      </button>
      {#if installFallbackVisible}
        <p class="guide-install-fallback" role="status">{t.fallback}</p>
      {/if}
      <aside class="guide-callout">
        <strong>{t.calloutTitle}</strong>
        <p>{t.calloutDesc}</p>
      </aside>
    {/if}
  </div>
</details>
