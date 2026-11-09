import { ServerInputError } from '../errors';

const MAX_JSON_BYTES = 1_000_000;

export async function readJson(request: Request, maximumBytes = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ServerInputError(415, 'content_type', 'Yêu cầu phải dùng application/json.');
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) {
    throw new ServerInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new ServerInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ServerInputError(400, 'invalid_json', 'JSON không hợp lệ.');
  }
}

export function requiredText(value: unknown, name: string, maximum = 10_000): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServerInputError(400, 'invalid_field', `${name} là bắt buộc.`);
  }
  const clean = value.trim();
  if (clean.length > maximum) {
    throw new ServerInputError(400, 'invalid_field', `${name} vượt giới hạn.`);
  }
  return clean;
}
