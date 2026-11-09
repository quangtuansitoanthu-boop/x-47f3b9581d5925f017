import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium, webkit, expect, test as it, type Browser } from '@playwright/test';

// Exercise the installed engine AND shipped worker, not a mock of getDocument.
// iOS 18.7 lacks the Map upsert APIs (Safari added them in 26.2).
// Remove them in both realms; window-only shims do not reach a real worker.
for (const [name, browserType] of Object.entries({ chromium, webkit })) {
  it(`opens an online PDF with iOS 18.7 API support in ${name}`, async () => {
    const loader = readFileSync('src/lib/browser/pdfjs-loader.ts', 'utf8');
    const modulePath = loader.match(/return import\('([^']+)'\)/)?.[1];
    expect(modulePath).toBeTruthy();
    const engine = readFileSync(modulePath === 'pdfjs-dist'
      ? 'node_modules/pdfjs-dist/build/pdf.mjs' : `node_modules/${modulePath}`, 'utf8');
    const worker = readFileSync('static/vendor/pdfjs/pdf.worker.min.mjs');
    const missingApis = `
      Map.prototype.getOrInsert = undefined;
      Map.prototype.getOrInsertComputed = undefined;
      Math.sumPrecise = undefined;
    `;
    const requests: string[] = [];
    const server = createServer((req, res) => {
      const path = req.url ?? '/';
      if (path === '/sample.pdf') {
        requests.push(path);
        res.setHeader('Content-Type', 'application/pdf');
        res.end(readFileSync('tests/e2e/fixtures/image-only.pdf'));
      } else if (path === '/engine.mjs' || path === '/worker.mjs' || path === '/actual-worker.mjs') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(path === '/engine.mjs' ? engine : path === '/actual-worker.mjs' ? worker
          : `${missingApis}\nawait import('/actual-worker.mjs');`);
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html><body></body></html>');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    let browser: Browser | undefined;
    try {
      browser = await browserType.launch({ headless: true });
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = await page.evaluate(async (setup) => {
        (0, eval)(setup);
        const pdfjs = await new Function('return import("/engine.mjs")')();
        pdfjs.GlobalWorkerOptions.workerSrc = '/worker.mjs';
        const task = pdfjs.getDocument({ url: '/sample.pdf' });
        try {
          return await Promise.race([
            (async () => {
              const document = await task.promise;
              const page = await document.getPage(1);
              const viewport = page.getViewport({ scale: 1 });
              const canvas = window.document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              return { pages: document.numPages, width: canvas.width };
            })(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF render timed out')), 5000)),
          ]);
        } finally { void task.destroy().catch(() => {}); }
      }, missingApis);
      expect(result.pages).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(requests).toEqual(['/sample.pdf']);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
