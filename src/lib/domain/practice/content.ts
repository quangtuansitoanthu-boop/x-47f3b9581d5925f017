function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeAttribute(input: string): string {
  return escapeHtml(String(input || ''))
    .replaceAll('\n', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\t', ' ')
    .trim();
}

function sanitizeColor(value: string): string | null {
  const normalized = String(value || '').trim();
  if (
    /^#[0-9a-f]{3,8}$/iu.test(normalized) ||
    /^(?:rgb|hsl)a?\(\s*[-\d.%\s,]+\)$/iu.test(normalized) ||
    /^[a-z]+$/iu.test(normalized)
  ) {
    return normalized;
  }
  return null;
}

function sanitizeFontSize(value: string): string | null {
  const normalized = String(value || '').trim();
  if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/iu.test(normalized)) return normalized;
  return null;
}

const MEDIA_OBJECT_KEY_PATTERN = /^(?:content|covers|pdfs)\/[A-Za-z0-9._/-]+$/u;

function normalizeMediaObjectKey(value: string): string | null {
  const normalized = String(value || '').replace(/^\//u, '');
  if (!MEDIA_OBJECT_KEY_PATTERN.test(normalized) || normalized.includes('..') || normalized.includes('//')) return null;
  return normalized;
}

function normalizeImageUrl(value: string): string | null {
  const raw = String(value || '').normalize('NFKC').trim();
  if (!raw || /[\u0000-\u001f"'`<>\\]/u.test(raw)) return null;

  if (/^\/assets\//u.test(raw)) return raw;
  if (/^assets\//u.test(raw)) return `/${raw}`;
  if (/^\/api\/media\//u.test(raw)) {
    const mediaObjectKey = normalizeMediaObjectKey(raw.replace(/^\/api\/media\//u, ''));
    return mediaObjectKey ? `/api/media/${mediaObjectKey}` : null;
  }
  if (/^\/?(?:content|covers|pdfs)\//u.test(raw)) {
    const mediaObjectKey = normalizeMediaObjectKey(raw);
    return mediaObjectKey ? `/api/media/${mediaObjectKey}` : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHost = host === 'media.quangtu.vn' ||
    host === 'quangtu.vn' ||
    host === 'archive.org' ||
    host.endsWith('.archive.org');
  if (parsed.protocol !== 'https:' || !allowedHost || parsed.username || parsed.password) return null;
  if (/^(?:javascript|data|vbscript):/iu.test(parsed.protocol)) return null;
  if (host === 'quangtu.vn' && /^\/(?:content|covers|pdfs)\//u.test(parsed.pathname)) {
    const mediaObjectKey = normalizeMediaObjectKey(parsed.pathname);
    return mediaObjectKey ? `/api/media/${mediaObjectKey}${parsed.search}${parsed.hash}` : null;
  }
  return parsed.toString();
}

function renderAlignedLine(line: string, align: string): string {
  let hasBlank = false;
  // Only inspect text, so dots in image URLs and other attributes stay untouched.
  const content = line.split(/(<[^>]+>)/gu).map((token) => token.startsWith('<') ? token :
    token.replace(/\.{6,}|…{3,}/gu, (blank) => {
      hasBlank = true;
      return `<span class="tt-content__blank">${blank}</span>`;
    })).join('');
  return `<span class="tt-content__line tt-content__line--${align}${hasBlank ? ' tt-content__line--fill-in' : ''}">${content}</span>`;
}

export function replaceCustomTags(input: string): string {
  let output = input;

  output = output.replace(/\{c:([^|{}]+)\|([^{}]*)\}/gu, (_full, color, content) => {
    const safeColor = sanitizeColor(color);
    return safeColor ? `<span style="color:${sanitizeAttribute(safeColor)}">${content}</span>` : content;
  });
  output = output.replace(/\{color:([^|{}]+)\|([^{}]*)\}/giu, (_full, color, content) => {
    const safeColor = sanitizeColor(color);
    return safeColor ? `<span style="color:${sanitizeAttribute(safeColor)}">${content}</span>` : content;
  });
  output = output.replace(/\{bold\|([^{}]*)\}/giu, '<strong>$1</strong>');
  output = output.replace(/\{italic\|([^{}]*)\}/giu, '<em>$1</em>');
  output = output.replace(/\{size:([^|{}]+)\|([^{}]*)\}/giu, (_full, size, content) => {
    const safeSize = sanitizeFontSize(size);
    return safeSize ? `<span style="font-size:${sanitizeAttribute(safeSize)}">${content}</span>` : content;
  });
  output = output.replace(
    /\{align:(left|center|right|justify)\|([\s\S]*?)\}/gu,
    (_full, align, content) => {
      const lines = content.split('\n');
      return lines
        .map((line: string) => {
          if (!line.trim()) return '';
          const cleanLine = line.replace(/^#{1,6}\s*(.+)$/u, '<strong>$1</strong>');
          return renderAlignedLine(cleanLine, align);
        })
        .join('\n');
    }
  );
  output = output.replace(
    /\{align:(left|center|right|justify)\|([^\n{}]*)/gu,
    (_full, align, content) => {
      const cleanLine = content.replace(/^#{1,6}\s*(.+)$/u, '<strong>$1</strong>');
      return renderAlignedLine(cleanLine, align);
    }
  );

  return output;
}

function restoreMarkdownImages(input: string): string {
  const placeholders = new Map<string, string>();
  let nextIndex = 0;

  const tokenized = input.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/gu, (full, alt, url) => {
    const safeUrl = normalizeImageUrl(String(url));
    if (!safeUrl) return full;

    const key = `%%IMG_${nextIndex += 1}%%`;
    const safeAlt = sanitizeAttribute(String(alt));
    const caption = String(alt).trim()
      ? `<figcaption class="tt-content__caption">${escapeHtml(String(alt))}</figcaption>`
      : '';

    placeholders.set(
      key,
      `<figure class="tt-content__figure"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" />${caption}</figure>`
    );

    return key;
  });

  let output = escapeHtml(tokenized)
    .replace(/\*\*(.*?)\*\*/gu, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/gu, '<em>$1</em>')
    .replace(/__(.*?)__/gu, '<u>$1</u>')
    .replace(/_(.*?)_/gu, '<em>$1</em>');

  for (const [key, value] of placeholders.entries()) {
    output = output.replaceAll(key, value);
  }

  output = replaceCustomTags(output);

  output = output.replace(
    /^(?!<span|<div|<figure|<br|<strong|<em|<u|<img)(.+)$/gmu,
    (_full, line) => renderAlignedLine(line, 'justify')
  );
  output = output.replace(/\n\n/gu, '<div class="tt-content__gap"></div>');
  output = output.replace(/<\/span>\n/gu, '</span>');
  output = output.replace(/\n/gu, '<br>');

  return output;
}

export function renderPracticeContent(raw: string): string {
  if (!raw) return '<p class="tt-content__empty">Nội dung đang cập nhật...</p>';
  return restoreMarkdownImages(raw);
}

