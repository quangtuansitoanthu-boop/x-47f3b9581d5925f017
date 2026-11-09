import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHomepageWithOfflinePdfs } from '$lib/browser/offline-pdf-library';
import { OFFLINE_PDF_RECORD_VERSION, offlinePdfRecordKey, type OfflinePdfRecord } from '$lib/browser/offline-pdf-database';

const fallbackMocks = vi.hoisted(() => ({ native: vi.fn(() => false), bundled: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: fallbackMocks.native }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: fallbackMocks.bundled }));
beforeEach(() => {
  fallbackMocks.native.mockReturnValue(false);
  fallbackMocks.bundled.mockReset();
});

function download(ownerId: string, documentId = 'saved-pdf'): OfflinePdfRecord {
  const blob = new Blob(['%PDF-1.7\nlocal'], { type: 'application/pdf' });
  return {
    key: offlinePdfRecordKey(ownerId, documentId), ownerId, documentId,
    title: 'A saved PDF', sourceUrl: '/assets/saved.pdf', sourceVersion: 'etag:v1',
    checksum: 'a'.repeat(64), blob, sizeBytes: blob.size, contentType: 'application/pdf',
    savedAt: 1, lastAccessedAt: 1, recordVersion: OFFLINE_PDF_RECORD_VERSION, status: 'complete',
  };
}

describe('homepage offline PDF fallback', () => {
  it.each([429, 500, 503])('keeps the native public bundled library available during HTTP %s without restoring downloaded records', async status => {
    fallbackMocks.native.mockReturnValue(true);
    fallbackMocks.bundled.mockImplementation(async () => Response.json([
      { id: 'bundled', tieu_de: 'Sách trên thiết bị', danh_muc: 'SÁCH KHUYẾN THIỆN', trang_thai: 'Hoàn thành' },
      { id: 'draft', tieu_de: 'Bản nháp', danh_muc: 'SÁCH KHUYẾN THIỆN', trang_thai: 'Bản nháp' },
    ]));
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status }));
    const readDownloads = vi.fn(async () => [download('reader-a')]);
    const result = await fetchHomepageWithOfflinePdfs(fetcher, 'admin', 'reader-a', undefined, readDownloads);
    expect(result.offline).toBe(true);
    expect(result.articles.map(article => article.id)).toEqual(['bundled']);
    expect(readDownloads).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['html', 'invalid-json', 'body-timeout'])('recovers the native bundled catalog after %s', async failure => {
    fallbackMocks.native.mockReturnValue(true);
    fallbackMocks.bundled.mockImplementation(async () => Response.json([
      { id: 'bundled', tieu_de: 'Sách trên thiết bị', trang_thai: 'Hoàn thành' },
    ]));
    const fetcher: typeof fetch = async input => {
      if (!String(input).includes('/api/articles')) return Response.json([]);
      if (failure === 'body-timeout') return new Response(new ReadableStream({ start(controller) {
        controller.error(new DOMException('Body timed out', 'TimeoutError'));
      } }));
      return new Response(failure === 'html' ? '<html>unavailable</html>' : '{', {
        headers: { 'content-type': failure === 'html' ? 'text/html' : 'application/json' },
      });
    };
    const result = await fetchHomepageWithOfflinePdfs(fetcher, 'guest', null);
    expect(result).toMatchObject({ offline: true, articles: [{ id: 'bundled' }] });
  });

  it.each([401, 403])('preserves native authorization failures HTTP %s', async status => {
    fallbackMocks.native.mockReturnValue(true);
    await expect(fetchHomepageWithOfflinePdfs(async () => new Response('', { status }), 'guest', null)).rejects.toThrow();
    expect(fallbackMocks.bundled).not.toHaveBeenCalled();
  });

  it('retains the real network catalog without consulting downloads when online', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => Response.json(String(url).startsWith('/api/articles')
      ? [{ id: 'online', tieu_de: 'Online article', noi_dung: '<p>Real catalog</p>', trang_thai: 'Hoàn thành' }]
      : []));
    const readDownloads = vi.fn(async () => [download('anonymous')]);
    const result = await fetchHomepageWithOfflinePdfs(fetcher, 'guest', null, undefined, readDownloads);
    expect(result.offline).toBe(false);
    expect(result.articles).toEqual([expect.objectContaining({ id: 'online', title: 'Online article' })]);
    expect(readDownloads).not.toHaveBeenCalled();
  });

  it.each([403, 404, 500])('never restores downloaded content over an HTTP %s response', async (status) => {
    const readDownloads = vi.fn(async () => [download('anonymous')]);
    await expect(fetchHomepageWithOfflinePdfs(async () => new Response('', { status }), 'guest', null, undefined, readDownloads))
      .rejects.toThrow('Không thể tải bài viết');
    expect(readDownloads).not.toHaveBeenCalled();
  });

  it.each(['not json', '{}', '[null]'])('does not treat malformed catalog %s as offline', async (body) => {
    const readDownloads = vi.fn(async () => [download('anonymous')]);
    await expect(fetchHomepageWithOfflinePdfs(async () => new Response(body), 'guest', null, undefined, readDownloads))
      .rejects.toThrow();
    expect(readDownloads).not.toHaveBeenCalled();
  });

  it.each([null, 'reader-a'])('restores only the current principal %s after a network failure', async (principalId) => {
    const ownerId = principalId ?? 'anonymous';
    const record = download(ownerId);
    const readDownloads = vi.fn(async () => [
      record, download(principalId ? 'anonymous' : 'reader-a', 'foreign'),
      { ...download(ownerId, 'wrong-key'), key: 'reader-b:wrong-key' },
    ]);
    const result = await fetchHomepageWithOfflinePdfs(async () => { throw new TypeError('Failed to fetch'); },
      principalId ? 'member' : 'guest', principalId, undefined, readDownloads);
    expect(readDownloads).toHaveBeenCalledExactlyOnceWith(ownerId);
    expect(result).toEqual({ offline: true, articles: [expect.objectContaining({
      id: record.documentId, title: record.title, pdfUrl: record.sourceUrl, content: '',
    })] });
  });

  it('does not read storage when the request was aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const readDownloads = vi.fn(async () => [download('anonymous')]);
    const failure = new TypeError('Canceled network request');
    await expect(fetchHomepageWithOfflinePdfs(async () => { throw failure; }, 'guest', null, controller.signal, readDownloads))
      .rejects.toBe(failure);
    expect(readDownloads).not.toHaveBeenCalled();
  });

  it('discards restored metadata when cancellation happens during storage access', async () => {
    const controller = new AbortController();
    const readDownloads = vi.fn(async () => { controller.abort(); return [download('anonymous')]; });
    await expect(fetchHomepageWithOfflinePdfs(async () => { throw new TypeError('Failed to fetch'); },
      'guest', null, controller.signal, readDownloads)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each(['empty', 'unavailable'])('preserves the network error when downloads are %s', async (state) => {
    const failure = new TypeError('Failed to fetch');
    const readDownloads = vi.fn(async () => { if (state === 'unavailable') throw new Error('Storage denied'); return []; });
    await expect(fetchHomepageWithOfflinePdfs(async () => { throw failure; }, 'guest', null, undefined, readDownloads))
      .rejects.toBe(failure);
  });
});
