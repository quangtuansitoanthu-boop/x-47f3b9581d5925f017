import bundledRituals from '$lib/data/bundled-english-rituals.json';
import { fetchEnglishChapters } from './english-pack';

export async function loadBundledPracticeMantra(id: string, locale: 'vi' | 'en') {
  if (!bundledRituals.includes(`${id}.json`)) return null;
  const { default: articles } = await import('$lib/data/bundled-mantra-content.json');
  const bundled = articles.find(article => article.detail.id === id);
  if (!bundled || locale === 'vi') return bundled ?? null;
  const response = await fetchEnglishChapters(`/offline-data/chapters-en/${encodeURIComponent(id)}.json`);
  if (!response.ok) return null;
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const chapters = rows.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.noi_dung !== 'string' || typeof row.tieu_de !== 'string') return null;
    return { id: String(row.id ?? index), bai_viet_id: id,
      so_thu_tu: typeof row.so_thu_tu === 'number' ? row.so_thu_tu : index,
      tieu_de: row.tieu_de, tom_tat: typeof row.tom_tat === 'string' ? row.tom_tat : '', noi_dung: row.noi_dung };
  });
  if (chapters.some(row => row === null)) return null;
  const validChapters = chapters.filter(row => row !== null);
  return { detail: { ...bundled.detail, content: '', tocTitles: validChapters.map(row => row.tieu_de) }, chapters: validChapters };
}
