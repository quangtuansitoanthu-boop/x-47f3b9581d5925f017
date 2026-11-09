import type { TypedRun } from '../domain/practice/copying-typed-format';
import { copyingPageStarts } from '../domain/practice/copying-pages';

export function renderCopyRuns(target: HTMLElement, runs: TypedRun[], start = 0, end = Infinity): void {
  const fragment = document.createDocumentFragment();
  let group: HTMLDivElement | undefined, previousLine = -1, offset = 0;
  for (const run of runs) {
    const left = Math.max(start, offset), right = Math.min(end, offset + run.text.length);
    const text = right > left ? run.text.slice(left - offset, right - offset) : '';
    offset += run.text.length;
    if (!text) continue;
    if (!group || previousLine !== run.line) {
      group = document.createElement('div'); group.dataset.copyLine = String(run.line);
      group.style.textAlign = run.align; fragment.append(group); previousLine = run.line;
    }
    const span = document.createElement(run.bold ? 'strong' : 'span');
    span.textContent = text; group.append(span);
  }
  target.replaceChildren(fragment);
}

export function renderGhostRuns(target: HTMLElement, runs: TypedRun[], typedLength = 0): void {
  renderReferenceRuns(target, runs, typedLength, false);
}

/** Future glyphs reserve layout through CSS only; they never become editable/saved text. */
export function renderTracedCopyRuns(target: HTMLElement, runs: TypedRun[], typedLength: number): void {
  renderReferenceRuns(target, runs, typedLength, true);
}

function renderReferenceRuns(target: HTMLElement, runs: TypedRun[], typedLength: number, ink: boolean): void {
  const fragment = document.createDocumentFragment();
  let group: HTMLDivElement | undefined, previousLine = -1, offset = 0;
  for (const run of runs) {
    if (!run.text) continue;
    if (!group || previousLine !== run.line) {
      group = document.createElement('div'); group.dataset.copyLine = String(run.line);
      group.style.textAlign = run.align; fragment.append(group); previousLine = run.line;
    }
    const length = Math.max(0, Math.min(run.text.length, typedLength - offset));
    if (length || (ink && offset === 0)) {
      const typed = document.createElement(run.bold ? 'strong' : 'span');
      typed.append(document.createTextNode(run.text.slice(0, length)));
      if (!ink) typed.style.visibility = 'hidden';
      else typed.dataset.copyTyped = '';
      group.append(typed);
    }
    if (length < run.text.length) {
      const future = document.createElement(run.bold ? 'strong' : 'span');
      if (ink) {
        future.dataset.copyFuture = run.text.slice(length);
        future.setAttribute('contenteditable', 'false'); future.setAttribute('aria-hidden', 'true');
      } else future.textContent = run.text.slice(length);
      group.append(future);
    }
    offset += run.text.length;
  }
  target.replaceChildren(fragment);
}
/** Measure in a hidden sibling without moving focus or changing the saved text. */
export function measureCopyPages(editor: HTMLElement, text: string, runs: TypedRun[]): number[] {
  if (!text || !editor.clientWidth || !editor.clientHeight) return [0];
  const style = getComputedStyle(editor), line = parseFloat(style.lineHeight) || 36;
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  // Tiny keyboard/landscape viewports use internal scrolling until there is room
  // for a writing page; never create hundreds of one-word pages.
  if (editor.clientHeight - padding < line * 2) return [0];
  const mirror = editor.cloneNode(false) as HTMLElement;
  mirror.removeAttribute('id'); mirror.removeAttribute('tabindex');
  mirror.setAttribute('aria-hidden', 'true'); mirror.setAttribute('contenteditable', 'false');
  Object.assign(mirror.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
    pointerEvents: 'none', width: editor.clientWidth + 'px', height: 'auto', minHeight: '0',
    maxHeight: 'none', flex: 'none', overflow: 'visible', boxSizing: 'border-box', fontSize: style.fontSize });
  editor.parentElement!.append(mirror);
  try {
    const maximum = editor.clientHeight - Math.min(line, editor.clientHeight / 6);
    return copyingPageStarts(text, (start, end) => {
      renderCopyRuns(mirror, runs, start, end);
      return mirror.getBoundingClientRect().height <= maximum + 1;
    });
  } finally { mirror.remove(); }
}
