import { normalizeCopyText } from './scripture-copying';

export const COPY_COMPLETION_PERCENT = 90;

/** Word-level coverage; review suggestions never gate saving or navigation. */
export function copyingTextCompletion(source: string, typed: string) {
  const expected = normalizeCopyText(source).split(' ').filter(Boolean);
  const actual = normalizeCopyText(typed).split(' ').filter(Boolean);
  const total = Math.max(expected.length, actual.length);
  if (!total) return { matched: 0, total: 0, accepted: true };
  if (!actual.length || !expected.length || actual.length > 640 || expected.length > 640) return { matched: 0, total, accepted: false };
  let previous = Uint16Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i++) {
    const row = new Uint16Array(actual.length + 1); row[0] = i;
    for (let j = 1; j <= actual.length; j++) row[j] = Math.min(
      previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1));
    previous = row;
  }
  const matched = Math.max(0, total - previous[actual.length]);
  return { matched, total, accepted: matched * 100 >= total * COPY_COMPLETION_PERCENT };
}

export function copyingChapterCompletion(blocks: string[], texts: readonly string[] = []) {
  const scores = blocks.map((source, index) => copyingTextCompletion(source, texts[index] ?? ''));
  const total = scores.reduce((sum, score) => sum + score.total, 0);
  const matched = scores.reduce((sum, score) => sum + score.matched, 0);
  return { matched, total, accepted: total > 0 && matched * 100 >= total * COPY_COMPLETION_PERCENT,
    percent: total ? Math.round(matched / total * 100) : 0 };
}

/** Determine whether the typed text has reached and completed the end of the sample scripture in a block. */
export function copyingBlockCompleted(source: string, typed: string): boolean {
  if (!source || !typed) return false;
  const expected = normalizeCopyText(source).split(' ').filter(Boolean);
  const actual = normalizeCopyText(typed).split(' ').filter(Boolean);
  if (!expected.length || actual.length < expected.length) return false;
  const completion = copyingTextCompletion(source, typed);
  if (!completion.accepted) return false;
  const lastExpected = expected[expected.length - 1];
  const lastActual = actual[expected.length - 1] ?? actual[actual.length - 1];
  const exactLast = lastActual === lastExpected;
  const trailingDelimiter = /[.\s,;!?…。！？]$/u.test(typed.trimEnd());
  return exactLast || trailingDelimiter || actual.length > expected.length;
}
