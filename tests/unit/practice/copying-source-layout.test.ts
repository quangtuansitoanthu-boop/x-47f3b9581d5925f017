import { expect, it } from 'vitest';
import diaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';
import phapHoa from '../../../src/lib/data/scripture-copying/phap-hoa.json';
import langNghiem from '../../../src/lib/data/scripture-copying/lang-nghiem.json';
import layouts from '../../../src/lib/data/scripture-copying/layouts.json';
import { copySourceLayoutLines, copySourceText } from '../../../src/lib/domain/practice/copying-formatting';

it('keeps every existing block character and edition while restoring canonical layout', () => {
  for (const book of [diaTang, phapHoa, langNghiem]) {
    book.chapters.forEach((chapter, index) => chapter.blocks.forEach((block, selected) => {
      const layout = layouts[book.id as keyof typeof layouts][index][selected];
      const lines = copySourceLayoutLines(block, layout);
      expect(lines.flatMap(line => line.parts).map(part => part.text).join('')).toBe(copySourceText(block));
    }));
  }
});

it('does not extend a centered bold heading over the prayer body', () => {
  const lines = copySourceLayoutLines(diaTang.chapters[0].blocks[0], layouts['dia-tang'][0][0]);
  expect(lines[0]).toMatchObject({ align: 'center', parts: [{ text: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', bold: true }] });
  expect(lines[2].align).toBe('justify');
  expect(lines[2].parts.every(part => !part.bold)).toBe(true);
});
