const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2',
  'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table',
  's', 'strike', 'sub', 'sup', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
  'video', 'source',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img', 'source']);
const GLOBAL_ATTRIBUTES = new Set(['class', 'title']);
const TAG_ATTRIBUTES = {
  a: new Set(['href', 'target']),
  img: new Set(['alt', 'src', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  video: new Set(['controls', 'poster', 'preload', 'playsinline', 'src', 'width', 'height', 'loop', 'muted']),
  source: new Set(['src', 'type']),
};
const BOOLEAN_ATTRIBUTES = new Set(['controls', 'playsinline', 'loop', 'muted']);
const SAFE_FONT_FAMILIES = new Set(['Arial', 'Bookerly', 'Georgia', 'Lora', 'Times New Roman']);

export function sanitizePlainText(value, maximum = 10_000) {
  return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, maximum);
}

export function sanitizeStoredHtml(value, maximum = 600_000) {
  const input = String(value ?? '').replaceAll('\u0000', '').slice(0, maximum);
  const withoutDangerousBlocks = input
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|template)\b[\s\S]*?<\/\1\s*>/giu, '');
  return withoutDangerousBlocks.replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/giu, (token, closing, rawTag, rawAttributes) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    const attributes = sanitizeAttributes(tag, rawAttributes);
    return `<${tag}${attributes}>`;
  });
}

function sanitizeAttributes(tag, rawAttributes) {
  const result = [];
  const pattern = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of rawAttributes.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    const hasExplicitValue = match[2] !== undefined || match[3] !== undefined || match[4] !== undefined;
    const rawVal = match[2] ?? match[3] ?? match[4] ?? '';
    const value = hasExplicitValue ? rawVal : (BOOLEAN_ATTRIBUTES.has(name) ? name : '');
    if (name.startsWith('on')) continue;
    if (name === 'style') {
      const style = sanitizeStyle(value);
      if (style) result.push(`style="${escapeAttribute(style)}"`);
      continue;
    }
    if (!GLOBAL_ATTRIBUTES.has(name) && !TAG_ATTRIBUTES[tag]?.has(name)) continue;
    const isMedia = tag === 'img' || tag === 'video' || tag === 'source';
    if ((name === 'href' || name === 'src' || name === 'poster') && !isSafeUrl(value, isMedia)) continue;
    if (name === 'target' && value !== '_blank' && value !== '_self') continue;
    if (BOOLEAN_ATTRIBUTES.has(name) && !hasExplicitValue) {
      result.push(name);
    } else {
      result.push(`${name}="${escapeAttribute(value)}"`);
    }
    if (name === 'target' && value === '_blank') result.push('rel="noopener noreferrer"');
  }
  return result.length ? ` ${[...new Set(result)].join(' ')}` : '';
}

function sanitizeStyle(rawStyle) {
  const declarations = [];
  const seen = new Set();
  for (const declaration of rawStyle.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const rawValue = declaration.slice(separator + 1).trim();
    if (!rawValue || seen.has(property)) continue;

    let value = null;
    if (property === 'text-align' && /^(?:left|center|right|justify)$/u.test(rawValue)) {
      value = rawValue;
    } else if (property === 'color' && (
      /^#[0-9a-f]{3,8}$/iu.test(rawValue) ||
      /^(?:rgb|hsl)a?\(\s*[-\d.%\s,]+\)$/iu.test(rawValue)
    )) {
      value = rawValue;
    } else if (property === 'font-size' && /^(?:[8-9]|[1-6]\d|7[0-2])px$/u.test(rawValue)) {
      value = rawValue;
    } else if (property === 'font-family') {
      const family = rawValue.replace(/^['"]|['"]$/gu, '').trim();
      if (SAFE_FONT_FAMILIES.has(family)) value = family;
    } else if (property === 'background-color' && (
      /^#[0-9a-f]{3,8}$/iu.test(rawValue) ||
      /^(?:rgb|hsl)a?\(\s*[-\d.%\s,]+\)$/iu.test(rawValue)
    )) {
      value = rawValue;
    } else if (property === 'line-height' && /^(?:0\.[8-9]|[1-2](?:\.\d{1,2})?|3)$/u.test(rawValue)) {
      value = rawValue;
    }

    if (!value) continue;
    seen.add(property);
    declarations.push(`${property}:${value}`);
  }
  return declarations.join(';');
}

function isSafeUrl(rawValue, image) {
  const value = decodeHtmlEntities(rawValue).trim().replace(/[\u0000-\u0020]+/gu, '');
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (image && /^(covers|content|pdfs|videos|posters)\//u.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (!image && url.protocol === 'mailto:');
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);?/gu, (entity, digits) => decodeCodePoint(entity, Number(digits)))
    .replace(/&#x([0-9a-f]+);?/giu, (entity, digits) => decodeCodePoint(entity, Number.parseInt(digits, 16)))
    .replaceAll('&colon;', ':')
    .replaceAll('&Tab;', '\t')
    .replaceAll('&NewLine;', '\n');
}

function decodeCodePoint(entity, codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
  return String.fromCodePoint(codePoint);
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function resolveMediaReferences(record, baseUrl) {
  if (!record || !baseUrl) return record;
  const normalizedBase = String(baseUrl).replace(/\/+$/u, '');
  const result = { ...record };
  for (const field of ['anh_url', 'pdf_url', 'anh_dai_dien', 'object_key']) {
    if (typeof result[field] === 'string' && /^(covers|content|pdfs|videos|posters)\//u.test(result[field])) {
      result[field] = `${normalizedBase}/${result[field]}`;
    }
  }
  return result;
}

export function parseJsonFields(record, fields) {
  const result = { ...record };
  for (const field of fields) {
    if (typeof result[field] !== 'string') continue;
    try {
      result[field] = JSON.parse(result[field]);
    } catch {
      result[field] = null;
    }
  }
  return result;
}
