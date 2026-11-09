import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const script = readFileSync('src/app.html', 'utf8').match(/<script data-url-fragment-guard>([\s\S]*?)<\/script>/)![1];

it('clears only malformed fragments before navigation and preserves query/history state', () => {
  const listeners = new Map<string, () => void>();
  const location = { hash: '#%', pathname: '/huong-dan', search: '?lang=vi' };
  const state = { index: 7 };
  const history = { state, replaceState: vi.fn(() => { location.hash = ''; }) };
  runInNewContext(script, { location, history, window: { addEventListener: (event: string, handler: () => void) => listeners.set(event, handler) } });
  expect(history.replaceState).toHaveBeenCalledWith(state, '', '/huong-dan?lang=vi');
  history.replaceState.mockClear();
  for (const hash of ['', '#faq-xoa-trinh-duyet', '#ti%E1%BA%BFng-vi%E1%BB%87t', '#100%25']) {
    location.hash = hash;
    listeners.get('hashchange')!();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(location.hash).toBe(hash);
  }
  location.hash = '#%E0%A4%A';
  listeners.get('popstate')!();
  expect(history.replaceState).toHaveBeenCalledTimes(1);
});
