import { expect, it } from 'vitest';
import diaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';
import { compareCopy, normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';

it('does not report Nguyện xin or other correct words as extra in a partially copied prayer', () => {
  const source = diaTang.chapters[0].blocks[0];
  const words = normalizeCopyText(source).split(' ');
  for (let length = 1; length <= words.length; length++) {
    expect(compareCopy(source, words.slice(0, length).join('\n'), false).issues, `prefix ${length}`).toEqual([]);
  }
});
