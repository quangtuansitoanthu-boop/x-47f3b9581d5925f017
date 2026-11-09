import { describe, expect, it } from 'vitest';
import { isMissionBook, missionImageSources, withMissionImages } from '../../../src/lib/browser/mission-book-images';
import manifest from '../../../src/lib/data/mission-book-images.json';

describe('optional Mission illustrations', () => {
  const source = manifest.images[0].path;
  const html = `<p>Giữ nguyên nội dung</p><img alt="Minh họa" src="${source}"><img src="/covers/other.webp">`;
  it('matches only this book, including legacy book ids', () => {
    expect(isMissionBook(manifest.bookId)).toBe(true);
    expect(isMissionBook('book_' + manifest.bookId)).toBe(true);
    expect(isMissionBook('other')).toBe(false);
  });
  it('keeps text and other images while blocking unapproved illustration requests', () => {
    const result = withMissionImages(html, new Map());
    expect(result).toContain('Giữ nguyên nội dung');
    expect(result).not.toContain(source);
    expect(result).toContain('/covers/other.webp');
    expect(missionImageSources(html)).toEqual([source]);
  });
  it('renders only locally cached image URLs without changing source data', () => {
    expect(withMissionImages(html, new Map([[source, 'blob:cached-image']]))).toContain('src="blob:cached-image"');
    expect(html).toContain(source);
  });
  it('also blocks and resolves the English remote illustration URLs', () => {
    const remote = source.replace('/assets/book-content/', 'https://media.quangtu.vn/content/');
    expect(missionImageSources(`<img src="${remote}">`)).toEqual([source]);
    expect(withMissionImages(`<img src="${remote}">`, new Map())).toBe('');
    expect(withMissionImages(`<img src="${remote}">`, new Map([[source, 'blob:english']]))).toContain('blob:english');
  });
});
