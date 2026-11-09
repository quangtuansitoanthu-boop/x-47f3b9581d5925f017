import { isNativeApp } from './native-platform';

export function isNativeAdminReadOnly(role: string | undefined): boolean {
  return role === 'admin' && isNativeApp();
}

// Giữ quyền web và thao tác cá nhân; app chỉ ghi trạng thái thành viên và quyết định kiểm duyệt đã duyệt.
export async function blocksNativeAdminWrite(input: RequestInfo | URL, init: RequestInit | undefined, role: string | undefined): Promise<boolean> {
  if (!isNativeAdminReadOnly(role)) {
    if (!isNativeApp()) return false;
    try {
      const path = new URL(input instanceof Request ? input.url : String(input), 'https://quangtu.vn').pathname;
      return /^\/api\/admin\/community\/moderation(?:\/|$)/u.test(path);
    } catch { return false; }
  }
  const request = input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  const path = new URL(request?.url ?? String(input), 'https://quangtu.vn').pathname;
  // Đọc/nghe và bình luận vẫn là luồng sử dụng cá nhân, không phải sửa nội dung quản trị.
  if (method === 'POST' && (/^\/api\/articles\/[^/]+\/(views|comments)$/u.test(path)
    || /^\/api\/talks\/[^/]+\/plays$/u.test(path))) return false;
  if (/^\/api\/practice\/campaigns(?:\/[^/]+)?$/u.test(path)) return true;
  if (!/^\/api\/(admin|articles|talks|upload|media)(\/|$)/u.test(path)) return false;
  const moderation = /^\/api\/admin\/community\/moderation\/(comments|profiles|reports)\/[^/]+$/u.exec(path);
  if (method !== 'PATCH' || (!moderation && !/^\/api\/admin\/members\/(?:google\/)?[^/]+$/u.test(path))) return true;
  try {
    const raw = init?.body ?? (request ? await request.clone().text() : null);
    if (typeof raw !== 'string') return true;
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return true;
    const update = body as Record<string, unknown>;
    if (moderation) {
      if (Object.keys(update).some(key => !['action', 'revision', 'reason'].includes(key))) return true;
      const action = update.action;
      if (typeof action !== 'string' || !(moderation[1] === 'reports' ? ['resolve'] : ['approve', 'reject', 'hide']).includes(action)) return true;
      if (typeof update.revision !== 'number' || !Number.isInteger(update.revision) || update.revision <= 0) return true;
      if (update.reason !== undefined && !(action === 'hide' && update.reason === null)
        && (typeof update.reason !== 'string' || update.reason.length > 1000)) return true;
      if (action === 'reject' && (typeof update.reason !== 'string' || !update.reason.trim())) return true;
      return false;
    }
    return Object.keys(update).length !== 1 || !['active', 'suspended'].includes(String(update.status));
  } catch {
    return true;
  }
}
