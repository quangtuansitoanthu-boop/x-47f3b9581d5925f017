// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { createEpubWithImages } from '../../../src/lib/components/reader/epub-images';

afterEach(() => vi.unstubAllGlobals());

it('exports an illustrated EPUB without newer AbortSignal static APIs', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('AbortSignal', class LegacyAbortSignal {});
  const signal = new AbortController().signal;
  Object.defineProperty(signal, 'throwIfAborted', { value: undefined });
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8, height: 8, close })));
  const fetcher = vi.fn(async () => new Response('image', { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetcher);
  const file = await createEpubWithImages('Book', 'Author', '<p>Before</p><img src="https://example.test/image.png"><p>After</p>', [], signal);
  expect(file.size).toBeGreaterThan(0);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('does not fetch an image after legacy signal cancellation', async () => {
  vi.stubGlobal('AbortSignal', class LegacyAbortSignal {});
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
  Object.defineProperty(controller.signal, 'reason', { value: undefined });
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(createEpubWithImages('Book', 'Author', '<img src="https://example.test/image.png">', [], controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});
