import { describe, expect, it } from 'vitest';
import { copyingChapterProgress } from '../../../src/lib/domain/practice/copying-progress';
import type { CopyDraft } from '../../../src/lib/browser/scripture-copying-workspace';
describe('local copying progress', () => {
  const source = ['Nam-mô Phật.', '(3 lần)', 'Nguyện tâm thanh tịnh.'];
  it('shows zero required passages completed for an untouched chapter', () => {
    expect(copyingChapterProgress(source, null)).toEqual({ total: 2, complete: 0, started: false, percent: 0 });
  });
  it('counts correct passages using the same relaxed rules and excludes optional notes', () => {
    const draft = { texts: ['nam mô phật', '', 'Nguyện tâm'] } as CopyDraft;
    expect(copyingChapterProgress(source, draft)).toEqual({ total: 2, complete: 1, started: true, percent: 71 });
    expect(draft.texts).toEqual(['nam mô phật', '', 'Nguyện tâm']);
  });
  it('keeps partial and incorrect text marked in progress rather than completed', () => {
    expect(copyingChapterProgress(source, { texts: ['nam mo phật'] } as CopyDraft)).toMatchObject({ complete: 0, started: true, percent: 29 });
  });
});
