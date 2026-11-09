const MAX_JSON_BYTES = 1_000_000;

export async function readJson(request, maximumBytes = MAX_JSON_BYTES) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpInputError(415, 'content_type', 'Yêu cầu phải dùng application/json.');
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) {
    throw new HttpInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new HttpInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed;
  } catch {
    throw new HttpInputError(400, 'invalid_json', 'JSON không hợp lệ.');
  }
}

export class HttpInputError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpInputError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function requiredText(value, name, maximum = 10_000) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpInputError(400, 'invalid_field', `${name} là bắt buộc.`);
  }
  const clean = value.trim();
  if (clean.length > maximum) {
    throw new HttpInputError(400, 'invalid_field', `${name} vượt giới hạn.`);
  }
  return clean;
}

export function optionalText(value, name, maximum = 10_000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > maximum) {
    throw new HttpInputError(400, 'invalid_field', `${name} không hợp lệ.`);
  }
  return value.trim();
}

export function jsonValue(value, name, fallback) {
  if (value === undefined) return fallback;
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length > 500_000) throw new Error();
    return encoded;
  } catch {
    throw new HttpInputError(400, 'invalid_field', `${name} không hợp lệ.`);
  }
}
