import { describe, expect, it } from 'vitest';
import { copyingSentences, activeCopyWord } from '../../../src/lib/domain/practice/copying-follow';
import { formatTypedCopy } from '../../../src/lib/domain/practice/copying-typed-format';
import diaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';
import layouts from '../../../src/lib/data/scripture-copying/layouts.json';
import { copySourceLayoutLines } from '../../../src/lib/domain/practice/copying-formatting';
import { normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';

describe('formatting the typed copy', () => {
  it('keeps Nguyện xin in one source paragraph when the repeated Nguyện is omitted at the boundary', () => {
    const block = diaTang.chapters[0].blocks[0];
    const source = copyingSentences([block], 0, copySourceLayoutLines(block, layouts['dia-tang'][0][0]));
    const typed = normalizeCopyText(block).split('nguyện xin')[0].trimEnd() + ' xin các vị gia hộ cho con:';
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect(runs.at(-1)).toMatchObject({ line: 4 });
    expect(runs.at(-1)?.text.trim()).toBe('nguyện xin các vị gia hộ cho con:');
  });

  it('preserves both Nguyện words and their separate paragraphs in a correctly copied prayer', () => {
    const source = copyingSentences(['Bồ Tát Bổn Nguyện.\n{align:left|Nguyện xin các vị gia hộ cho con:}'], 0);
    const typed = 'Bồ Tát Bổn Nguyện. Nguyện xin các vị gia hộ cho con:';
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect(runs).toEqual([
      { text: 'Bồ Tát Bổn Nguyện. ', bold: false, align: 'justify', line: 0 },
      { text: 'Nguyện xin các vị gia hộ cho con:', bold: false, align: 'left', line: 1 },
    ]);
  });

  it('keeps the phrase together while xin is still being typed, including decomposed accents', () => {
    const source = copyingSentences(['Bồ Tát Bổn Nguyện.\n{align:left|Nguyện xin các vị gia hộ cho con:}'], 0);
    for (const suffix of ['x', 'xi', 'xin']) for (const normalization of ['NFC', 'NFD'] as const) {
      const typed = `Bồ Tát Bổn Nguyện ${suffix}`.normalize(normalization);
      const runs = formatTypedCopy(source, typed);
      expect(runs.map(run => run.text).join('')).toBe(typed);
      expect(runs.at(-1)).toMatchObject({ text: `Nguyện ${suffix}`.normalize(normalization), line: 1, align: 'left' });
    }
  });

  it('does not move a repeated word across an explicit sentence ending or typed instruction', () => {
    const source = copyingSentences(['Bồ Tát Bổn Nguyện.\n{align:left|Nguyện xin các vị gia hộ cho con:}'], 0);
    for (const typed of ['Bồ Tát Bổn Nguyện. xin', 'Bồ Tát Bổn Nguyện (xin) Nguyện xin']) {
      const runs = formatTypedCopy(source, typed);
      expect(runs.map(run => run.text).join('')).toBe(typed);
      expect(runs[0]).toMatchObject({ line: 0 });
      expect(runs[0].text).toContain('Bồ Tát Bổn Nguyện');
    }
  });

  it('keeps sentences in their original justified paragraph instead of creating a paragraph per sentence', () => {
    const text = 'Con thành tâm đảnh lễ. Nguyện giữ tâm thanh tịnh.';
    const source = copyingSentences(['{align:center|**Lời nguyện**}\n{align:justify|' + text + '}'], 0);
    expect(source).toHaveLength(3);
    const typed = 'Lời nguyện ' + text;
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect([...new Set(runs.map(run => run.line))]).toEqual([0, 1]);
    expect(runs.at(-1)).toMatchObject({ align: 'justify', bold: false, line: 1 });
  });
  it('applies centered bold headings and normal body without rewriting user input', () => {
    const source = copyingSentences(['{align:center|**NAM MÔ PHẬT**}\n{align:left|Lời kinh ở đây.}'], 0);
    const typed = 'nam mô phật\nLời kinh ở đây';
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect(runs[0]).toMatchObject({ align: 'center', bold: true });
    expect(runs.at(-1)).toMatchObject({ align: 'left', bold: false });
  });
  it('skips optional notes and retains typed punctuation, case and accents', () => {
    const source = copyingSentences(['{align:center|**Nam mô Phật** (3 lần)}\nLời kinh.'], 0);
    const typed = 'NAM MÔ PHẬT! Lời kinh';
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect(runs.at(-1)?.bold).toBe(false);
  });
  it('does not let copied instructions shift the following body into heading formatting', () => {
    const source = copyingSentences(['{align:center|**Nam mô Phật** (đọc chậm 3 lần)}\n{align:left|Con nguyện giữ tâm thanh tịnh.}'], 0);
    const typed = 'Nam mô Phật (đọc chậm 3 lần) Con nguyện giữ tâm';
    const runs = formatTypedCopy(source, typed);
    expect(runs.map(run => run.text).join('')).toBe(typed);
    expect(runs.at(-1)).toMatchObject({ text: 'Con nguyện giữ tâm', bold: false, align: 'left' });
  });
  it('tracks words within a long sentence rather than only its start', () => {
    const source = copyingSentences(['Nam mô Phật. Con tự biết thân tâm còn nhiều nghiệp chướng.'], 0);
    expect(activeCopyWord(source, 'nam mô phật con tự biết thân tâm còn nhiều')).toBe(6);
    expect(activeCopyWord(source, 'nam mô phật con tự')).toBe(1);
  });
  it('never splits a parenthetical instruction into mandatory sentences', () => {
    const source = copyingSentences(['Sám hối (Thanh tịnh. Xin chú ý.) Nam mô Phật. Câu sau.'], 0);
    expect(source).toHaveLength(2);
    expect(activeCopyWord(source, 'sám hối nam mô')).toBe(3);
  });
});
