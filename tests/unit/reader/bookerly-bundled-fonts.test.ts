import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const faces = [
  { file: 'bookerly-regular.ttf', style: 'Regular', weight: 400, italic: false, hash: '5db64039fd7cfe1eca01fec76814aa2c6191bc627e53e2c67e8acc9e88bf8c73' },
  { file: 'bookerly-italic.ttf', style: 'Italic', weight: 400, italic: true, hash: '6e364837e08fa89c0fed287a13c7149567ab5657847f666e45e523ecc9c7820b' },
  { file: 'bookerly-bold.ttf', style: 'Bold', weight: 700, italic: false, hash: '1891ef97a20936f202b5c099bb2ed1556cce23585dd19761ded04e612fe52fce' },
  { file: 'bookerly-bold-italic.ttf', style: 'Bold Italic', weight: 700, italic: true, hash: '029424e0715dbce8502a156b6df84533dcca3b93097782431c3058a5f1ac3445' },
];

function fontMetadata(bytes: Buffer) {
  const tables = new Map<string, number>();
  for (let index = 0; index < bytes.readUInt16BE(4); index += 1) {
    const record = 12 + index * 16;
    tables.set(bytes.toString('ascii', record, record + 4), bytes.readUInt32BE(record + 8));
  }
  const name = tables.get('name')!;
  const os2 = tables.get('OS/2')!;
  const storage = name + bytes.readUInt16BE(name + 4);
  const names = new Map<number, string[]>();
  for (let index = 0; index < bytes.readUInt16BE(name + 2); index += 1) {
    const record = name + 6 + index * 12;
    const platform = bytes.readUInt16BE(record);
    if (platform !== 0 && platform !== 3) continue;
    const length = bytes.readUInt16BE(record + 8);
    const offset = storage + bytes.readUInt16BE(record + 10);
    let value = '';
    for (let position = 0; position < length; position += 2) value += String.fromCharCode(bytes.readUInt16BE(offset + position));
    const id = bytes.readUInt16BE(record + 6);
    names.set(id, [...(names.get(id) ?? []), value]);
  }
  return { names, tables, weight: bytes.readUInt16BE(os2 + 4), embeddingFlags: bytes.readUInt16BE(os2 + 8), italic: (bytes.readUInt16BE(os2 + 62) & 1) !== 0 };
}

function hasGlyph(bytes: Buffer, cmap: number, codePoint: number): boolean {
  for (let index = 0; index < bytes.readUInt16BE(cmap + 2); index += 1) {
    const subtable = cmap + bytes.readUInt32BE(cmap + 4 + index * 8 + 4);
    const format = bytes.readUInt16BE(subtable);
    if (format === 12) {
      for (let group = 0; group < bytes.readUInt32BE(subtable + 12); group += 1) {
        const record = subtable + 16 + group * 12;
        const start = bytes.readUInt32BE(record);
        if (codePoint >= start && codePoint <= bytes.readUInt32BE(record + 4)
          && bytes.readUInt32BE(record + 8) + codePoint - start !== 0) return true;
      }
    }
    if (format !== 4 || codePoint > 0xffff) continue;
    const count = bytes.readUInt16BE(subtable + 6) / 2;
    const ends = subtable + 14;
    const starts = ends + count * 2 + 2;
    const deltas = starts + count * 2;
    const ranges = deltas + count * 2;
    for (let segment = 0; segment < count; segment += 1) {
      const start = bytes.readUInt16BE(starts + segment * 2);
      if (codePoint < start || codePoint > bytes.readUInt16BE(ends + segment * 2)) continue;
      const delta = bytes.readInt16BE(deltas + segment * 2);
      const range = bytes.readUInt16BE(ranges + segment * 2);
      if (!range && ((codePoint + delta) & 0xffff) !== 0) return true;
      if (range) {
        const glyph = bytes.readUInt16BE(ranges + segment * 2 + range + (codePoint - start) * 2);
        if (glyph && ((glyph + delta) & 0xffff) !== 0) return true;
      }
    }
  }
  return false;
}

describe('self-contained Bookerly reader fonts', () => {
  it.each(faces)('serves the genuine $style face from its bundled URL without changing the font file', (face) => {
    const css = readFileSync('src/lib/styles/master-shell.css', 'utf8');
    const declaration = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)]
      .map(match => match[1]).find(block => block.includes(`/fonts/bookerly/${face.file}`));
    expect(declaration).toBeDefined();
    // URL đứng trước để máy không cài font vẫn nhận đúng face, không dựa vào local().
    expect(declaration).toMatch(/src:\s*url\(/);
    expect(declaration).toContain(`font-weight: ${face.weight}`);
    expect(declaration).toContain(`font-style: ${face.italic ? 'italic' : 'normal'}`);
    const bytes = readFileSync(`static/fonts/bookerly/${face.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(face.hash);
    const metadata = fontMetadata(bytes);
    expect(metadata.names.get(1)).toContain('Bookerly');
    expect(metadata.names.get(2)).toContain(face.style);
    expect(metadata.weight).toBe(face.weight);
    expect(metadata.italic).toBe(face.italic);
    expect(metadata.embeddingFlags).toBe(0);
    expect(metadata.names.get(0)?.some(value => value.includes('Copyright 2014 Dalton Maag Ltd.'))).toBe(true);
    expect(metadata.names.get(14)).toContain('http://www.daltonmaag.com/eula');
    const vietnameseAndQuotes = [0x0110, 0x0111, 0x201c, 0x201d,
      ...Array.from({ length: 0x1ef9 - 0x1ea0 + 1 }, (_, index) => 0x1ea0 + index)];
    expect(vietnameseAndQuotes.filter(codePoint => !hasGlyph(bytes, metadata.tables.get('cmap')!, codePoint)))
      .toEqual([]);
  });
});
