import { ServerInputError } from '../errors';
import type { BookChapterInput, BookImportPayload } from '../services/book-import';
import { importBookAtomically, replaceBookChapters } from '../services/book-import';
import { readJson } from './request';
import { apiError, json, methodNotAllowed, withRequestId } from './responses';
import { getApiLocals, type EventLike } from './runtime';
import { enforceSameOriginMutation } from './security';

export async function handleBookImport(event: EventLike): Promise<Response> {
  return handleAdminBookRequest(event, async (runtime) => {
    if (event.request.method !== 'POST') return methodNotAllowed(['POST'], runtime.requestId);
    const body = await readJson(event.request, 16_000_000);
    const key = event.request.headers.get('idempotency-key') || String(body.idempotencyKey || '');
    return json(await importBookAtomically(runtime.env!, runtime.session, { ...body, idempotencyKey: key } as BookImportPayload), 201);
  });
}

export async function handleBookChapters(event: EventLike): Promise<Response> {
  return handleAdminBookRequest(event, async (runtime) => {
    if (event.request.method !== 'PUT') return methodNotAllowed(['PUT'], runtime.requestId);
    const body = await readJson(event.request, 16_000_000);
    if (!Array.isArray(body.chapters)) throw new ServerInputError(400, 'invalid_chapters', 'Danh sách tập không hợp lệ.');
    return json(await replaceBookChapters(runtime.env!, runtime.session, decodeURIComponent(event.params?.id || ''), body.chapters as BookChapterInput[]));
  });
}

async function handleAdminBookRequest(
  event: EventLike,
  action: (runtime: ReturnType<typeof getApiLocals>) => Promise<Response>,
): Promise<Response> {
  const runtime = getApiLocals(event);
  try {
    if (!runtime.env) return apiError(503, 'platform_unavailable', 'Cloudflare bindings chưa sẵn sàng.', runtime.requestId);
    if (!runtime.migrationSealed) return apiError(503, 'migration_unsealed', 'Dữ liệu chưa được xác minh.', runtime.requestId);
    const denied = enforceSameOriginMutation(event.request, runtime.env, runtime.session, runtime.requestId);
    if (denied) return denied;
    return withRequestId(await action(runtime), runtime.requestId);
  } catch (error) {
    if (error instanceof ServerInputError) return withRequestId(apiError(error.status, error.code, error.message, runtime.requestId, error.details), runtime.requestId);
    console.error(JSON.stringify({ level: 'error', event: 'admin_book_failure', requestId: runtime.requestId, name: (error as Error)?.name }));
    return withRequestId(apiError(500, 'internal_error', 'Đã xảy ra lỗi máy chủ.', runtime.requestId), runtime.requestId);
  }
}
