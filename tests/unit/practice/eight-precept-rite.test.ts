import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EIGHT_RECEIVING_RITE, EIGHT_RELINQUISHING_RITE, type RiteBlock } from '../../../src/lib/content/eight-precept-rite';

const source = readFileSync(new URL('./fixtures/eight-precept-rite-source.txt', import.meta.url), 'utf8');
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const textOf = (blocks: readonly RiteBlock[]) => blocks.map(block => block.kind === 'verse' ? block.lines.map(line => line[0]).join('\n') : block.text[0]).join('\n');

describe('complete eight-precept rite supplied by the user', () => {
  it('keeps all eight complete Vietnamese vows and the five-recollections commitment', () => {
    const paragraphs = source.split(/\r?\n\s*\r?\n/).map(normalize).filter(paragraph => paragraph.startsWith('Đệ tử thề giữ theo đúng trong Giới Kinh dạy:'));
    expect(paragraphs).toHaveLength(9);
    const displayed = normalize(textOf(EIGHT_RECEIVING_RITE));
    for (const paragraph of paragraphs) expect(displayed).toContain(paragraph);
  });

  it('preserves every supplied reading and bowing direction, including repeated instructions', () => {
    const directions = (value: string) => [...value.matchAll(/\([^()]*\)/g)]
      .map(match => normalize(match[0]))
      .filter(value => /(?:\d|đọc|lạy|xá|xướng|Trong Ngày)/i.test(value));
    const expected = directions(source);
    const actual = directions(textOf([...EIGHT_RECEIVING_RITE, ...EIGHT_RELINQUISHING_RITE]));
    const counts = (values: string[]) => values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
    expect(counts(actual)).toEqual(counts(expected));
    expect(actual).toEqual(expected);
  });

  it('preserves the full verse structure and the already-Vietnamese repentance', () => {
    for (const [blocks, id, count] of [
      [EIGHT_RECEIVING_RITE, 'offering-verse', 12],
      [EIGHT_RECEIVING_RITE, 'repentance-verse', 4],
      [EIGHT_RECEIVING_RITE, 'dedication-verse', 16],
      [EIGHT_RELINQUISHING_RITE, 'praise-verse', 8],
    ] as const) {
      const block = blocks.find(block => block.id === id);
      expect(block?.kind).toBe('verse');
      if (block?.kind === 'verse') expect(block.lines).toHaveLength(count);
    }
    const repentance = source.match(/BÀI SÁM HỐI\s+([\s\S]*?)\s*\(Đọc 3 lần/);
    expect(repentance).not.toBeNull();
    const block = EIGHT_RECEIVING_RITE.find(block => block.id === 'repentance-verse');
    if (block?.kind === 'verse') expect(block.lines.map(line => normalize(line[0]))).toEqual(repentance![1].split(/\r?\n/).map(normalize).filter(Boolean));
  });

  it('includes the three refuge prayers and all three closing homage prayers', () => {
    for (const id of ['refuge-1', 'refuge-2', 'refuge-3']) expect(EIGHT_RECEIVING_RITE.some(block => block.id === id)).toBe(true);
    for (const id of ['gratitude-1', 'gratitude-2', 'gratitude-3', 'conclude-depart']) expect(EIGHT_RELINQUISHING_RITE.some(block => block.id === id)).toBe(true);
    for (const block of [...EIGHT_RECEIVING_RITE, ...EIGHT_RELINQUISHING_RITE]) {
      const texts = block.kind === 'verse' ? block.lines : [block.text];
      for (const pair of texts) for (const value of pair) expect(value.trim()).not.toBe('');
    }
  });
});
