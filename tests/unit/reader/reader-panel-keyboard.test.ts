import { describe, expect, it, vi } from 'vitest';
import { readerPanelKeyboard } from '../../../src/lib/browser/reader-panel-keyboard';

function keyEvent(key: string) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

describe('reader panel keyboard boundary', () => {
  it('consumes Escape only for an active panel and removes the listener on teardown', () => {
    const node = new EventTarget();
    const close = vi.fn();
    const action = readerPanelKeyboard(node as HTMLElement, close);
    const escape = keyEvent('Escape');
    const stop = vi.spyOn(escape, 'stopPropagation');
    node.dispatchEvent(keyEvent('Tab'));
    expect(close).not.toHaveBeenCalled();
    node.dispatchEvent(escape);
    expect(close).toHaveBeenCalledOnce();
    expect(escape.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
    action.destroy();
    node.dispatchEvent(keyEvent('Escape'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('lets the outer reader handle Escape when no mobile panel is active', () => {
    const node = new EventTarget();
    const action = readerPanelKeyboard(node as HTMLElement, () => false);
    const escape = keyEvent('Escape');
    node.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    action.destroy();
  });
});
