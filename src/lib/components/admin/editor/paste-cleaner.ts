/**
 * Normalizes pasted HTML and text from Microsoft Word, Google Docs, and external websites.
 * 
 * Rules:
 * 1. Default formatting:
 *    - Short lines / verses (câu ngắn, thơ, kệ như ảnh): center-aligned (`text-align: center`)
 *    - Prose paragraphs (đoạn văn văn xuôi dài): justified (`text-align: justify`)
 * 2. Normalizes font & size:
 *    - Strips custom font-family and font-size so content inherits Bookerly 14px.
 * 3. Preserves all other rich styling:
 *    - Bold, italic, underline, strikethrough, tables, lists, links, blockquotes, colors, line-height.
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

/**
 * Determines whether a line of text is a short verse / chanting sentence.
 * Examples from Buddhist verses:
 * - "Cúng dường tất cả Phật" (5 words, 22 chars)
 * - "Tôn Pháp, các Bồ Tát," (5 words, 21 chars)
 * - "Vô biên chúng Thanh-văn" (4 words, 23 chars)
 * - "Trọn nên đạo Vô thượng." (5 words, 23 chars)
 */
export function isVerseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // If text contains internal sentence endings followed by a capital letter,
  // e.g. "Đây là câu một. Còn đây là câu hai.", it is continuous prose.
  if (/[.?!]\s+[A-ZÀ-Ỹa-zà-ỹ0-9]/u.test(trimmed)) {
    return false;
  }

  const words = getWordCount(trimmed);
  const chars = trimmed.length;

  // Verses are typically 4 to 12 words and under ~70 characters
  return chars <= 70 && words <= 14;
}

/**
 * Determines whether a line of text is written in ALL CAPS (tiêu đề in hoa).
 * Examples from user images:
 * - "ĐOẠN VI"
 * - "CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT"
 * - "PHẦN THỨ NHẤT - PHẦN TỰA"
 * - "CHƯƠNG I"
 * - "TỰA CHUNG"
 */
export function isAllCapsHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const hasUppercase = /\p{Lu}/u.test(trimmed);
  const hasLowercase = /\p{Ll}/u.test(trimmed);
  if (!hasUppercase || hasLowercase) return false;

  const words = getWordCount(trimmed);
  const chars = trimmed.length;

  const letterCount = (trimmed.match(/\p{Lu}/gu) || []).length;
  if (letterCount < 2) return false;

  return chars <= 120 && words <= 18;
}

/**
 * Determines whether a line starts with a common book/article title prefix.
 * e.g. "Đoạn VI", "Chương 1", "Phần thứ nhất", "Tựa chung", "Lời nói đầu", etc.
 */
export function isPrefixedHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const words = getWordCount(trimmed);
  const chars = trimmed.length;
  if (chars > 120 || words > 18) return false;

  return /^(?:phần|chương|đoạn|mục|tiết|bài|hồi|lời nói đầu|lời mở đầu|lời tựa|tựa chung|tựa|kệ)\b/iu.test(trimmed);
}

/**
 * Checks if a string represents a heading/title.
 */
export function isHeadingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Don't treat multi-sentence prose as heading
  if (/[.?!]\s+\p{L}/u.test(trimmed)) {
    return false;
  }

  return isPrefixedHeading(trimmed) || isAllCapsHeading(trimmed);
}

/**
 * Checks if an element has a Word heading/title class.
 */
export function isHeadingClass(el: Element): boolean {
  const className = el.getAttribute('class') || '';
  return /\b(?:mso)?(?:heading|title|subheading)\d*\b/iu.test(className);
}

function withoutOfficeClasses(value: string): string {
  return value.split(/\s+/u).filter(name => name && !/^(?:mso|wordsection\d)/iu.test(name)).join(' ');
}

/**
 * Ensures an element is styled or wrapped as bold.
 */
export function ensureElementBold(el: HTMLElement): void {
  const rawStyle = el.getAttribute('style') || '';
  if (/font-weight\s*:\s*(?:bold|[6-9]\d\d)/iu.test(rawStyle)) {
    return;
  }

  const tagName = el.tagName.toLowerCase();
  if (tagName === 'strong' || tagName === 'b') {
    return;
  }

  const textContent = el.textContent?.trim() || '';
  if (!textContent) return;

  const boldChildren = el.querySelectorAll('strong, b');
  let boldTextLength = 0;
  for (const b of boldChildren) {
    boldTextLength += (b.textContent?.trim() || '').length;
  }
  if (boldTextLength >= textContent.length) {
    return;
  }

  el.innerHTML = `<strong>${el.innerHTML.trim()}</strong>`;
}

/**
 * Checks if a block (paragraph or div) represents a verse stanza.
 */
export function isVerseBlock(text: string, innerHtml: string): boolean {
  const trimmedText = text.trim();
  if (!trimmedText) return false;

  // Check if block contains <br>
  if (/<br\s*\/?>/iu.test(innerHtml)) {
    const lines = innerHtml
      .split(/<br\s*\/?>/iu)
      .map((l) => l.replace(/<[^>]+>/gu, '').trim())
      .filter(Boolean);

    if (lines.length > 1) {
      const verseCount = lines.filter(isVerseLine).length;
      return verseCount >= Math.ceil(lines.length * 0.7) && lines.every((l) => l.length <= 80);
    }
  }

  return isVerseLine(trimmedText);
}

export function cleanPastedHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const cleanedInput = html.replace(/<!--[\s\S]*?-->/gu, '');
      const doc = parser.parseFromString(cleanedInput, 'text/html');
      const body = doc.body;

      if (body) {
        // Remove Word internal metadata
        const unwanted = body.querySelectorAll('style, xml, meta, link');
        for (const tag of unwanted) {
          tag.remove();
        }

        const allElements = body.querySelectorAll('*');
        for (const el of allElements) {
          const tagName = el.tagName.toLowerCase();

          // 1. Clean inline styles (remove font-family & font-size)
          let existingAlign: 'left' | 'center' | 'right' | 'justify' | null = null;
          if (el.hasAttribute('style')) {
            const rawStyle = el.getAttribute('style') || '';
            const kept: string[] = [];

            for (const declaration of rawStyle.split(';')) {
              const trimmed = declaration.trim();
              if (!trimmed) continue;
              const colonIndex = trimmed.indexOf(':');
              if (colonIndex === -1) continue;
              const prop = trimmed.slice(0, colonIndex).trim().toLowerCase();
              const val = trimmed.slice(colonIndex + 1).trim().toLowerCase();

              if (prop === 'text-align') {
                const alignment = val.match(/^(left|center|right|justify)\b/u)?.[1];
                existingAlign = alignment === 'left'
                  || alignment === 'center'
                  || alignment === 'right'
                  || alignment === 'justify'
                  ? alignment
                  : null;
                continue;
              }

              if (
                prop === 'font-family' ||
                prop === 'font-size' ||
                prop === '-webkit-text-size-adjust' ||
                prop.startsWith('mso-')
              ) {
                continue;
              }
              kept.push(trimmed);
            }

            if (kept.length > 0) {
              el.setAttribute('style', kept.join('; '));
            } else {
              el.removeAttribute('style');
            }
          }

          // 2. Remove legacy font tag face and size
          if (tagName === 'font') {
            el.removeAttribute('face');
            el.removeAttribute('size');
          }

          // 3. Remove Word specific attributes
          for (const attr of Array.from(el.attributes)) {
            const attrName = attr.name.toLowerCase();
            if (attrName.startsWith('mso-') || attrName.startsWith('v:')) {
              el.removeAttribute(attr.name);
            }
          }

          // 4. Apply intelligent alignment and bold styling
          if (/^h[1-6]$/u.test(tagName)) {
            appendStyle(el as HTMLElement, 'text-align: center');
            ensureElementBold(el as HTMLElement);
          } else if (tagName === 'p' || tagName === 'div' || tagName === 'blockquote') {
            const textContent = el.textContent?.trim() || '';
            if (textContent) {
              if (existingAlign) {
                appendStyle(el as HTMLElement, `text-align: ${existingAlign}`);
              } else if (isHeadingClass(el) || isHeadingText(textContent)) {
                appendStyle(el as HTMLElement, 'text-align: center');
                ensureElementBold(el as HTMLElement);
              } else {
                const isVerse = isVerseBlock(textContent, el.innerHTML);
                const align = isVerse ? 'center' : 'justify';
                appendStyle(el as HTMLElement, `text-align: ${align}`);
              }
            }
          }
          // Detect Word headings before dropping their document-specific classes.
          if (el.hasAttribute('class')) {
            const classes = withoutOfficeClasses(el.getAttribute('class') || '');
            if (classes) el.setAttribute('class', classes);
            else el.removeAttribute('class');
          }
        }

        return body.innerHTML;
      }
    } catch {
      // Fall through to regex cleaner below
    }
  }

  return cleanPastedHtmlRegex(html);
}

function appendStyle(el: HTMLElement, declaration: string) {
  const current = el.getAttribute('style') || '';
  const parts = current
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  parts.push(declaration);
  el.setAttribute('style', parts.join('; '));
}

export function cleanPastedHtmlRegex(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let cleaned = html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(style|xml|meta|link)\b[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/(<[a-z0-9-]+(?:\s+[^>]*)?)\s+style\s*=\s*(["'])([\s\S]*?)\2/giu, (_match, prefix, quote, styleContent) => {
      const kept = styleContent
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => {
          if (!s) return false;
          const colon = s.indexOf(':');
          if (colon === -1) return false;
          const prop = s.slice(0, colon).trim().toLowerCase();
          return (
            prop !== 'font-family' &&
            prop !== 'font-size' &&
            prop !== '-webkit-text-size-adjust' &&
            !prop.startsWith('mso-')
          );
        })
        .join('; ');
      return kept ? `${prefix} style=${quote}${kept}${quote}` : prefix;
    })
    .replace(/(<font\b[^>]*>)/giu, (_match, fontTag) => {
      return fontTag.replace(/\s+(?:face|size)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '');
    });

  // Handle h1 - h6 in regex mode
  cleaned = cleaned.replace(/<(h[1-6])(\s+[^>]*)?>([\s\S]*?)<\/\1>/giu, (_match, tag, rawAttrs = '', innerContent) => {
    let attrs = rawAttrs;
    if (/style\s*=\s*(["'])([\s\S]*?)\1/iu.test(attrs)) {
      attrs = attrs.replace(/(style\s*=\s*(["']))([\s\S]*?)\2/iu, (_m: string, pre: string, _q: string, styles: string) => {
        const cleanedStyles = styles
          .split(';')
          .map((s: string) => s.trim())
          .filter((s: string) => !s.toLowerCase().startsWith('text-align'))
          .concat('text-align: center')
          .filter(Boolean)
          .join('; ');
        return `${pre}${cleanedStyles}"`;
      });
    } else {
      attrs = `${attrs} style="text-align: center"`.trim();
    }

    const boldContent = /<(?:strong|b)\b/iu.test(innerContent) ? innerContent : `<strong>${innerContent.trim()}</strong>`;
    return `<${tag} ${attrs}>${boldContent}</${tag}>`;
  });

  // Apply default alignment & bolding to paragraphs in regex mode
  cleaned = cleaned.replace(/<p(\s+[^>]*)?>([\s\S]*?)<\/p>/giu, (match, rawAttrs = '', innerContent) => {
    const textOnly = innerContent.replace(/<[^>]+>/gu, '').trim();
    if (!textOnly) return match;

    if (/text-align\s*:\s*(?:left|center|right|justify)\b/iu.test(rawAttrs)) return match;

    const isHeading = isHeadingText(textOnly) || /\b(?:mso)?(?:heading|title)\d*\b/iu.test(rawAttrs);
    const isVerse = !isHeading && isVerseBlock(textOnly, innerContent);
    const align = isHeading || isVerse ? 'center' : 'justify';

    let attrs = rawAttrs;
    if (/style\s*=\s*(["'])([\s\S]*?)\1/iu.test(attrs)) {
      attrs = attrs.replace(/(style\s*=\s*(["']))([\s\S]*?)\2/iu, (_m: string, pre: string, _q: string, styles: string) => {
        const cleanedStyles = styles
          .split(';')
          .map((s: string) => s.trim())
          .filter((s: string) => !s.toLowerCase().startsWith('text-align'))
          .concat(`text-align: ${align}`)
          .filter(Boolean)
          .join('; ');
        return `${pre}${cleanedStyles}"`;
      });
    } else {
      attrs = `${attrs} style="text-align: ${align}"`.trim();
    }

    let formattedContent = innerContent;
    if (isHeading && !/<(?:strong|b)\b/iu.test(innerContent)) {
      formattedContent = `<strong>${innerContent.trim()}</strong>`;
    }

    return `<p ${attrs}>${formattedContent}</p>`;
  });

  // Restrict attribute cleanup to tags; preserve literal class="..." in text.
  return cleaned.replace(/<[a-z][^>]*>/giu, tag => tag.replace(
    /\s+class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu,
    (_match, doubleQuoted, singleQuoted, unquoted) => {
      const classes = withoutOfficeClasses(doubleQuoted ?? singleQuoted ?? unquoted ?? '');
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return classes ? ` class=${quote}${classes}${quote}` : '';
    },
  ));
}

/**
 * Converts raw plain text into HTML paragraphs with intelligent alignment & bolding:
 * - Headings (all caps or prefixed e.g. ĐOẠN VI, CHƯƠNG I) -> <p style="text-align: center"><strong>...</strong></p>
 * - Short verse lines (like chanting poems) -> <p style="text-align: center">...</p>
 * - Continuous prose paragraphs -> <p style="text-align: justify">...</p>
 */
export function formatPlainTextToHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const rawBlocks = text.split(/\r?\n\r?\n/u);
  const paragraphs: string[] = [];

  for (const block of rawBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const lines = trimmedBlock
      .split(/\r?\n/u)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    for (const line of lines) {
      if (isHeadingText(line)) {
        paragraphs.push(`<p style="text-align: center"><strong>${escapeHtml(line)}</strong></p>`);
      } else if (isVerseLine(line)) {
        paragraphs.push(`<p style="text-align: center">${escapeHtml(line)}</p>`);
      } else {
        paragraphs.push(`<p style="text-align: justify">${escapeHtml(line)}</p>`);
      }
    }
  }

  return paragraphs.join('');
}
