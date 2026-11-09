import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { copyingSentences } from '../../../src/lib/domain/practice/copying-follow';
import { alignGhostRuns, formatGhostRuns, clipGhostRuns, nextGhostTraceText } from '../../../src/lib/domain/practice/copying-ghost-format';

describe('formatGhostRuns', () => {
  it.each(['X', 'LỜI NGUYỆN\nCon thàmh tâm'])('lays out an imperfect raw prefix %j with the reference tail without changing either input', typed => {
    const reference = formatGhostRuns(copyingSentences(['{align:center|**LỜI NGUYỆN**}\n{align:justify|Con thành tâm đảnh lễ chư Phật.}'], 0));
    const original = JSON.stringify(reference);
    const canonical = reference.map(run => run.text).join('');
    const display = alignGhostRuns(reference, typed);
    expect(display).not.toBeNull();
    expect(display!.map(run => run.text).join('')).toBe(typed + canonical.slice(typed.length));
    expect(display![0]).toMatchObject({ bold: true, align: 'center', line: 0 });
    expect(display!.at(-1)).toMatchObject({ bold: false, align: 'justify', line: 1 });
    expect(JSON.stringify(reference)).toBe(original);
  });
  it('converts copyingSentences into ghost runs preserving bold, align and paragraph line numbers', () => {
    const sentences = copyingSentences([
      '{align:center|**Nam mô Phật.**}\n{align:justify|Nguyện tâm thanh tịnh! Lời kinh vô lượng.}',
    ], 0);

    const runs = formatGhostRuns(sentences);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs[0]).toEqual({
      text: 'Nam mô Phật.',
      bold: true,
      align: 'center',
      line: 0,
    });

    const fullText = runs.map(r => r.text).join('');
    expect(fullText).toContain('Nam mô Phật.');
    expect(fullText).toContain('Nguyện tâm thanh tịnh! Lời kinh vô lượng.');
  });

  it('handles empty sentences gracefully', () => {
    expect(formatGhostRuns([])).toEqual([]);
  });

  it('keeps a separator between styled paragraphs so tracing never joins their words', () => {
    const sentences = copyingSentences(['{align:center|**NAM MÔ**}\n{align:justify|A DI ĐÀ. Lời nguyện tiếp theo.}'], 0);
    const runs = formatGhostRuns(sentences);
    const canonical = runs.map(run => run.text).join('');
    expect(canonical).toBe('NAM MÔ\nA DI ĐÀ. Lời nguyện tiếp theo.');
    expect(runs.find(run => run.text.includes('A DI ĐÀ'))).toMatchObject({ align: 'justify', bold: false });
    expect(nextGhostTraceText(canonical, 'NAM MÔ', { key: 'a' })).toBe('NAM MÔ\nA');
    expect(clipGhostRuns(runs, 7).map(run => run.text).join('')).toBe('A DI ĐÀ. Lời nguyện tiếp theo.');
  });

  it('clips ghost runs accurately for pagination without altering formatting', () => {
    const sentences = copyingSentences([
      '{align:justify|Đoạn văn thứ nhất dài vừa đủ để kiểm tra chia trang.}',
    ], 0);
    const fullRuns = formatGhostRuns(sentences);
    const totalLength = fullRuns.reduce((sum, r) => sum + r.text.length, 0);

    const page1 = clipGhostRuns(fullRuns, 0, 10);
    const page2 = clipGhostRuns(fullRuns, 10, totalLength);

    expect(page1.map(r => r.text).join('')).toBe(fullRuns.map(r => r.text).join('').slice(0, 10));
    expect(page2.map(r => r.text).join('')).toBe(fullRuns.map(r => r.text).join('').slice(10));
  });

  it.each(['NFC', 'NFD'] as const)('keeps the second-page ghost at the raw draft offset for %s Vietnamese text', normalization => {
    const source = readFileSync('src/routes/tu-tap/chep-kinh/+page.svelte', 'utf8');
    const body = source.match(/const ghostRuns = \$derived\.by\(\(\) => \{([\s\S]*?)\n  \}\);/u)?.[1];
    expect(body).toBeTruthy();
    // Chạy chính phép chọn trang của route; không dựng mô hình đã sửa riêng trong test.
    const selectPage = new Function('fullGhostRuns', 'text', 'editorPages', 'editorPage', 'ghostEnabled', 'continuousScroll', 'clipGhostRuns', 'alignGhostRuns', body!);
    const fullRuns = formatGhostRuns(copyingSentences([
      '{align:center|**LỜI NGUYỆN**}\n{align:justify|Con thành tâm đảnh lễ chư Phật.}',
    ], 0));
    const heading = 'lời nguyện\n'.normalize(normalization);
    const text = (heading + 'Con thành tâm').normalize(normalization);
    const starts = [0, heading.length];
    const originalRuns = JSON.stringify(fullRuns);
    const page = selectPage(fullRuns, text, starts, 1, true, false, clipGhostRuns, alignGhostRuns);
    const typedPage = text.slice(starts[1]);
    expect(alignGhostRuns(page, typedPage)).not.toBeNull();
    expect(page.map((run: { text: string }) => run.text).join('')).toBe(typedPage + ' đảnh lễ chư Phật.');
    expect(page[0]).toMatchObject({ bold: false, align: 'justify', line: 1 });
    expect(JSON.stringify(fullRuns)).toBe(originalRuns);
  });
});

describe('nextGhostTraceText', () => {
  const canonical = 'Con thành tâm đảnh lễ, cúi xin chư Phật.';

  it('advances one character from canonical text when typing a character', () => {
    expect(nextGhostTraceText(canonical, '', { key: 'c' })).toBe('C');
    expect(nextGhostTraceText(canonical, 'C', { key: 'o' })).toBe('Co');
    expect(nextGhostTraceText(canonical, 'Co', { key: 'n' })).toBe('Con');
    expect(nextGhostTraceText(canonical, 'Con', { key: ' ' })).toBe('Con ');
  });

  it('removes one character when isBackspace is true', () => {
    expect(nextGhostTraceText(canonical, 'Con', { isBackspace: true })).toBe('Co');
    expect(nextGhostTraceText(canonical, 'C', { isBackspace: true })).toBe('');
    expect(nextGhostTraceText(canonical, '', { isBackspace: true })).toBe('');
  });

  it('smartly skips punctuation/spaces when the user types the matching following letter', () => {
    const text = 'lễ, cúi xin';
    // User is at 'lễ'. Next in canonical is ', c'.
    // If user types 'c', it auto-consumes ', ' and includes 'c'.
    expect(nextGhostTraceText(text, 'lễ', { key: 'c' })).toBe('lễ, c');
  });

  it('advances past spaces and punctuation normally when user presses space or punctuation', () => {
    const text = 'lễ, cúi xin';
    expect(nextGhostTraceText(text, 'lễ', { key: ' ' })).toBe('lễ,');
    expect(nextGhostTraceText(text, 'lễ,', { key: ' ' })).toBe('lễ, ');
  });

  it('does not exceed canonical text length', () => {
    expect(nextGhostTraceText('A', 'A', { key: 'x' })).toBe('A');
  });
});
