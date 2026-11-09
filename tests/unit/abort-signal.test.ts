import { expect, it } from 'vitest';
import { throwIfAborted } from '../../src/lib/browser/abort-signal';

it.each([null, false, 'cancelled', new Error('cancelled')])('keeps the supplied cancellation reason %s', reason => {
  const controller = new AbortController();
  controller.abort(reason);
  let caught = false;
  try { throwIfAborted(controller.signal); }
  catch (error) { caught = true; expect(error).toBe(reason); }
  expect(caught).toBe(true);
});

it('uses AbortError when an older signal has no reason property', () => {
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'reason', { value: undefined });
  controller.abort();
  expect(() => throwIfAborted(controller.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }));
});
