export function copyingCaretScroll(top: number, lineHeight: number, height: number, scroll: number, maxScroll: number, reservedBottom = 0): number {
  if (height <= 0) return scroll;
  const below = Math.max(Math.min(lineHeight * 2, height / 3), reservedBottom);
  const above = Math.min(lineHeight, height / 6);
  const next = top + lineHeight > scroll + height - below
    ? top + lineHeight + below - height
    : top < scroll + above ? top - above : scroll;
  return Math.max(0, Math.min(maxScroll, next));
}

function measureCopyingCaret(editor: HTMLTextAreaElement) {
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;border:0;height:auto;max-height:none;min-height:0;';
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'letter-spacing', 'word-spacing', 'line-height', 'text-indent', 'text-align', 'text-transform', 'direction', 'tab-size', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'word-break']) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.append(document.createTextNode(editor.value.slice(0, editor.selectionEnd)));
  const caret = document.createElement('span');
  caret.textContent = editor.value.slice(editor.selectionEnd) || '\u200b';
  mirror.append(caret);
  document.body.append(mirror);
  try {
    const top = caret.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.8;
    return { top, lineHeight, paddingBottom: parseFloat(style.paddingBottom) || 0 };
  } finally { mirror.remove(); }
}

export function copyingEditorNeedsPage(editor: HTMLTextAreaElement): boolean {
  if (document.activeElement !== editor || editor.selectionStart !== editor.selectionEnd || editor.selectionEnd !== editor.value.length || !editor.clientHeight) return false;
  const { top, lineHeight, paddingBottom } = measureCopyingCaret(editor);
  return top + lineHeight > editor.clientHeight - paddingBottom - Math.min(lineHeight, editor.clientHeight / 6);
}

/** Follow corrections inside an existing page without changing text or focus. */
export function keepCopyingCaretVisible(editor: HTMLTextAreaElement): void {
  if (document.activeElement !== editor || editor.selectionStart !== editor.selectionEnd || !editor.clientHeight) return;
  const { top, lineHeight, paddingBottom } = measureCopyingCaret(editor);
  editor.scrollTop = copyingCaretScroll(top, lineHeight, editor.clientHeight, editor.scrollTop, Math.max(0, editor.scrollHeight - editor.clientHeight), paddingBottom);
}

/** Listen only while this field owns focus; IME resizing occurs after the initial focus event. */
export function followTextareaCaret(editor: HTMLTextAreaElement) {
  let frame = 0;
  let listening = false;
  const viewport = window.visualViewport;
  const schedule = () => {
    if (document.activeElement !== editor || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; keepCopyingCaretVisible(editor); });
  };
  const start = () => {
    if (!listening) {
      listening = true;
      window.addEventListener('resize', schedule);
      viewport?.addEventListener('resize', schedule);
      document.addEventListener('selectionchange', schedule);
    }
    schedule();
  };
  const stop = () => {
    listening = false;
    window.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    document.removeEventListener('selectionchange', schedule);
    cancelAnimationFrame(frame); frame = 0;
  };
  editor.addEventListener('focus', start);
  editor.addEventListener('blur', stop);
  editor.addEventListener('input', schedule);
  editor.addEventListener('select', schedule);
  editor.addEventListener('keyup', schedule);
  if (document.activeElement === editor) start();
  return { destroy() {
    stop();
    editor.removeEventListener('focus', start); editor.removeEventListener('blur', stop);
    editor.removeEventListener('input', schedule); editor.removeEventListener('select', schedule); editor.removeEventListener('keyup', schedule);
  } };
}
