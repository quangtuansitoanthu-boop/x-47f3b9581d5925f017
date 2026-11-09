import type { ContentArticlePage, ContentCatalogPage, ContentRow, ContentSize, ContentUpdateItem } from '../../contracts/content-updates';
import { contentVersion, updateGroup } from '../../domain/content-update-model';
import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import { parseJsonFields, resolveMediaReferences, sanitizeStoredHtml } from '../domain/content';
import { ServerInputError } from '../errors';
import { createContentUpdatesRepository, UPDATE_PAGE_SIZE, type CatalogCursor } from '../repositories/content-updates-repository';

function row(value: D1ResultRow): ContentRow { return { ...value, id: String(value.id) }; }
export function contentUpdateIds(value: string | null): string[] {
  const ids = [...new Set((value ?? '').split(',').filter(Boolean))];
  if (!ids.length || ids.length > 40 || ids.some(id => !/^[\p{L}\p{N}_.:-]{1,200}$/u.test(id))) {
    throw new ServerInputError(400, 'invalid_content_ids', 'Danh sách nội dung không hợp lệ.');
  }
  return ids;
}

export function createContentUpdatesService(env: CloudflareEnvLike) {
  const repository = createContentUpdatesRepository(env);
  const shape = (value: D1ResultRow) => resolveMediaReferences(row(value), env.MEDIA_PUBLIC_BASE_URL);
  return {
    async catalog(url: URL): Promise<ContentCatalogPage> {
      const read = async (kind: 'article' | 'talk') => {
        const name = kind === 'article' ? 'articles' : 'talks';
        if (url.searchParams.get(`${name}Done`) === '1') return { items: [], next: null };
        const encoded = url.searchParams.get(`${name}After`);
        let after: CatalogCursor | null = null;
        if (encoded) {
          let decoded: unknown;
          try { decoded = JSON.parse(encoded); } catch { throw new ServerInputError(400, 'invalid_cursor', 'Mốc cập nhật không hợp lệ.'); }
          if (!Array.isArray(decoded) || decoded.length !== 2 || (decoded[0] !== null && (typeof decoded[0] !== 'string' || decoded[0].length > 100))
            || typeof decoded[1] !== 'string' || decoded[1].length > 200) throw new ServerInputError(400, 'invalid_cursor', 'Mốc cập nhật không hợp lệ.');
          after = { date: decoded[0], id: decoded[1] };
        }
        const source = await repository[name](after);
        const page = source.slice(0, UPDATE_PAGE_SIZE);
        const items: ContentUpdateItem[] = [];
        for (const raw of page) {
          const value = kind === 'talk' ? parseJsonFields(shape(raw), ['tracks']) : shape(raw);
          const group = updateGroup(value, kind);
          if (!group) continue;
          items.push({ kind, group, mode: group === 'pdf' || group === 'talk' ? 'shell' : 'full',
            row: value, version: await contentVersion(value, kind) });
        }
        const last = page.at(-1);
        return { items, next: source.length > UPDATE_PAGE_SIZE && last ? JSON.stringify([last.created_at ?? null, String(last.id)]) : null };
      };
      const [articles, talks] = await Promise.all([read('article'), read('talk')]);
      return { items: [...articles.items, ...talks.items], articlesNext: articles.next, talksNext: talks.next };
    },
    async estimate(ids: string[]): Promise<ContentSize[]> {
      return (await repository.estimate(ids)).map(value => ({ id: String(value.id), bytes: Number(value.bytes) || 0,
        chapters: Number(value.chapters), illustrated: Boolean(value.illustrated) }));
    },
    async article(id: string, after: number | null, version: string): Promise<ContentArticlePage> {
      const raw = (await repository.article(id, after === null))[0];
      if (!raw) throw new ServerInputError(404, 'content_unavailable', 'Nội dung không còn khả dụng.');
      const article = parseJsonFields(shape(raw), ['tap_tieu_de']);
      const group = updateGroup(article, 'article');
      if (!group || group === 'pdf') throw new ServerInputError(403, 'content_not_downloadable', 'Nội dung này không thuộc gói tải đầy đủ.');
      if (version && await contentVersion(article, 'article') !== version) {
        throw new ServerInputError(409, 'content_changed', 'Nội dung vừa thay đổi. Vui lòng kiểm tra cập nhật lại.');
      }
      article.noi_dung = sanitizeStoredHtml(article.noi_dung);
      const source = await repository.chapters(id, after ?? -2147483648);
      const chapters: ContentRow[] = source.slice(0, 10).map(value => ({ ...row(value), noi_dung: sanitizeStoredHtml(value.noi_dung) }));
      return { article, chapters, next: source.length > 10 ? Number(chapters.at(-1)!.so_thu_tu) : null };
    },
  };
}
