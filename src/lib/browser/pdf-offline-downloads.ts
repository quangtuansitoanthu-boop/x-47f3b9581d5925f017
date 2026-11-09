import {
  OFFLINE_PDF_RECORD_VERSION,
  getOfflinePdf,
  normalizePdfPrincipal,
  offlinePdfRecordKey,
  putOfflinePdf,
  removeOfflinePdf,
  sha256Blob,
  type OfflinePdfRecord,
} from './offline-pdf-database';
import { isOnlineOnlyBook } from '$lib/domain/online-only-policy';
import { isContentAvailable } from './ios-content-policy';
import { resolveApiUrl } from './native-api';

export const OFFLINE_PDF_MAX_BYTES = 80 * 1024 * 1024;
export const OFFLINE_PDF_SAFE_QUOTA_RATIO = 0.9;

export interface OfflinePdfDownloadInput {
  principalId?: string | null;
  documentId: string;
  title: string;
  sourceUrl: string;
}

export interface OfflinePdfDownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number | null;
  percent: number | null;
}

export interface OfflinePdfDownloadOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  estimateStorage?: () => Promise<StorageEstimate>;
  onProgress?: (progress: OfflinePdfDownloadProgress) => void;
  persistRecord?: (record: OfflinePdfRecord) => Promise<void>;
  checksumBlob?: (blob: Blob) => Promise<string>;
}

export interface OfflinePdfQuota {
  availableSafeBytes: number | null;
  hardLimitBytes: number;
  quotaBytes: number | null;
  usageBytes: number;
}

const activeDownloads = new Map<string, Promise<OfflinePdfRecord>>();

function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

export function calculateOfflinePdfQuota(estimate: StorageEstimate | undefined): OfflinePdfQuota {
  const usageBytes = Math.max(0, Math.floor(Number(estimate?.usage) || 0));
  const quota = Number(estimate?.quota);
  if (!Number.isFinite(quota) || quota <= 0) {
    return { availableSafeBytes: null, hardLimitBytes: OFFLINE_PDF_MAX_BYTES, quotaBytes: null, usageBytes };
  }
  const quotaBytes = Math.max(0, Math.floor(quota));
  const availableSafeBytes = Math.max(0, Math.floor((quotaBytes - usageBytes) * OFFLINE_PDF_SAFE_QUOTA_RATIO));
  return {
    availableSafeBytes,
    hardLimitBytes: Math.min(OFFLINE_PDF_MAX_BYTES, availableSafeBytes),
    quotaBytes,
    usageBytes,
  };
}

async function estimateQuota(options: OfflinePdfDownloadOptions): Promise<OfflinePdfQuota> {
  const estimateStorage = options.estimateStorage ?? (() => typeof navigator === 'undefined'
    ? Promise.resolve({})
    : navigator.storage?.estimate?.() ?? Promise.resolve({}));
  return calculateOfflinePdfQuota(await estimateStorage().catch(() => ({})));
}

function sourceVersion(response: Response, sizeBytes: number): string {
  const etag = response.headers.get('etag')?.trim();
  if (etag) return `etag:${etag}`;
  const modified = response.headers.get('last-modified')?.trim();
  if (modified) return `modified:${modified};size:${sizeBytes}`;
  return `size:${sizeBytes}`;
}

function declaredResponseSize(response: Response): number | null {
  const contentRange = response.headers.get('content-range');
  if (contentRange) {
    const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(contentRange);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
  }
  const value = Number(response.headers.get('content-length'));
  if (Number.isSafeInteger(value) && value > 0) return value;
  return null;
}

export async function probePdfTotalBytes(
  sourceUrl: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<number | null> {
  throwIfAborted(signal);
  const mediaPath = sourceUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
  const targetUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : sourceUrl;
  try {
    const head = await fetcher(targetUrl, { method: 'HEAD', cache: 'no-store', signal });
    throwIfAborted(signal);
    const size = head.ok ? declaredResponseSize(head) : null;
    if (size !== null) return size;
  } catch {
    throwIfAborted(signal);
  }
  throwIfAborted(signal);
  let range: Response | undefined;
  try {
    range = await fetcher(targetUrl, { headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal });
    throwIfAborted(signal);
    const size = range.ok ? declaredResponseSize(range) : null;
    if (size !== null) return size;
  } catch {
    throwIfAborted(signal);
  } finally {
    await range?.body?.cancel().catch(() => undefined);
  }
  return null;
}

function assertPdfSignature(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('offline_pdf_invalid_content');
  }
}

async function readResponseWithinLimit(
  response: Response,
  limitBytes: number,
  signal: AbortSignal | undefined,
  onProgress: OfflinePdfDownloadOptions['onProgress'],
  knownTotal: number | null = null,
): Promise<Uint8Array> {
  const total = declaredResponseSize(response) ?? knownTotal;
  if (total !== null && total > limitBytes) {
    await response.body?.cancel('offline_pdf_too_large').catch(() => undefined);
    throw new Error('offline_pdf_too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    throwIfAborted(signal);
    if (bytes.byteLength > limitBytes) throw new Error('offline_pdf_too_large');
    onProgress?.({ bytesDownloaded: bytes.byteLength, bytesTotal: total, percent: 100 });
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      if (downloaded > limitBytes) {
        await reader.cancel('offline_pdf_too_large').catch(() => undefined);
        throw new Error('offline_pdf_too_large');
      }
      chunks.push(value);
      onProgress?.({
        bytesDownloaded: downloaded,
        bytesTotal: total,
        percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
      });
    }
  } catch (cause) {
    if (signal?.aborted) await reader.cancel(abortError(signal)).catch(() => undefined);
    throw cause;
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function performDownload(
  input: OfflinePdfDownloadInput,
  options: OfflinePdfDownloadOptions,
): Promise<OfflinePdfRecord> {
  throwIfAborted(options.signal);
  const quota = await estimateQuota(options);
  throwIfAborted(options.signal);
  if (quota.hardLimitBytes <= 0) throw new Error('offline_pdf_quota_exceeded');

  const mediaPath = input.sourceUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
  const proxyUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : '';
  const fetchUrl = proxyUrl || input.sourceUrl;

  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(fetchUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    });
    if (!response.ok || response.type === 'opaque') throw new Error(`offline_pdf_fetch_failed:${response.status}`);
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (proxyUrl && fetchUrl !== proxyUrl) {
      response = await fetcher(proxyUrl, {
        cache: 'no-store',
        signal: options.signal,
      });
      if (!response.ok || response.type === 'opaque') throw err;
    } else if (fetchUrl !== input.sourceUrl) {
      response = await fetcher(input.sourceUrl, {
        cache: 'no-store',
        signal: options.signal,
      });
      if (!response.ok || response.type === 'opaque') throw err;
    } else {
      throw err;
    }
  }

  let total = declaredResponseSize(response);
  if (total === null) {
    total = await probePdfTotalBytes(fetchUrl, fetcher, options.signal);
  }
  const bytes = await readResponseWithinLimit(response, quota.hardLimitBytes, options.signal, options.onProgress, total);
  const sourceRespVersion = sourceVersion(response, bytes.byteLength);

  throwIfAborted(options.signal);
  if (bytes.byteLength > quota.hardLimitBytes) throw new Error('offline_pdf_too_large');
  assertPdfSignature(bytes);
  const contentType = 'application/pdf';
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: contentType });
  const checksum = await (options.checksumBlob ?? sha256Blob)(blob);
  throwIfAborted(options.signal);
  const ownerId = normalizePdfPrincipal(input.principalId);
  const now = Date.now();
  const record: OfflinePdfRecord = {
    key: offlinePdfRecordKey(ownerId, input.documentId),
    ownerId,
    documentId: String(input.documentId),
    title: input.title,
    sourceUrl: input.sourceUrl,
    sourceVersion: sourceRespVersion || `v-${blob.size}`,
    checksum,
    blob,
    sizeBytes: blob.size,
    contentType,
    savedAt: now,
    lastAccessedAt: now,
    recordVersion: OFFLINE_PDF_RECORD_VERSION,
    status: 'complete',
  };
  await (options.persistRecord ?? putOfflinePdf)(record);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quangtu:offline-pdf-changed', { detail: { documentId: record.documentId } }));
  }
  options.onProgress?.({ bytesDownloaded: blob.size, bytesTotal: blob.size, percent: 100 });
  return record;
}

export function downloadPdfForOffline(
  input: OfflinePdfDownloadInput,
  options: OfflinePdfDownloadOptions = {},
): Promise<OfflinePdfRecord> {
  // Sách bản quyền (4 cuốn Nguyên Phong) chỉ được đọc trực tuyến.
  if (!isContentAvailable({ id: input.documentId, title: input.title }) || isOnlineOnlyBook(input.title)) {
    return Promise.reject(new Error('Sách này chỉ được đọc trực tuyến, không hỗ trợ tải về.'));
  }
  const key = offlinePdfRecordKey(input.principalId, input.documentId);
  const active = activeDownloads.get(key);
  if (active) return active;
  const task = performDownload(input, options).finally(() => activeDownloads.delete(key));
  activeDownloads.set(key, task);
  return task;
}

export function isOfflinePdfDownloadActive(principalId: string | null, documentId: string): boolean {
  return activeDownloads.has(offlinePdfRecordKey(principalId, documentId));
}

export function offlinePdfNeedsUpdate(
  record: OfflinePdfRecord,
  source: { sourceUrl: string; sourceVersion?: string | null },
): boolean {
  if (record.sourceUrl !== source.sourceUrl) return true;
  if (!source.sourceVersion || !record.sourceVersion) return false;
  const v1 = record.sourceVersion.trim().toLowerCase().replace(/^etag:\s*/, '').replace(/["\s]/g, '');
  const v2 = source.sourceVersion.trim().toLowerCase().replace(/^etag:\s*/, '').replace(/["\s]/g, '');
  const num1 = v1.replace(/^(v-|size:)/, '');
  const num2 = v2.replace(/^(v-|size:)/, '');
  if (num1 && num2 && num1 === num2) return false;
  return v1 !== v2;
}

export async function probeOfflinePdfSourceVersion(
  sourceUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const mediaPath = sourceUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
  const targetUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : sourceUrl;
  const response = await fetcher(targetUrl, {
    method: 'HEAD',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const size = declaredResponseSize(response);
  if (!response.headers.get('etag') && !response.headers.get('last-modified') && size === null) return null;
  return sourceVersion(response, size ?? 0);
}

export async function readPdfOfflineState(
  input: OfflinePdfDownloadInput,
  reader: typeof getOfflinePdf = getOfflinePdf,
): Promise<OfflinePdfRecord | null> {
  return reader(input.principalId, input.documentId);
}

export async function removePdfOfflineCopy(
  input: Pick<OfflinePdfDownloadInput, 'principalId' | 'documentId'>,
  remover: typeof removeOfflinePdf = removeOfflinePdf,
): Promise<void> {
  await remover(input.principalId, input.documentId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quangtu:offline-pdf-changed', { detail: { documentId: input.documentId } }));
  }
}
