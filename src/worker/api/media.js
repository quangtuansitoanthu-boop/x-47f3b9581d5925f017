import { sha256 } from '../auth/crypto.js';
import { HttpInputError } from '../http/request.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PREFIX_MIME = {
  covers: /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/u,
  content: /^(audio\/(mpeg|mp3|mp4|x-m4a|m4a|webm|ogg|opus|wav|x-wav|aac|flac)|image\/(jpeg|png|webp))$/u,
  pdfs: /^application\/pdf$/u,
};

export async function uploadMedia(request, env, session, { deriveDigest = false } = {}) {
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new HttpInputError(400, 'idempotency_required', 'Cần Idempotency-Key hợp lệ.');
  }
  const operationId = await sha256(`put:${session.userId}:${idempotencyKey}`);
  const existing = await env.DB.prepare(
    'SELECT id, object_key, status, expected_byte_size FROM media_operations WHERE id = ?',
  ).bind(operationId).first();
  if (existing) return mediaOperationResponse(existing, env);

  const declaredByteSize = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(declaredByteSize) ||
      declaredByteSize < 1 || declaredByteSize > MAX_UPLOAD_BYTES) {
    throw new HttpInputError(413, 'invalid_upload_size', 'Tệp phải có kích thước từ 1 byte đến 50 MB.');
  }
  const prefix = request.headers.get('x-media-prefix') || '';
  const contentType = (request.headers.get('content-type') || '').toLowerCase().split(';')[0];
  if (!PREFIX_MIME[prefix]?.test(contentType)) {
    throw new HttpInputError(415, 'invalid_media_type', 'Loại tệp không được phép cho thư mục này.');
  }
  const expectedSha256 = deriveDigest ? null : request.headers.get('x-content-sha256');
  if (!deriveDigest && (!expectedSha256 || !/^[A-Za-z0-9_-]{43}$/u.test(expectedSha256))) {
    throw new HttpInputError(400, 'digest_required', 'Cần X-Content-SHA256 dạng base64url.');
  }
  if (!request.body) throw new HttpInputError(400, 'file_required', 'Cần nội dung tệp.');
  const originalName = safeFileName(request.headers.get('x-file-name') || 'upload');
  const objectKey = `${prefix}/${crypto.randomUUID()}-${originalName}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO media_operations
      (id, object_key, operation, status, expected_sha256, expected_byte_size, created_at)
    VALUES (?, ?, 'put', 'pending', ?, ?, ?)
  `).bind(operationId, objectKey, expectedSha256, declaredByteSize, now).run();

  let objectStored = false;
  try {
    if (await env.MEDIA.head(objectKey)) throw new HttpInputError(409, 'media_collision', 'Khóa media đã tồn tại.');
    const [uploadBody, verificationBody] = request.body.tee();
    const verification = digestBody(verificationBody);
    const putOptions = {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        operationId,
      },
    };
    if (expectedSha256) {
      putOptions.customMetadata.sha256 = expectedSha256;
      putOptions.sha256 = fromBase64Url(expectedSha256);
    }
    const upload = env.MEDIA.put(objectKey, uploadBody, putOptions);
    const [uploadResult, verificationResult] = await Promise.allSettled([upload, verification]);
    objectStored = uploadResult.status === 'fulfilled' && Boolean(uploadResult.value);
    if (verificationResult.status === 'rejected') {
      throw verificationResult.reason;
    }
    const actual = verificationResult.value;
    if (actual.byteSize !== declaredByteSize) {
      throw new HttpInputError(400, 'upload_size_mismatch', 'Kích thước tệp không khớp nội dung tải lên.');
    }
    if (expectedSha256 && actual.sha256 !== expectedSha256) {
      throw new HttpInputError(400, 'upload_digest_mismatch', 'Mã kiểm tra tệp không khớp nội dung tải lên.');
    }
    if (uploadResult.status === 'rejected') throw uploadResult.reason;
    const uploaded = uploadResult.value;
    if (!uploaded || uploaded.size !== actual.byteSize) {
      throw new HttpInputError(400, 'upload_size_mismatch', 'Kích thước tệp không khớp nội dung tải lên.');
    }
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO media_objects
          (object_key, source_path, byte_size, sha256, content_type,
           cache_control, baseline, created_at)
        VALUES (?, ?, ?, ?, ?, 'public, max-age=31536000, immutable', 0, ?)
      `).bind(objectKey, objectKey, actual.byteSize, actual.sha256, contentType, now),
      env.DB.prepare(`
        UPDATE media_operations
        SET status = 'applied', expected_sha256 = ?, expected_byte_size = ?, applied_at = ?
        WHERE id = ? AND status = 'pending'
      `).bind(actual.sha256, actual.byteSize, new Date().toISOString(), operationId),
    ]);
    objectStored = false;
    return mediaOperationResponse({
      id: operationId,
      object_key: objectKey,
      status: 'applied',
      expected_byte_size: actual.byteSize,
    }, env);
  } catch (error) {
    await env.DB.prepare(
      'UPDATE media_operations SET status = ?, error_code = ? WHERE id = ? AND status = ?',
    ).bind('failed', error instanceof HttpInputError ? error.code : 'r2_or_d1_failure',
      operationId, 'pending').run();
    if (objectStored) {
      try {
        await env.MEDIA.delete(objectKey);
      } catch {
        // The failed ledger remains discoverable for the scheduled reconciler.
      }
    }
    throw error;
  }
}

export async function uploadMultipartMedia(request, env, session) {
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new HttpInputError(400, 'idempotency_required', 'Cần Idempotency-Key hợp lệ.');
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 1_000_000) {
    throw new HttpInputError(413, 'invalid_upload_size', 'Tệp vượt giới hạn 50 MB.');
  }
  const form = await request.formData();
  const file = form.get('file');
  const prefix = String(form.get('folder') || 'content');
  if (!(file instanceof File)) throw new HttpInputError(400, 'file_required', 'Cần chọn tệp.');
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new HttpInputError(413, 'invalid_upload_size', 'Tệp phải có kích thước từ 1 byte đến 50 MB.');
  }
  const headers = new Headers({
    'Content-Type': file.type || 'application/octet-stream',
    'Content-Length': String(file.size),
    'X-Media-Prefix': prefix,
    'X-File-Name': file.name,
    'Idempotency-Key': idempotencyKey,
  });
  return uploadMedia(new Request(request.url, {
    method: 'POST',
    headers,
    body: file.stream(),
  }), env, session, { deriveDigest: true });
}

export async function getMedia(request, env, objectKey) {
  const normalizedKey = decodeURIComponent(objectKey);
  if (!/^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(normalizedKey) || normalizedKey.includes('..')) {
    throw new HttpInputError(404, 'media_not_found', 'Media không tồn tại.');
  }
  let manifest = null;
  try {
    manifest = await env.DB.prepare(
      'SELECT content_type, cache_control FROM media_objects WHERE object_key = ? AND deleted_at IS NULL',
    ).bind(normalizedKey).first();
  } catch {}

  const range = request.headers.get('range');
  let object = null;
  if (env.MEDIA) {
    try {
      object = await env.MEDIA.get(normalizedKey, range ? { range: request.headers } : undefined);
    } catch {}
  }

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
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    if (range && object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size;
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    }
    return new Response(object.body, { status: range && object.range ? 206 : 200, headers });
  }

  // Dự phòng upstream: nếu không có trong D1/R2, proxy từ media.quangtu.vn
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

  throw new HttpInputError(404, 'media_not_found', 'Media không tồn tại.');
}

export async function tombstoneMedia(request, env, objectKey) {
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new HttpInputError(400, 'idempotency_required', 'Cần Idempotency-Key hợp lệ.');
  }
  const normalizedKey = decodeURIComponent(objectKey);
  if (!/^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(normalizedKey) || normalizedKey.includes('..')) {
    throw new HttpInputError(400, 'invalid_object_key', 'Khóa media không hợp lệ.');
  }
  const operationId = await sha256(`delete:${normalizedKey}:${idempotencyKey}`);
  const existing = await env.DB.prepare(
    'SELECT id, object_key, status, expected_byte_size FROM media_operations WHERE id = ?',
  ).bind(operationId).first();
  if (existing) return mediaOperationResponse(existing, env);
  const media = await env.DB.prepare(
    'SELECT byte_size, sha256 FROM media_objects WHERE object_key = ? AND deleted_at IS NULL',
  ).bind(normalizedKey).first();
  if (!media) throw new HttpInputError(404, 'media_not_found', 'Media không tồn tại.');
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE media_objects SET deleted_at = ? WHERE object_key = ? AND deleted_at IS NULL',
    ).bind(now.toISOString(), normalizedKey),
    env.DB.prepare(`
      INSERT INTO media_operations
        (id, object_key, operation, status, expected_sha256, expected_byte_size,
         created_at, applied_at, purge_after)
      VALUES (?, ?, 'delete', 'tombstoned', ?, ?, ?, ?, ?)
    `).bind(operationId, normalizedKey, media.sha256, media.byte_size,
      now.toISOString(), now.toISOString(), purgeAfter),
  ]);
  return {
    id: operationId,
    objectKey: normalizedKey,
    status: 'tombstoned',
    purgeAfter,
  };
}

export async function purgeExpiredMedia(env, now = new Date()) {
  const timestamp = normalizeTimestamp(now);
  const failedUploads = await env.DB.prepare(`
    SELECT id, object_key
    FROM media_operations
    WHERE operation = 'put' AND status = 'failed'
    ORDER BY created_at, id
  `).all();
  let failedUploadsPurged = 0;
  for (const operation of failedUploads.results || []) {
    await env.MEDIA.delete(operation.object_key);
    await env.DB.prepare(`
      UPDATE media_operations SET status = 'purged', applied_at = ?
      WHERE id = ? AND operation = 'put' AND status = 'failed'
    `).bind(timestamp, operation.id).run();
    failedUploadsPurged += 1;
  }
  const expired = await env.DB.prepare(`
    SELECT operations.id, operations.object_key
    FROM media_operations AS operations
    INNER JOIN media_objects AS objects
      ON objects.object_key = operations.object_key
    WHERE operations.operation = 'delete'
      AND operations.status = 'tombstoned'
      AND operations.purge_after IS NOT NULL
      AND operations.purge_after <= ?
      AND objects.deleted_at IS NOT NULL
    ORDER BY operations.purge_after, operations.id
  `).bind(timestamp).all();
  let purged = 0;
  for (const operation of expired.results || []) {
    await env.MEDIA.delete(operation.object_key);
    const results = await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM media_objects
        WHERE object_key = ? AND deleted_at IS NOT NULL
      `).bind(operation.object_key),
      env.DB.prepare(`
        UPDATE media_operations
        SET status = 'purged', applied_at = ?
        WHERE id = ? AND status = 'tombstoned' AND purge_after <= ?
      `).bind(timestamp, operation.id, timestamp),
    ]);
    if (results.some((result) => result.success === false)) {
      throw new Error(`media-purge-d1-failed:${operation.id}`);
    }
    purged += 1;
  }
  return { purged, failedUploadsPurged };
}

function mediaOperationResponse(operation, env) {
  const base = String(env.MEDIA_PUBLIC_BASE_URL || '').replace(/\/+$/u, '');
  return {
    id: operation.id,
    objectKey: operation.object_key,
    status: operation.status,
    byteSize: operation.expected_byte_size,
    url: base ? `${base}/${operation.object_key}` : operation.object_key,
  };
}

function safeFileName(name) {
  const normalized = String(name).normalize('NFKC').replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '').slice(-100);
  if (!normalized || normalized === '.' || normalized === '..') return 'upload';
  return normalized;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function digestBody(stream) {
  const digest = new crypto.DigestStream('SHA-256');
  const reader = stream.getReader();
  const writer = digest.getWriter();
  let byteSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw new HttpInputError(413, 'invalid_upload_size', 'Tệp vượt giới hạn 50 MB.');
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
    sha256: base64Url(new Uint8Array(await digest.digest)),
  };
}

function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid-purge-time');
  return date.toISOString();
}
