export { sanitizePlainText, sanitizeStoredHtml } from '../../domain/content-sanitizer';

export function resolveMediaReferences<T extends Record<string, unknown>>(record: T, baseUrl?: string): T {
  if (!record || !baseUrl) return record;
  const normalizedBase = String(baseUrl).replace(/\/+$/u, '');
  const result: Record<string, unknown> = { ...record };
  for (const field of ['anh_url', 'pdf_url', 'anh_dai_dien', 'object_key']) {
    if (typeof result[field] === 'string' && /^(covers|content|pdfs|videos|posters)\//u.test(result[field] as string)) {
      result[field] = `${normalizedBase}/${result[field]}`;
    }
  }
  return result as T;
}

export function parseJsonFields<T extends Record<string, unknown>>(record: T, fields: string[]): T {
  const result: Record<string, unknown> = { ...record };
  for (const field of fields) {
    if (typeof result[field] !== 'string') continue;
    try {
      result[field] = JSON.parse(result[field] as string);
    } catch {
      result[field] = null;
    }
  }
  return result as T;
}
