// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { copyingCaretScroll } from '../../../src/lib/browser/copying-caret';
import { richCopySelection, richCopyText, setRichCopySelection } from '../../../src/lib/browser/copying-rich-text';
describe('copying editor follows the caret', () => {
  it('restores offsets across native editable paragraph separators', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div>Nam mô</div><div>Phật</div>';
    document.body.append(root);
    try {
      expect(richCopyText(root)).toBe('Nam mô\nPhật');
      for (const offset of [6, 7, 8, 11]) {
        setRichCopySelection(root, offset, offset);
        expect(richCopySelection(root)).toEqual([offset, offset]);
      }
      setRichCopySelection(root, 7, 11);
      expect(window.getSelection()?.toString()).toBe('Phật');
    } finally { root.remove(); }
  });
  it('scrolls down with empty space under the current line', () => {
    expect(copyingCaretScroll(280, 30, 240, 0, 500)).toBe(130);
  });
  it('keeps a visible caret stable rather than jumping to the end', () => {
    expect(copyingCaretScroll(80, 30, 240, 0, 500)).toBe(0);
    expect(copyingCaretScroll(280, 30, 240, 200, 500)).toBe(200);
  });
  it('reserves the navigation padding even with a small reading font', () => {
    expect(copyingCaretScroll(260, 18, 340, 0, 500, 74)).toBe(12);
  });
  it('follows editing backwards and stays inside scroll limits', () => {
    expect(copyingCaretScroll(20, 30, 240, 200, 500)).toBe(0);
    expect(copyingCaretScroll(800, 30, 240, 0, 500)).toBe(500);
    expect(copyingCaretScroll(20, 30, 0, 12, 500)).toBe(12);
  });
});
