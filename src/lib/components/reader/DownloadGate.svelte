<script lang="ts">
  import { throwIfAborted } from '$lib/browser/abort-signal';
  import { onDestroy, onMount } from 'svelte';
  import { fetchWithSessionRefresh, getBrowserSession } from '$lib/browser/session-csrf';
  import { fetchNativeJsonMutation } from '$lib/browser/native-api';
  import { refreshBrowserSession } from '$lib/stores/session.svelte';
  interface Props {
    authenticated: boolean;
    url: string;
    fileName: string;
    label: string;
    fetchAsBlob?: boolean;
    prepareFile?: (signal: AbortSignal) => Promise<Blob>;
    pendingMessage?: string;
    successMessage?: string;
    fallbackMessage?: string;
    onNotify?: (message: string) => void;
  }
  let { authenticated, url, fileName, label, fetchAsBlob = false, prepareFile, pendingMessage = '', successMessage = '', fallbackMessage = '', onNotify = () => {} }: Props = $props();
  let controller: AbortController | null = null;
  let preparing = $state(false);
  onDestroy(() => controller?.abort());
  let checking = $state(false), error = $state(''), browserAuthenticated = $state(false);
  const sessionAuthenticated = $derived(authenticated || browserAuthenticated);
  function requestLogin(returnFocusTo: HTMLElement) { window.dispatchEvent(new CustomEvent('quangtu:login-required', { detail: { reason: 'download', returnFocusTo } })); }
  async function download(returnFocusTo: HTMLElement) {
    if (checking) return;
    const request = new AbortController();
    controller = request;
    const prepare = prepareFile;
    checking = true; error = '';
    try {
      const browserSession = await getBrowserSession();
      browserAuthenticated = browserSession.authenticated;
      if (!browserSession.authenticated || !browserSession.csrfToken) { requestLogin(returnFocusTo); return; }
      const init: RequestInit = { method:'POST', headers:{ 'content-type':'application/json', 'x-csrf-token': browserSession.csrfToken }, body:'{}' };
      const native = await fetchNativeJsonMutation('/api/downloads/access', init);
      const response = native ?? await fetchWithSessionRefresh('/api/downloads/access', init);
      if (native && response.status === 401) await refreshBrowserSession().catch(() => undefined);
      if (!response.ok) throw new Error('Phiên đăng nhập không còn hiệu lực.');
      throwIfAborted(request.signal);
      if (!url && !prepare) throw new Error('Tệp tải xuống chưa sẵn sàng.');
      const feedbackStartedAt = pendingMessage ? performance.now() : 0;
      if (pendingMessage) onNotify(pendingMessage);
      let downloadUrl = url;
      let revokeUrl = false;
      if (prepare) {
        preparing = true;
        const file = await prepare(request.signal);
        throwIfAborted(request.signal);
        downloadUrl = URL.createObjectURL(file);
        revokeUrl = true;
      } else if (fetchAsBlob) {
        try {
          const fileResponse = await fetch(url);
          if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
          downloadUrl = URL.createObjectURL(await fileResponse.blob());
          revokeUrl = true;
        } catch {
          window.open(url, '_blank', 'noopener');
          if (fallbackMessage) onNotify(fallbackMessage);
          return;
        }
      }
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (revokeUrl) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 10_000);
      const remainingFeedbackTime = feedbackStartedAt ? 220 - (performance.now() - feedbackStartedAt) : 0;
      if (remainingFeedbackTime > 0) await new Promise((resolve) => window.setTimeout(resolve, remainingFeedbackTime));
      if (successMessage) onNotify(successMessage);
    } catch (cause) { if (!request.signal.aborted) { error = cause instanceof Error ? cause.message : 'Không thể tải xuống.'; onNotify(`❌ ${error}`); } }
    finally { checking = false; preparing = false; controller = null; }
  }
  onMount(() => { void getBrowserSession().then((browserSession) => browserAuthenticated = browserSession.authenticated).catch(() => {}); });
</script>

<button class:locked={!sessionAuthenticated} class="download-gate" type="button" aria-label={preparing ? 'Đang đóng gói EPUB...' : checking ? 'Đang kiểm tra...' : label} aria-busy={checking} onclick={(event) => void download(event.currentTarget)} disabled={checking}>
  <span class="download-icon" aria-hidden="true">⬇️</span>
  <span class="download-label">{preparing ? 'Đang đóng gói...' : checking ? 'Đang kiểm tra...' : label}</span>
</button>
{#if error}<span class="download-error" role="alert">{error}</span>{/if}

<style>
  .download-gate{position:relative;display:flex;min-height:38px;align-items:center;justify-content:center;gap:4px;padding:0 12px;border:1px solid var(--border);border-radius:19px;background:var(--card);color:var(--text2);cursor:pointer;font:14px var(--font-app)}.download-icon{font-size:13px;line-height:1}.download-label{font-size:var(--font-size-label);font-weight:600;line-height:1}.download-gate.locked::after{position:absolute;top:-5px;right:-5px;display:grid;width:17px;height:17px;place-items:center;border-radius:50%;background:var(--card);box-shadow:0 1px 4px rgba(0,0,0,.18);content:'🔒';font-size:9px;pointer-events:none}.download-error{color:var(--red);font-size:var(--font-size-meta)}
</style>
