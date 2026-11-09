import { expect, it, vi } from 'vitest';
import { fetchWithDeadline } from '$lib/browser/network-deadline';

it.each([204, 205, 304])('preserves a bodyless %i response even when the transport exposes an empty stream', async status => {
  const cancel = vi.fn();
  const response = new Response(null, { status, headers: { 'x-result': 'empty' } });
  Object.defineProperty(response, 'body', { value: new ReadableStream({ cancel }) });
  const fetcher = vi.fn(async () => response) as typeof fetch;
  const result = await fetchWithDeadline('/api/example', { method: 'DELETE' }, 1000, fetcher);
  expect(result.status).toBe(status);
  expect(result.body).toBeNull();
  expect(await result.text()).toBe('');
  expect(result.headers.get('x-result')).toBe('empty');
  expect(cancel).toHaveBeenCalledOnce();
});
