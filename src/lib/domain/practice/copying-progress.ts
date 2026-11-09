import { normalizeCopyText } from './scripture-copying';
import { copyingChapterCompletion, copyingTextCompletion } from './copying-completion-progress';

export function copyingChapterProgress(blocks: string[], draft: { texts: readonly string[] } | null) {
  const required = blocks.map(normalizeCopyText);
  const total = required.filter(Boolean).length;
  const complete = required.filter((source, index) => source && copyingTextCompletion(source, draft?.texts[index] || '').accepted).length;
  const started = !!draft?.texts.some(text => normalizeCopyText(text).length > 0);
  const completion = copyingChapterCompletion(blocks, draft?.texts);
  return { total, complete, started, percent: total ? completion.accepted ? 100 : completion.percent : 100 };
}
