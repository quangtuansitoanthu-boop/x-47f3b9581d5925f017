/**
 * Loads pdfjs-dist after filling in the platform APIs it assumes.
 *
 * The modern PDF.js build also assumes Map.getOrInsertComputed (absent on
 * iOS 18.7), Promise.try, typed-array base64 APIs, etc. Patching two APIs on
 * window is insufficient, especially in the separate
 * worker realm. Use the bundled legacy engine with its matching legacy worker;
 * both contain PDF.js's own compatibility support (same dependency/version).
 */
interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function installPromiseWithResolvers(): void {
  const target = Promise as unknown as { withResolvers?: unknown };
  if (typeof target.withResolvers === 'function') return;
  target.withResolvers = function withResolvers<T>(this: PromiseConstructor): PromiseWithResolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new this<T>((resolveFn, rejectFn) => {
      resolve = resolveFn;
      reject = rejectFn;
    });
    return { promise, resolve, reject };
  };
}

function installUrlParse(): void {
  const target = URL as unknown as { parse?: unknown };
  if (typeof target.parse === 'function') return;
  // Returns null instead of throwing, matching the specified behaviour.
  target.parse = function parse(url: string | URL, base?: string | URL): URL | null {
    try {
      return base === undefined ? new URL(url) : new URL(url, base);
    } catch {
      return null;
    }
  };
}

export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  installPromiseWithResolvers();
  installUrlParse();
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

// Keep the rendering engine alive across reader closes. Each document still
// destroys its own transport/pages; reopening a saved PDF needs no worker fetch.
let sharedWorker: import('pdfjs-dist').PDFWorker | undefined;
export function getPdfjsWorker(pdfjs: typeof import('pdfjs-dist')): import('pdfjs-dist').PDFWorker {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
  return sharedWorker;
}
