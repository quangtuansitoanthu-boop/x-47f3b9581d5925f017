import { describe, expect, it, vi } from 'vitest';

import {
  OFFLINE_PDF_RECORD_VERSION,
  offlinePdfRecordKey,
  resolveOfflinePdfResponse,
  offlinePdfResponseForRecord,
  sha256Blob,
  validateOfflinePdfRecord,
  verifyOfflinePdfRecord,
  type OfflinePdfRecord,
} from '$lib/browser/offline-pdf-database';
import {
  OFFLINE_PDF_MAX_BYTES,
  calculateOfflinePdfQuota,
  downloadPdfForOffline,
  offlinePdfNeedsUpdate,
  probePdfTotalBytes,
  removePdfOfflineCopy,
} from '$lib/browser/pdf-offline-downloads';

function pdfResponse(version = 'v1', headers: Record<string, string> = {}): Response {
  return new Response(new TextEncoder().encode('%PDF-1.7\nexample'), {
    headers: { 'content-type': 'application/pdf', etag: `"${version}"`, ...headers },
  });
}

async function completeRecord(overrides: Partial<OfflinePdfRecord> = {}): Promise<OfflinePdfRecord> {
  const blob = overrides.blob ?? new Blob(['%PDF-1.7\nexample'], { type: 'application/pdf' });
  const ownerId = overrides.ownerId ?? 'user-a';
  const documentId = overrides.documentId ?? 'article-1';
  return {
    key: offlinePdfRecordKey(ownerId, documentId),
    ownerId,
    documentId,
    title: 'PDF',
    sourceUrl: '/file.pdf',
    sourceVersion: 'etag:"v1"',
    checksum: await sha256Blob(blob),
    blob,
    sizeBytes: blob.size,
    contentType: 'application/pdf',
    savedAt: 1,
    lastAccessedAt: 1,
    recordVersion: OFFLINE_PDF_RECORD_VERSION,
    status: 'complete',
    ...overrides,
  };
}

describe('offline PDF storage', () => {
  it('reads the complete PDF size from Content-Range instead of the one-byte probe body', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response('x', { status: 206, headers: { 'content-length': '1', 'content-range': 'bytes 0-0/123456' } }));
    expect(await probePdfTotalBytes('/range.pdf', fetcher)).toBe(123456);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ignores unsuccessful HEAD and range response sizes', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404, headers: { 'content-length': '100' } }))
      .mockResolvedValueOnce(new Response('error', { status: 403, headers: { 'content-length': '5' } }));
    expect(await probePdfTotalBytes('/missing.pdf', fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cancels the unused range response body even when the server ignores Range', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(body, { headers: { 'content-length': '1000' } }));
    expect(await probePdfTotalBytes('/ignored-range.pdf', fetcher)).toBe(1000);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight size probe without starting a fallback Range request', async () => {
    const controller = new AbortController();
    let requested = false;
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      requested = true;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    // The third argument extends the existing API with optional caller cancellation.
    const probe = probePdfTotalBytes as (url: string, fetcher: typeof fetch, signal?: AbortSignal) => Promise<number | null>;
    const pending = probe('/pending.pdf', fetcher, controller.signal);
    expect(requested).toBe(true);
    const result = Promise.race([pending.then(() => 'resolved', error => error.name), new Promise(resolve => setTimeout(() => resolve('still-pending'), 25))]);
    controller.abort();
    expect(await result).toBe('AbortError');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('scopes record keys to a principal and an explicit anonymous namespace', () => {
    expect(offlinePdfRecordKey(null, 'article-1')).toBe('anonymous:article-1');
    expect(offlinePdfRecordKey('user-a', 'article-1')).not.toBe(offlinePdfRecordKey('user-b', 'article-1'));
  });

  it('uses the smaller of 80 MiB and 90% of remaining quota', () => {
    expect(calculateOfflinePdfQuota({ usage: 10, quota: 110 }).hardLimitBytes).toBe(90);
    expect(calculateOfflinePdfQuota({ usage: 0, quota: OFFLINE_PDF_MAX_BYTES * 4 }).hardLimitBytes).toBe(OFFLINE_PDF_MAX_BYTES);
    expect(calculateOfflinePdfQuota(undefined)).toMatchObject({ hardLimitBytes: OFFLINE_PDF_MAX_BYTES, quotaBytes: null });
  });

  it('never persists an oversized or canceled partial response', async () => {
    const persistRecord = vi.fn(async () => undefined);
    await expect(downloadPdfForOffline({ documentId: 'large', title: 'Large', sourceUrl: '/large.pdf' }, {
      estimateStorage: async () => ({ usage: 0, quota: 100 }),
      fetcher: vi.fn(async () => pdfResponse('large', { 'content-length': '91' })),
      checksumBlob: async () => 'a'.repeat(64),
      persistRecord,
    })).rejects.toThrow('offline_pdf_too_large');

    const abort = new AbortController();
    await expect(downloadPdfForOffline({ documentId: 'cancel', title: 'Cancel', sourceUrl: '/cancel.pdf' }, {
      signal: abort.signal,
      estimateStorage: async () => ({}),
      fetcher: vi.fn(async () => pdfResponse()),
      checksumBlob: async () => 'a'.repeat(64),
      onProgress: () => abort.abort(),
      persistRecord,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('publishes one complete checksummed record only after the full stream succeeds', async () => {
    const persistRecord = vi.fn(async () => undefined);
    const progress = vi.fn();
    const record = await downloadPdfForOffline({
      principalId: 'user-a', documentId: 'article-1', title: 'PDF', sourceUrl: '/file.pdf',
    }, {
      estimateStorage: async () => ({ usage: 0, quota: OFFLINE_PDF_MAX_BYTES * 2 }),
      fetcher: vi.fn(async () => pdfResponse('v2')),
      checksumBlob: async () => 'b'.repeat(64),
      persistRecord,
      onProgress: progress,
    });

    expect(record).toMatchObject({
      key: 'user-a:article-1', sourceVersion: 'etag:"v2"', status: 'complete', checksum: 'b'.repeat(64),
    });
    expect(persistRecord).toHaveBeenCalledOnce();
    expect(persistRecord).toHaveBeenCalledWith(record);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ percent: 100 }));
  });

  it('rejects incomplete/corrupt records and treats browser eviction as unavailable', async () => {
    const record = await completeRecord();
    expect(validateOfflinePdfRecord({ ...record, status: 'partial' })).toBe('incomplete');
    expect(validateOfflinePdfRecord({ ...record, sizeBytes: record.sizeBytes + 1 })).toBe('size-mismatch');
    expect(await verifyOfflinePdfRecord({ ...record, checksum: '0'.repeat(64) })).toBe(false);
    expect(offlinePdfResponseForRecord(null).status).toBe(404);
    expect(offlinePdfResponseForRecord({ ...record, sizeBytes: record.sizeBytes + 1 }).status).toBe(404);
  });

  it('denies a resolver key owned by another principal while serving the active owner', async () => {
    const record = await completeRecord({ ownerId: 'user-a' });
    const reader = vi.fn(async () => record);

    const denied = await resolveOfflinePdfResponse(record.key, 'user-b', reader);
    expect(denied.status).toBe(404);
    expect(reader).not.toHaveBeenCalled();

    const allowed = await resolveOfflinePdfResponse(record.key, 'user-a', reader);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain('%PDF-1.7');
  });

  it('detects source updates and delegates idempotent removal to the scoped key', async () => {
    const record = await completeRecord();
    expect(offlinePdfNeedsUpdate(record, { sourceUrl: '/new.pdf' })).toBe(true);
    expect(offlinePdfNeedsUpdate(record, { sourceUrl: '/file.pdf', sourceVersion: 'etag:"v2"' })).toBe(true);
    expect(offlinePdfNeedsUpdate(record, { sourceUrl: '/file.pdf', sourceVersion: 'etag:"v1"' })).toBe(false);
    const remove = vi.fn(async () => undefined);
    await removePdfOfflineCopy({ principalId: 'user-a', documentId: 'article-1' }, remove);
    expect(remove).toHaveBeenCalledWith('user-a', 'article-1');
  });
});
