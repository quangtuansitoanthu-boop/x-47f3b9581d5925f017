import { expect, test } from '@playwright/test';

const redirects = [
  ['/index.html', '/'],
  ['/huong-dan.html', '/huong-dan'],
  ['/huongdan.html', '/huong-dan'],
  ['/phap-thoai.html', '/phap-thoai'],
  ['/phapthoai.html', '/phap-thoai'],
  ['/tu-tap.html', '/tu-tap'],
  ['/tutap.html', '/tu-tap'],
] as const;

test.describe('legacy URL compatibility', () => {
  for (const [legacy, canonical] of redirects) {
    test(`${legacy} redirects permanently and preserves query`, async ({ request }) => {
      const response = await request.get(`${legacy}?source=e2e`, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const location = new URL(String(response.headers().location));
      expect(location.pathname).toBe(canonical);
      expect(location.searchParams.get('source')).toBe('e2e');
    });
  }
});
