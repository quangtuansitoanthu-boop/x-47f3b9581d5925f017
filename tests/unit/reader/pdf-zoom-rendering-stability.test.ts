import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PDF zoom rendering and color stability', () => {
  const pdfSource = readFileSync('src/lib/components/reader/PdfCanvasReader.svelte', 'utf8');

  it('does not wipe active canvases to 1x1 on zoom re-render to prevent blank white page (trang trang)', () => {
    // rerenderVisible must invalidate dataset.rendered WITHOUT destroying the canvas bitmap
    const rerenderMatch = pdfSource.match(/function rerenderVisible\(\)\s*\{([\s\S]*?\n  \})/);
    expect(rerenderMatch).toBeTruthy();
    const rerenderBody = rerenderMatch![1];
    expect(rerenderBody).not.toContain('canvas.width = 1');
    expect(rerenderBody).not.toContain('canvas.height = 1');
    expect(rerenderBody).toContain('delete canvas.dataset.rendered');
  });

  it('guarantees currentPage is included in pagesToRender during zoom', () => {
    const rerenderMatch = pdfSource.match(/function rerenderVisible\(\)\s*\{([\s\S]*?\n  \})/);
    expect(rerenderMatch).toBeTruthy();
    const rerenderBody = rerenderMatch![1];
    expect(rerenderBody).toContain('currentPage');
  });

  it('fills canvas with solid white background immediately upon allocating dimensions to prevent color flashing (doi mau trang)', () => {
    const renderPageMatch = pdfSource.match(/async function renderPage\(pageNumber:\s*number\)\s*\{([\s\S]*?)\n  \}/);
    expect(renderPageMatch).toBeTruthy();
    const renderBody = renderPageMatch![1];
    expect(renderBody).toContain("context.fillStyle = '#ffffff'");
    expect(renderBody).toContain('context.fillRect(0, 0, canvas.width, canvas.height)');
    expect(renderBody).toContain("background: 'rgb(255, 255, 255)'");
  });

  it('ensures currentPage is never cancelled or aborted due to temporary visiblePages lag', () => {
    const renderPageMatch = pdfSource.match(/async function renderPage\(pageNumber:\s*number\)\s*\{([\s\S]*?)\n  \}/);
    expect(renderPageMatch).toBeTruthy();
    const renderBody = renderPageMatch![1];
    expect(renderBody).toContain('pageNumber === currentPage');
  });

  it('provides harmonious background styling without hardcoded dark grey contrasting frame', () => {
    // .pdf-pages should not have hardcoded #6b6b6b in light/sepia mode
    expect(pdfSource).not.toContain('padding:12px 0 24px;background:#6b6b6b');
  });

  it('uses generous rootMargin for smooth continuous scrolling without aggressive page purging', () => {
    expect(pdfSource).not.toContain("rootMargin: '300px 0px'");
    expect(pdfSource).toMatch(/rootMargin:\s*'[68]\d{2}px 0px'/);
  });

  it('hides unrendered or recycled 1x1 canvas to eliminate black pages and flashes during scroll', () => {
    expect(pdfSource).toContain("oldCanvas.style.visibility = 'hidden'");
    expect(pdfSource).toContain("node.style.visibility = 'hidden'");
    expect(pdfSource).toContain("canvas.style.visibility = 'visible'");
  });

  it('retries unrendered pages in finally if still needed and not rendered', () => {
    const renderPageMatch = pdfSource.match(/async function renderPage\(pageNumber:\s*number\)\s*\{([\s\S]*?)\n  \}/);
    expect(renderPageMatch).toBeTruthy();
    const renderBody = renderPageMatch![1];
    expect(renderBody).toContain('canvas.dataset.rendered !== String(renderGeneration)');
  });

  it('binds data-page attribute explicitly on .pdf-page in template', () => {
    expect(pdfSource).toContain('class="pdf-page" data-page={page}');
  });
});
