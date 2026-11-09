import type { CloudflareRequestContext } from '../cloudflare-context';
import { sha256, toBase64Url, fromBase64Url } from '../crypto';
import { ServerInputError } from '../errors';
import { createMediaRepository, type MediaOperationRow } from '../repositories/media-repository';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const FAILED_UPLOAD_GRACE_MS = 15 * 60 * 1000;
const CLEANUP_BATCH_LIMIT = 50;

const PREFIX_MIME: Record<string, RegExp> = {
  covers: /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/u,
  content: /^(audio\/mpeg|audio\/mp4|image\/jpeg|image\/png|image\/webp)$/u,
  pdfs: /^application\/pdf$/u,
};

export function createMediaService(context: CloudflareRequestContext) {
  const repository = createMediaRepository(context.env);

  async function tombstoneMediaInternal(
    rawObjectKey: string,
    idempotencyKey: string | null,
    requireRole: boolean,
    liveReferences: string[] | null = null,
  ) {
    if (requireRole) ensureMediaRole(context, 'delete');
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new ServerInputError(400, 'idempotency_required', 'Cần Idempotency-Key hợp lệ.');
    }
    const normalizedKey = decodeURIComponent(rawObjectKey);
    if (!/^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(normalizedKey) || normalizedKey.includes('..')) {
      throw new ServerInputError(400, 'invalid_object_key', 'Khóa media không hợp lệ.');
    }
    const operationId = await sha256(`delete:${normalizedKey}:${idempotencyKey}`);
    const existing = await repository.findOperation(operationId);
    if (existing) return mediaOperationResponse(existing, context.env.MEDIA_PUBLIC_BASE_URL);
    const media = await repository.getLiveObjectRecord(normalizedKey);
    if (!media) throw new ServerInputError(404, 'media_not_found', 'Media không tồn tại.');
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();
    if (liveReferences) {
      const tombstoned = await repository.tombstoneObjectIfUnreferenced(
        operationId, normalizedKey, media.sha256, media.byte_size, nowIso, purgeAfter, liveReferences,
      );
      if (!tombstoned) {
        return { id: operationId, objectKey: normalizedKey, status: 'retained', purgeAfter: null };
      }
    } else {
      await repository.tombstoneObject(
        operationId,
        normalizedKey,
        media.sha256,
        media.byte_size,
        nowIso,
        purgeAfter,
      );
    }
    return {
      id: operationId,
      objectKey: normalizedKey,
      status: 'tombstoned',
      purgeAfter,
    };
  }

  return {
    async uploadMedia(args: {
      userId: string;
      idempotencyKey: string | null;
      prefix: string;
      contentType: string;
      contentLength: number;
      fileName: string;
      expectedSha256?: string | null;
      body: ReadableStream<Uint8Array> | null;
      deriveDigest?: boolean;
    }) {
      ensureMediaRole(context, 'upload');
      const { idempotencyKey } = args;
      if (!idempotencyKey || idempotencyKey.length > 128) {
        throw new ServerInputError(400, 'idempotency_required', 'Cần Idempotency-Key hợp lệ.');
      }
      const operationId = await sha256(`put:${args.userId}:${idempotencyKey}`);
      const existing = await repository.findOperation(operationId);
      if (existing) return mediaOperationResponse(existing, context.env.MEDIA_PUBLIC_BASE_URL);

      if (!Number.isSafeInteger(args.contentLength) || args.contentLength < 1 || args.contentLength > MAX_UPLOAD_BYTES) {
        throw new ServerInputError(413, 'invalid_upload_size', 'Tệp phải có kích thước từ 1 byte đến 50 MB.');
      }
      const contentType = args.contentType.toLowerCase().split(';')[0];
      if (!PREFIX_MIME[args.prefix]?.test(contentType)) {
        throw new ServerInputError(415, 'invalid_media_type', 'Loại tệp không được phép cho thư mục này.');
      }
      if (!args.deriveDigest && (!args.expectedSha256 || !/^[A-Za-z0-9_-]{43}$/u.test(args.expectedSha256))) {
        throw new ServerInputError(400, 'digest_required', 'Cần X-Content-SHA256 dạng base64url.');
      }
      if (!args.body) throw new ServerInputError(400, 'file_required', 'Cần nội dung tệp.');

      const originalName = safeFileName(decodeFileNameHeader(args.fileName || 'upload'));
      const objectKey = `${args.prefix}/${crypto.randomUUID()}-${originalName}`;
      const now = new Date().toISOString();
      await repository.insertPendingPut(operationId, objectKey, args.expectedSha256 ?? null, args.contentLength, now);

      let objectStored = false;
      try {
        if (await repository.headObject(objectKey)) {
          throw new ServerInputError(409, 'media_collision', 'Khóa media đã tồn tại.');
        }
        const boundedBody = enforceUploadBounds(args.body, args.contentLength);
        const [uploadSource, verificationBody] = boundedBody.tee();
        const fixedLengthUpload = createFixedLengthUpload(uploadSource, args.contentLength);
        const verification = digestBody(verificationBody);
        const putOptions = {
          httpMetadata: {
            contentType,
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: {
            operationId,
            ...(args.expectedSha256 ? { sha256: args.expectedSha256 } : {}),
          },
          ...(args.expectedSha256 ? { sha256: fromBase64Url(args.expectedSha256) } : {}),
        };
        const upload = repository.putObject(objectKey, fixedLengthUpload.body, putOptions);
        const [uploadResult, verificationResult, pipingResult] = await Promise.allSettled([
          upload,
          verification,
          fixedLengthUpload.completion,
        ]);
        objectStored = uploadResult.status === 'fulfilled' && Boolean(uploadResult.value);
        if (verificationResult.status === 'rejected') throw verificationResult.reason;
        if (pipingResult.status === 'rejected') throw pipingResult.reason;
        const actual = verificationResult.value;
        if (actual.byteSize !== args.contentLength) {
          throw new ServerInputError(400, 'upload_size_mismatch', 'Kích thước tệp không khớp nội dung tải lên.');
        }
        if (args.expectedSha256 && actual.sha256 !== args.expectedSha256) {
          throw new ServerInputError(400, 'upload_digest_mismatch', 'Mã kiểm tra tệp không khớp nội dung tải lên.');
        }
        if (uploadResult.status === 'rejected') throw uploadResult.reason;
        if (!uploadResult.value || uploadResult.value.size !== actual.byteSize) {
          throw new ServerInputError(400, 'upload_size_mismatch', 'Kích thước tệp không khớp nội dung tải lên.');
        }
        const finalizedAt = new Date().toISOString();
        const staleLeaseCutoff = new Date(Date.parse(finalizedAt) - FAILED_UPLOAD_GRACE_MS).toISOString();
        if (!await repository.beginFinalizePut(operationId, finalizedAt, staleLeaseCutoff)) {
          throw new ServerInputError(409, 'upload_reclaimed', 'Tệp tải lên đã quá hạn xử lý. Vui lòng thử lại.');
        }
        const finalized = await repository.applyUploadedObject(
          operationId,
          objectKey,
          actual.byteSize,
          actual.sha256,
          contentType,
          now,
          finalizedAt,
          finalizedAt,
        );
        if (!finalized) {
          throw new ServerInputError(409, 'upload_reclaimed', 'Tệp tải lên đã quá hạn xử lý. Vui lòng thử lại.');
        }
        objectStored = false;
        return mediaOperationResponse({
          id: operationId,
          object_key: objectKey,
          status: 'applied',
          expected_byte_size: actual.byteSize,
        }, context.env.MEDIA_PUBLIC_BASE_URL);
      } catch (error) {
        await markFailure(repository, operationId, error);
        if (objectStored) {
          try {
            await repository.deleteObject(objectKey);
          } catch {
            // Left for bounded reconciliation.
          }
        }
        throw error;
      }
    },

    async uploadMultipartMedia(args: {
      userId: string;
      idempotencyKey: string | null;
      file: File | null;
      folder?: string | null;
    }) {
      ensureMediaRole(context, 'upload');
      const file = args.file;
      if (!(file instanceof File)) throw new ServerInputError(400, 'file_required', 'Cần chọn tệp.');
      if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
        throw new ServerInputError(413, 'invalid_upload_size', 'Tệp phải có kích thước từ 1 byte đến 50 MB.');
      }
      return this.uploadMedia({
        userId: args.userId,
        idempotencyKey: args.idempotencyKey,
        prefix: String(args.folder || 'content'),
        contentType: file.type || 'application/octet-stream',
        contentLength: file.size,
        fileName: file.name,
        body: file.stream(),
        deriveDigest: true,
      });
    },

    async getMedia(rawObjectKey: string, request: Request) {
      const normalizedKey = decodeURIComponent(rawObjectKey);
      if (!/^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(normalizedKey) || normalizedKey.includes('..')) {
        throw new ServerInputError(404, 'media_not_found', 'Media không tồn tại.');
      }
      let manifest = null;
      try {
        manifest = await repository.getActiveObject(normalizedKey);
      } catch {}

      if (!manifest && await repository.isTombstoned?.(normalizedKey)) throw new ServerInputError(404, 'media_not_found', 'Media không tồn tại.');
      const range = request.headers.get('range');
      let object = null;
      try {
        object = await repository.getObject(normalizedKey, range ? request.headers : undefined);
      } catch {}

      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        const contentType = manifest?.content_type
          || (normalizedKey.endsWith('.pdf') ? 'application/pdf'
            : normalizedKey.endsWith('.webp') ? 'image/webp'
            : normalizedKey.endsWith('.jpg') || normalizedKey.endsWith('.jpeg') ? 'image/jpeg'
            : normalizedKey.endsWith('.png') ? 'image/png'
            : 'application/octet-stream');
        const cacheControl = manifest?.cache_control || 'public, max-age=31536000, immutable';
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', cacheControl);
        headers.set('X-Content-Type-Options', 'nosniff');
        if (object.httpEtag) headers.set('ETag', object.httpEtag);
        headers.set('Accept-Ranges', 'bytes');
        if (range && object.range) {
          const offset = object.range.offset ?? 0;
          const length = object.range.length ?? object.size;
          headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
        }
        return new Response(object.body, {
          status: range && object.range ? 206 : 200,
          headers,
        });
      }

      // Dự phòng upstream: nếu không có trong repository local, proxy từ media.quangtu.vn
      try {
        const upstreamUrl = `https://media.quangtu.vn/${normalizedKey}`;
        const upstreamHeaders = new Headers();
        if (range) upstreamHeaders.set('range', range);
        const upstreamRes = await fetch(upstreamUrl, { headers: upstreamHeaders });
        if (upstreamRes.ok || upstreamRes.status === 206) {
          const headers = new Headers(upstreamRes.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
          headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag');
          return new Response(upstreamRes.body, { status: upstreamRes.status, headers });
        }
      } catch {}

      throw new ServerInputError(404, 'media_not_found', 'Media không tồn tại.');
    },

    async tombstoneMedia(rawObjectKey: string, idempotencyKey: string | null) {
      return tombstoneMediaInternal(rawObjectKey, idempotencyKey, true);
    },

    async tombstoneMediaForCleanup(
      rawObjectKey: string,
      idempotencyKey: string | null,
      liveReferences: string[],
    ) {
      return tombstoneMediaInternal(rawObjectKey, idempotencyKey, false, liveReferences);
    },

    async purgeExpiredMedia(now = new Date()) {
      const timestamp = normalizeTimestamp(now);
      const staleCutoff = new Date(Date.parse(timestamp) - FAILED_UPLOAD_GRACE_MS).toISOString();
      const failedOrStale = await repository.listFailedOrStalePutOperations(staleCutoff, CLEANUP_BATCH_LIMIT);
      let failedUploadsPurged = 0;
      const cleanupErrors: string[] = [];
      for (const operation of failedOrStale) {
        const claimedAt = new Date().toISOString();
        if (!await repository.claimCleanupOperation(
          operation.id,
          operation.status === 'failed' ? 'failed' : 'pending',
          staleCutoff,
          claimedAt,
        )) {
          continue;
        }
        try {
          await repository.deleteObject(operation.object_key);
          await repository.markOperationStatus(operation.id, 'purged', null, operation.status);
          failedUploadsPurged += 1;
        } catch {
          cleanupErrors.push(operation.id);
          if (operation.status === 'pending') {
            await repository.markOperationStatus(operation.id, 'failed', 'stale_pending_cleanup_failed', 'pending');
          } else {
            await repository.releaseCleanupClaim(operation.id, 'failed');
          }
        }
      }

      const expired = await repository.listExpiredTombstones(timestamp, CLEANUP_BATCH_LIMIT);
      let purged = 0;
      for (const operation of expired) {
        try {
          await repository.deleteObject(operation.object_key);
          const success = await repository.purgeTombstone(operation.id, operation.object_key, timestamp);
          if (!success) throw new Error(`media-purge-d1-failed:${operation.id}`);
          purged += 1;
        } catch {
          cleanupErrors.push(operation.id);
        }
      }

      return { purged, failedUploadsPurged, cleanupErrors };
    },
  };
}

function ensureMediaRole(context: CloudflareRequestContext, action: 'upload' | 'delete'): void {
  const role = context.principal?.role ?? 'guest';
  if (action === 'upload') {
    if (role === 'ctv' || role === 'admin') return;
  } else if (role === 'admin') {
    return;
  }
  throw new ServerInputError(
    context.principal ? 403 : 401,
    context.principal ? 'forbidden' : 'authentication_required',
    context.principal ? 'Không đủ quyền.' : 'Cần đăng nhập.',
  );
}

async function markFailure(
  repository: ReturnType<typeof createMediaRepository>,
  operationId: string,
  error: unknown,
): Promise<void> {
  try {
    await repository.markOperationStatus(
      operationId,
      'failed',
      error instanceof ServerInputError ? error.code : 'r2_or_d1_failure',
      'pending',
    );
  } catch {
    // Leave stale pending discoverable for reconciler.
  }
}

function mediaOperationResponse(operation: Partial<MediaOperationRow>, baseUrl?: string) {
  const base = String(baseUrl || '').replace(/\/+$/u, '');
  return {
    id: operation.id,
    objectKey: operation.object_key,
    status: operation.status,
    byteSize: operation.expected_byte_size,
    url: base && operation.object_key ? `${base}/${operation.object_key}` : operation.object_key,
  };
}

function safeFileName(name: string): string {
  const normalized = String(name).normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '').slice(-100);
  if (!normalized || normalized === '.' || normalized === '..') return 'upload';
  return normalized;
}

function decodeFileNameHeader(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function digestBody(stream: ReadableStream<Uint8Array>) {
  const DigestStreamConstructor = (crypto as CryptoWithDigestStream).DigestStream;
  if (typeof DigestStreamConstructor !== 'function') return digestBodyWithSubtleCrypto(stream);
  const digest = new DigestStreamConstructor('SHA-256');
  const digestResult = digest.digest;
  void digestResult.catch(() => {});
  const reader = stream.getReader();
  const writer = digest.getWriter();
  let byteSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw new ServerInputError(413, 'invalid_upload_size', 'Tệp vượt giới hạn 50 MB.');
      }
      await writer.write(value);
    }
    await writer.close();
  } catch (error) {
    await writer.abort(error);
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return {
    byteSize,
    sha256: toBase64Url(new Uint8Array(await digestResult)),
  };
}

async function digestBodyWithSubtleCrypto(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw new ServerInputError(413, 'invalid_upload_size', 'Tệp vượt giới hạn 50 MB.');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    byteSize,
    sha256: toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))),
  };
}

function enforceUploadBounds(
  stream: ReadableStream<Uint8Array>,
  declaredLength: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let byteSize = 0;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (byteSize !== declaredLength) {
            throw new ServerInputError(400, 'upload_size_mismatch', 'Kích thước tệp không khớp nội dung tải lên.');
          }
          release();
          controller.close();
          return;
        }
        byteSize += value.byteLength;
        if (byteSize > MAX_UPLOAD_BYTES || byteSize > declaredLength) {
          throw new ServerInputError(413, 'invalid_upload_size', 'Tệp vượt kích thước đã khai báo hoặc giới hạn 50 MB.');
        }
        controller.enqueue(value);
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      release();
    },
  });
}

function createFixedLengthUpload(
  source: ReadableStream<Uint8Array>,
  expectedLength: number,
): { body: ReadableStream<Uint8Array>; completion: Promise<void> } {
  const Constructor = (globalThis as typeof globalThis & {
    FixedLengthStream?: new (length: number) => {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }).FixedLengthStream;
  if (typeof Constructor !== 'function') {
    return { body: source, completion: Promise.resolve() };
  }
  const fixed = new Constructor(expectedLength);
  return {
    body: fixed.readable,
    completion: source.pipeTo(fixed.writable),
  };
}

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid-purge-time');
  return date.toISOString();
}

interface DigestWriter {
  write(value: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

interface DigestStreamLike {
  readonly digest: Promise<ArrayBuffer>;
  getWriter(): DigestWriter;
}

type CryptoWithDigestStream = Crypto & {
  // Cloudflare Workers provides crypto.DigestStream at runtime even though the WebWorker TS lib does not.
  DigestStream: new (algorithm: string) => DigestStreamLike;
};
