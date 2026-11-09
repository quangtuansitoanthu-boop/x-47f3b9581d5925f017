<script lang="ts">
  import { ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileText } from '@lucide/svelte';
  import { loadPdfjs } from '$lib/browser/pdfjs-loader';
  import { onMount } from 'svelte';

  interface Props {
    url: string;
    title?: string;
  }

  let { url, title = 'Tài liệu PDF' }: Props = $props();
  let host = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let previewStatus = $state<'empty' | 'loading' | 'ready' | 'error'>('empty');
  let message = $state('');
  let pageCount = $state(0);
  let currentPage = $state(1);
  let pageBusy = $state(false);
  let showPage: (pageNumber: number) => void = () => {};

  const fileName = $derived.by(() => {
    const raw = url.split('?')[0]?.split('/').pop() || title;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  });

  const handlePreviewKeydown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      showPage(currentPage - 1);
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      showPage(currentPage + 1);
    }
  };

  onMount(() => {
    const source = url.trim();
    if (!source) {
      previewStatus = 'empty';
      return;
    }

    let disposed = false;
    let loadingTask: { promise: Promise<any>; destroy?: () => Promise<void> | void } | null = null;
    let document: { numPages: number; getPage: (page: number) => Promise<any>; destroy?: () => Promise<void> | void } | null = null;
    let page: any = null;
    let renderTask: { promise: Promise<unknown>; cancel: () => void } | null = null;
    let renderFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let pageRequest = 0;

    const cancelRender = async () => {
      const activeTask = renderTask;
      if (!activeTask) return;
      activeTask.cancel();
      try {
        await activeTask.promise;
      } catch (cause) {
        if (!(cause instanceof Error) || cause.name !== 'RenderingCancelledException') throw cause;
      } finally {
        if (renderTask === activeTask) renderTask = null;
      }
    };

    const render = async () => {
      if (disposed || !host || !canvas || !page) return;
      await cancelRender();
      if (disposed || !host || !canvas || !page) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, host.clientWidth - 48);
      const scale = Math.min(1.5, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas không khả dụng.');

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const nextRenderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      renderTask = nextRenderTask;
      try {
        await nextRenderTask.promise;
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'RenderingCancelledException') return;
        throw cause;
      }
      if (!disposed) previewStatus = 'ready';
    };

    const showError = (cause: unknown) => {
      if (disposed) return;
      pageBusy = false;
      previewStatus = 'error';
      message = cause instanceof Error ? cause.message : 'Không thể tải bản xem trước PDF.';
    };

    const scheduleRender = () => {
      cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(() => void render().catch(showError));
    };

    const loadPage = async (requestedPage: number) => {
      if (!document || !pageCount) return;
      const targetPage = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
      const request = ++pageRequest;
      pageBusy = true;
      const nextPage = await document.getPage(targetPage);
      if (disposed || request !== pageRequest) return;
      page = nextPage;
      currentPage = targetPage;
      await render();
      if (disposed || request !== pageRequest) return;
      pageBusy = false;
      host?.scrollTo({ top: 0, left: 0 });
    };

    showPage = (requestedPage: number) => {
      void loadPage(requestedPage).catch(showError);
    };

    const load = async () => {
      try {
        previewStatus = 'loading';
        const pdfjs = await loadPdfjs();
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        loadingTask = pdfjs.getDocument({
          url: source,
          cMapUrl: '/vendor/pdfjs/cmaps/',
          cMapPacked: true,
          disableRange: false,
          disableStream: false,
          withCredentials: false,
        }) as unknown as typeof loadingTask;
        document = await loadingTask!.promise;
        if (disposed || !document) return;
        pageCount = document.numPages;
        resizeObserver = new ResizeObserver(scheduleRender);
        if (host) resizeObserver.observe(host);
        await loadPage(1);
      } catch (cause) {
        showError(cause);
      }
    };

    void load();
    return () => {
      disposed = true;
      cancelAnimationFrame(renderFrame);
      resizeObserver?.disconnect();
      renderTask?.cancel();
      void document?.destroy?.();
      void loadingTask?.destroy?.();
    };
  });
</script>

<section class="article-admin-pdf-preview" aria-label="Bản xem trước PDF">
  <header>
    <div>
      <FileText aria-hidden="true" size={18} strokeWidth={1.8} />
      <span><strong>Bản xem trước PDF</strong><small>{fileName}</small></span>
    </div>
    {#if url.trim()}
      <div class="article-admin-pdf-actions">
        {#if pageCount}
          <div class="article-admin-pdf-pagination" role="group" aria-label="Điều hướng trang PDF">
            <button type="button" aria-label="Trang trước" title="Trang trước" disabled={currentPage <= 1 || pageBusy} onclick={() => showPage(currentPage - 1)} onkeydown={handlePreviewKeydown}><ChevronLeft aria-hidden="true" size={16} strokeWidth={2} /></button>
            <label>
              <span>Trang</span>
              <input
                type="number"
                min="1"
                max={pageCount}
                value={currentPage}
                aria-label="Đi tới trang PDF"
                disabled={pageBusy}
                onchange={(event) => showPage(Number(event.currentTarget.value))}
              />
              <span>/ {pageCount}</span>
            </label>
            <button type="button" aria-label="Trang sau" title="Trang sau" disabled={currentPage >= pageCount || pageBusy} onclick={() => showPage(currentPage + 1)} onkeydown={handlePreviewKeydown}><ChevronRight aria-hidden="true" size={16} strokeWidth={2} /></button>
          </div>
        {/if}
        <a href={url} target="_blank" rel="noopener noreferrer">Mở PDF <ExternalLink aria-hidden="true" size={13} strokeWidth={2} /></a>
      </div>
    {/if}
  </header>

  <div class="article-admin-pdf-workspace" bind:this={host}>
    {#if previewStatus === 'empty'}
      <div class="article-admin-pdf-state">
        <FileText aria-hidden="true" size={30} strokeWidth={1.5} />
        <strong>Chưa có file PDF để xem trước</strong>
        <p>Tải file lên hoặc dán URL PDF ở cột bên trái.</p>
      </div>
    {:else if previewStatus === 'loading'}
      <div class="article-admin-pdf-state" role="status">
        <i class="article-admin-pdf-spinner" aria-hidden="true"></i>
        <strong>Đang tải bản xem trước PDF…</strong>
      </div>
    {:else if previewStatus === 'error'}
      <div class="article-admin-pdf-state article-admin-pdf-error" role="alert">
        <CircleAlert aria-hidden="true" size={30} strokeWidth={1.7} />
        <strong>Không thể hiển thị bản xem trước</strong>
        <p>{message || 'Kiểm tra lại URL hoặc file PDF.'}</p>
        <a href={url} target="_blank" rel="noopener noreferrer">Mở PDF trong tab mới</a>
      </div>
    {/if}
    <canvas bind:this={canvas} class:visible={previewStatus === 'ready'} aria-label={`Trang ${currentPage} của ${title}`}></canvas>
  </div>
</section>

<style>
  .article-admin-pdf-preview { display:flex; min-height:0; flex:1; flex-direction:column; overflow:hidden; border:1px solid var(--border2); border-radius:10px; background:var(--white); }
  header { display:flex; min-height:48px; flex:none; align-items:center; justify-content:space-between; gap:16px; box-sizing:border-box; padding:8px 12px; border-bottom:1px solid var(--border2); background:var(--bg2); }
  header > div:first-child { display:flex; min-width:0; align-items:center; gap:8px; color:var(--text2); }
  header :global(svg) { flex:none; color:var(--gold); }
  header span { display:flex; min-width:0; flex-direction:column; }
  header strong { font-size:12px; line-height:1.25; }
  header small { overflow:hidden; color:var(--muted); font-size:10px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
  .article-admin-pdf-actions { display:flex; flex:none; align-items:center; gap:10px; color:var(--muted); font-size:10px; }
  .article-admin-pdf-actions a { display:inline-flex; align-items:center; gap:4px; }
  .article-admin-pdf-pagination, .article-admin-pdf-pagination label { display:flex; align-items:center; gap:5px; }
  .article-admin-pdf-pagination label span { display:block; white-space:nowrap; }
  .article-admin-pdf-pagination button { display:grid; width:28px; height:28px; place-items:center; padding:0; border:1px solid var(--border2); border-radius:7px; background:var(--white); color:var(--text2); cursor:pointer; font:700 20px/1 var(--font-app); }
  .article-admin-pdf-pagination button:hover:not(:disabled) { border-color:var(--gold); color:var(--gold-dark, #8c6226); }
  .article-admin-pdf-pagination button:disabled { opacity:.42; cursor:not-allowed; }
  .article-admin-pdf-pagination input { width:42px; height:28px; box-sizing:border-box; padding:0 3px; border:1px solid var(--border2); border-radius:6px; background:var(--white); color:var(--text2); text-align:center; font:700 10px var(--font-app); }
  .article-admin-pdf-pagination input:focus-visible, .article-admin-pdf-pagination button:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
  .article-admin-pdf-actions a, .article-admin-pdf-state a { color:var(--gold-dark, #8c6226); font-weight:700; text-decoration:none; }
  .article-admin-pdf-actions a:hover, .article-admin-pdf-state a:hover { text-decoration:underline; }
  .article-admin-pdf-workspace { position:relative; display:flex; min-height:0; overflow:auto; flex:1; align-items:flex-start; justify-content:center; padding:24px; background:#e8e5df; }
  canvas { display:none; max-width:none; flex:none; background:white; box-shadow:0 5px 22px rgba(40,30,18,.22); }
  canvas.visible { display:block; }
  .article-admin-pdf-state { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:7px; padding:24px; color:var(--muted); text-align:center; }
  .article-admin-pdf-state > :global(svg) { color:var(--gold); }
  .article-admin-pdf-state strong { color:var(--text2); font-size:13px; }
  .article-admin-pdf-state p { max-width:460px; margin:0; font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
  .article-admin-pdf-error strong { color:var(--red); }
  .article-admin-pdf-spinner { width:24px; height:24px; border:3px solid var(--border2); border-top-color:var(--gold); border-radius:50%; animation:article-pdf-spin .8s linear infinite; }
  @keyframes article-pdf-spin { to { transform:rotate(360deg); } }
  @media (max-width:1023px) { .article-admin-pdf-preview { min-height:520px; } header { flex-wrap:wrap; } .article-admin-pdf-actions { width:100%; justify-content:space-between; } }
  @media (prefers-reduced-motion:reduce) { .article-admin-pdf-spinner { animation:none; } }
</style>
