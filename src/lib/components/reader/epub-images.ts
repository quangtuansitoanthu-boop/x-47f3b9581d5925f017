import { createEpub, type EpubChapter, type EpubImage } from './epub';
import { renderReaderContent } from './content-renderer';
import { throwIfAborted } from '$lib/browser/abort-signal';
import { fetchWithDeadline } from '$lib/browser/network-deadline';

/** Prepare offline XHTML and image resources only when the reader requests an export. */
export async function createEpubWithImages(
  title: string, author: string, content: string, chapters: EpubChapter[], signal: AbortSignal,
): Promise<Blob> {
  const sections = [...(content.trim() ? [{ title, content }] : []), ...chapters];
  if (!sections.length) throw new Error('Sách chưa có nội dung để tải.');
  const documents = sections.map((section) => new DOMParser().parseFromString(renderReaderContent(section.content), 'text/html'));
  const sources = new Map<string, HTMLImageElement[]>();
  for (const document of documents) {
    document.querySelectorAll('script,iframe,object,embed,style,link,source').forEach((node) => node.remove());
    for (const element of document.body.querySelectorAll('*')) {
      for (const attribute of [...element.attributes]) {
        if (/^on/i.test(attribute.name) || attribute.name === 'srcset') element.removeAttribute(attribute.name);
      }
    }
    for (const img of document.images) {
      const src = img.getAttribute('src');
      if (!src) throw new Error('Có ảnh thiếu đường dẫn. Vui lòng kiểm tra nội dung sách.');
      const url = new URL(src, location.href);
      if (!['https:', 'http:', 'data:', 'blob:'].includes(url.protocol)) throw new Error('Đường dẫn ảnh không được hỗ trợ.');
      url.hash = '';
      sources.set(url.href, [...(sources.get(url.href) ?? []), img]);
    }
  }
  const entries = [...sources];
  const images: EpubImage[] = new Array(entries.length);
  const failed = new AbortController();
  const abort = () => failed.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const imageSignal = failed.signal;
  let next = 0;
  try {
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (next < entries.length) {
      const index = next++;
      const [url, nodes] = entries[index];
      throwIfAborted(imageSignal);
      try {
        const response = await fetchWithDeadline(url, { signal: imageSignal, credentials: new URL(url).origin === location.origin ? 'same-origin' : 'omit' }, 60_000);
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}`);
        }
        let blob = await response.blob();
        // Decode first: an HTML error page or corrupt image must not produce an incomplete book.
        const bitmap = await createImageBitmap(blob);
        try {
          if (!['image/jpeg', 'image/png', 'image/gif'].includes(blob.type)) {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
            let transparent = false;
            for (let alpha = 3; alpha < pixels.length; alpha += 4) {
              if (pixels[alpha] !== 255) { transparent = true; break; }
            }
            // Keep transparency, but avoid inflating hundreds of opaque WebP photos into PNGs.
            const type = transparent ? 'image/png' : 'image/jpeg';
            blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image conversion failed')), type, 0.9));
            canvas.width = canvas.height = 0;
          }
        } finally { bitmap.close(); }
        throwIfAborted(imageSignal);
        const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/gif' ? 'gif' : 'png';
        const name = `images/image-${index}.${extension}`;
        images[index] = { name, mediaType: blob.type, data: new Uint8Array(await blob.arrayBuffer()) };
        for (const node of nodes) {
          node.setAttribute('src', name);
          if (!node.hasAttribute('alt')) node.setAttribute('alt', '');
          node.removeAttribute('loading');
          node.setAttribute('style', 'max-width:100%;height:auto');
        }
      } catch (cause) {
        throwIfAborted(signal);
        failed.abort();
        throw new Error(`Không thể đóng gói ảnh ${index + 1}/${entries.length}. Vui lòng kiểm tra kết nối và thử tải EPUB lại.`, { cause });
      }
    }
  }));
  } finally {
    signal.removeEventListener('abort', abort);
  }
  throwIfAborted(signal);
  const serializer = new XMLSerializer();
  return createEpub(title, author, '', sections.map((section, index) => ({
    title: section.title,
    content: [...documents[index].body.childNodes].map((node) => serializer.serializeToString(node)).join(''),
  })), images);
}
