import { browser } from '$app/environment';

export interface PracticeDedicationTemplate { id: string; title: string; text: string }

const SOURCES = [
  { book: 'tt_1781274943336', chapter: '2343', title: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI' },
  { book: 'tt_1781275267452', chapter: '1958', title: 'NGHI THỨC TRÌ TỤNG THẦN CHÚ THỦ LĂNG NGHIÊM' },
  { book: 'tt_1780910773084', chapter: '13618', title: 'KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN' },
] as const;

/** Preserve the bundled source wording and paragraph/verse boundaries in the editable copy. */
export function extractDedicationText(content: string, wholeChapter = false): string {
  if (!browser) return '';
  let section = content;
  if (!wholeChapter) {
    const heading = /\{align:(?:center|justify)\|\*\*HỒI HƯỚNG\*\*\}/u.exec(content);
    if (!heading || heading.index === undefined) throw new Error('dedication_section_missing');
    section = content.slice(heading.index);
    const note = section.indexOf('{align:justify|**Ghi chú:**}');
    if (note >= 0) section = section.slice(0, note);
  }
  const container = document.createElement('div');
  container.innerHTML = section.replace(/\{align:(?:center|justify|left|right)\|([^{}]*)\}/gu, '$1\n');
  container.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
  container.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  container.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6').forEach(node => node.append('\n'));
  return (container.textContent ?? '').replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/_([^_]+)_/gu, '$1').replace(/\(C\)/gu, '')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n\n');
}

let pending: Promise<PracticeDedicationTemplate[]> | undefined;

/** Three bundled static files, once per page lifetime; no API, auth, D1 or remote fallback. */
export async function loadPracticeDedicationTemplates(fetcher: typeof fetch = fetch): Promise<PracticeDedicationTemplate[]> {
  if (!browser) return [];
  if (!pending) {
    pending = Promise.all(SOURCES.map(async source => {
      const response = await fetcher(`/offline-data/chapters/${source.book}.json`, { cache: 'force-cache' });
      if (!response.ok) throw new Error('dedication_source_unavailable');
      const chapters: unknown = await response.json();
      if (!Array.isArray(chapters)) throw new Error('dedication_source_invalid');
      const chapter = chapters.find(item => item && typeof item === 'object' && String(item.id) === source.chapter);
      if (!chapter || typeof chapter.noi_dung !== 'string') throw new Error('dedication_chapter_missing');
      const text = extractDedicationText(chapter.noi_dung, source.chapter === '13618');
      if (!text) throw new Error('dedication_text_missing');
      return { id: `${source.book}:${source.chapter}`, title: source.title, text };
    }));
    try { return await pending; }
    catch (cause) { pending = undefined; throw cause; }
  }
  return pending;
}
