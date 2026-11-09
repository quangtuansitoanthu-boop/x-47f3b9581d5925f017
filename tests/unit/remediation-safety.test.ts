import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { acquireScrollLock } from '../../src/lib/browser/scroll-lock';
import { fetchBoundedBytes, fetchWithDeadline } from '../../src/lib/browser/network-deadline';
import { practiceDayWindows } from '../../src/lib/server/domain/practice-day-windows';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('audit remediation safety', () => {
  it.each([true, false])('locks explicit HTML scrolling and restores both first snapshots (outer first: %s)', outerFirst => {
    const dom = new JSDOM('<!doctype html><html style="overflow-y:auto!important;overflow-x:clip;color:red"><body style="overflow:scroll!important;padding:7px"></body></html>');
    vi.stubGlobal('document', dom.window.document);
    const html = dom.window.document.documentElement;
    const body = dom.window.document.body;
    const before = [html, body].map(element => ['overflow', 'overflow-x', 'overflow-y'].map(property => ({ property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) })));
    const outer = acquireScrollLock();
    const inner = acquireScrollLock();
    try {
      expect(html.style.overflow).toBe('hidden');
      expect(body.style.overflow).toBe('hidden');
      const first = outerFirst ? outer : inner;
      const last = outerFirst ? inner : outer;
      first(); first();
      expect(html.style.overflow).toBe('hidden');
      expect(body.style.overflow).toBe('hidden');
      last(); last();
      [html, body].forEach((element, index) => before[index].forEach(({ property, value, priority }) => {
        expect(element.style.getPropertyValue(property)).toBe(value);
        expect(element.style.getPropertyPriority(property)).toBe(priority);
      }));
      expect(html.style.color).toBe('red'); expect(body.style.padding).toBe('7px');
    } finally { outer(); inner(); dom.window.close(); }
  });

  it('is a harmless acquire/release without a document during SSR', () => {
    vi.stubGlobal('document', undefined);
    const release = acquireScrollLock();
    expect(() => { release(); release(); }).not.toThrow();
  });

  it('releases overlapping scroll locks in either order exactly once', () => {
    const body = { style: { overflow: 'auto' } };
    vi.stubGlobal('document', { body });
    const first = acquireScrollLock();
    const second = acquireScrollLock();
    first(); first();
    expect(body.style.overflow).toBe('hidden');
    second();
    expect(body.style.overflow).toBe('auto');
  });

  it('aborts a transport that never sends response headers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    })));
    const request = fetchWithDeadline('/api/test', undefined, 100);
    const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });

  it('rejects a streaming PDF that exceeds the byte budget without Content-Length', async () => {
    const cancelled = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); },
      cancel: cancelled,
    }))));
    await expect(fetchBoundedBytes('https://example.test/book.pdf', new AbortController().signal, 10)).rejects.toThrow('too large');
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('uses real 23/25-hour local dates through DST transitions', () => {
    const spring = practiceDayWindows(new Date('2026-03-08T12:00:00Z'), new Date('2026-03-08T12:00:00Z'), 'America/New_York')[0];
    const fall = practiceDayWindows(new Date('2026-11-01T12:00:00Z'), new Date('2026-11-01T12:00:00Z'), 'America/New_York')[0];
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * 3600_000);
    expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * 3600_000);
    const nepal = practiceDayWindows(new Date('2026-10-22T12:00:00Z'), new Date('2026-10-22T12:00:00Z'), 'Asia/Kathmandu')[0];
    expect(nepal.start).toBe('2026-10-21T18:15:00.000Z');
  });
});
