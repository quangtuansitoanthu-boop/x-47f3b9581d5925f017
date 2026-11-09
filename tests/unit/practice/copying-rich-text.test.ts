// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { richCopyText, richCopySelection, setRichCopySelection } from '../../../src/lib/browser/copying-rich-text';

describe('plain draft inside the formatted editor', () => {
  it('does not save visual paragraph breaks or formatting markup', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-copy-line="0" style="text-align:center"><strong>Nam mô</strong></div><div data-copy-line="1"> Phật\nLời kinh</div>';
    expect(richCopyText(root)).toBe('Nam mô Phật\nLời kinh');
    document.body.append(root);
    setRichCopySelection(root, 5, 10);
    expect(richCopySelection(root)).toEqual([5, 10]);
    root.remove();
  });
  it('keeps real Enter and ignores an empty-editor placeholder', () => {
    const root = document.createElement('div');
    root.innerHTML = '<br data-copy-placeholder>';
    expect(richCopyText(root)).toBe('');
    root.innerHTML = 'Nam mô<div>Phật<br>Lời kinh</div>';
    expect(richCopyText(root)).toBe('Nam mô\nPhật\nLời kinh');
  });
  it('retains accents, literal markup and offsets across bold runs', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-copy-line="0"><strong>Địa</strong><span> Tạng &lt;img&gt;</span></div>';
    document.body.append(root);
    expect(richCopyText(root)).toBe('Địa Tạng <img>');
    setRichCopySelection(root, 4, 8);
    expect(window.getSelection()?.toString()).toBe('Tạng');
    expect(richCopySelection(root)).toEqual([4, 8]);
    root.remove();
  });
  it('clamps stale review selections instead of throwing an uncaught Range error', () => {
    const root = document.createElement('div'); root.textContent = 'Nam mô Phật'; document.body.append(root);
    expect(() => setRichCopySelection(root, -10, 999)).not.toThrow();
    expect(richCopySelection(root)).toEqual([0, 11]);
    root.remove();
  });
});
