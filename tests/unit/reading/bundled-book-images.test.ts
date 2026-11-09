import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderPracticeContent } from '../../../src/lib/domain/practice/content';

describe('offline Mission of Guiding the Departed illustrations', () => {
  it('ships all chapter images as decodable local WebP assets', () => {
    const chapters = JSON.parse(readFileSync('static/offline-data/chapters/tt_1781081372340_1_xqcxo.json', 'utf8')) as { id: number; so_thu_tu: number; noi_dung: string }[];
    expect(chapters).toHaveLength(51);
    expect(new Set(chapters.map(chapter => chapter.id)).size).toBe(51);
    const sources = new Set(chapters.flatMap(chapter => [...chapter.noi_dung.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1])));
    expect(sources.size).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).toMatch(/^\/assets\/book-content\/smdv-[a-f0-9]+\/[a-z0-9-]+\.webp$/);
      const bytes = readFileSync('.' + source);
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
      expect(renderPracticeContent('![](' + source + ')')).toContain('src="' + source + '"');
    }
  });
});
