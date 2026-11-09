import { afterEach, expect, it, vi } from 'vitest';
import { watchCalendarDay } from '$lib/browser/calendar-day-rollover';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('updates once across midnight and after foreground resume without polling',()=>{
  vi.useFakeTimers();
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  vi.stubGlobal('document',documentEvents);vi.stubGlobal('window',windowEvents);
  let current = new Date(2026,9,22,23,59,59);
  const changed = vi.fn();const dispose=watchCalendarDay(changed,()=>current);
  expect(vi.getTimerCount()).toBe(1);
  current=new Date(2026,9,23);vi.advanceTimersByTime(1100);
  expect(changed).toHaveBeenCalledOnce();
  windowEvents.dispatchEvent(new Event('focus'));expect(changed).toHaveBeenCalledOnce();
  current=new Date(2026,9,25);documentEvents.dispatchEvent(new Event('visibilitychange'));
  expect(changed).toHaveBeenCalledTimes(2);
  dispose();expect(vi.getTimerCount()).toBe(0);
});

it('does not rearm its midnight timer when the owner disposes during a day-change callback', () => {
  vi.useFakeTimers();
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  vi.stubGlobal('document', documentEvents);
  vi.stubGlobal('window', windowEvents);
  let current = new Date(2026, 10, 1, 23, 59, 59);
  let dispose: () => void = () => {};
  const changed = vi.fn(() => dispose());
  dispose = watchCalendarDay(changed, () => current);

  current = new Date(2026, 10, 2);
  vi.advanceTimersByTime(1100);
  expect(changed).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  current = new Date(2026, 10, 3);
  windowEvents.dispatchEvent(new Event('focus'));
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  expect(changed).toHaveBeenCalledOnce();
});

it('ignores an already captured focus callback after disposal', () => {
  vi.useFakeTimers();
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  vi.stubGlobal('document', documentEvents);
  vi.stubGlobal('window', windowEvents);
  const listeners = vi.spyOn(windowEvents, 'addEventListener');
  let current = new Date(2026, 10, 1);
  const changed = vi.fn();
  const dispose = watchCalendarDay(changed, () => current);
  const lateFocus = listeners.mock.calls.find(([name]) => name === 'focus')?.[1] as EventListener;
  dispose();

  current = new Date(2026, 10, 2);
  lateFocus(new Event('focus'));
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
