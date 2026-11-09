import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const faces = [
  { file: 'bookerly-regular.ttf', weight: '400', style: 'normal', bytes: 450048, hash: '5db64039fd7cfe1eca01fec76814aa2c6191bc627e53e2c67e8acc9e88bf8c73' },
  { file: 'bookerly-italic.ttf', weight: '400', style: 'italic', bytes: 314588, hash: '6e364837e08fa89c0fed287a13c7149567ab5657847f666e45e523ecc9c7820b' },
  { file: 'bookerly-bold.ttf', weight: '700', style: 'normal', bytes: 446684, hash: '1891ef97a20936f202b5c099bb2ed1556cce23585dd19761ded04e612fe52fce' },
  { file: 'bookerly-bold-italic.ttf', weight: '700', style: 'italic', bytes: 451448, hash: '029424e0715dbce8502a156b6df84533dcca3b93097782431c3058a5f1ac3445' },
];

test('all four bundled Bookerly faces load from genuine static files without relying on installed fonts', async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL || 'http://localhost:8787').origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  await page.route(url => /^https?:$/.test(url.protocol) && url.origin !== origin, route => route.abort('blockedbyclient'));
  for (const face of faces) {
    const response = await request.get(`${origin}/fonts/bookerly/${face.file}`);
    expect(response.status(), face.file).toBe(200);
    expect(response.headers()['content-type'], face.file).toMatch(/font\/ttf|application\/(?:x-font-ttf|font-sfnt|octet-stream)/i);
    const bytes = await response.body();
    expect(bytes.length, face.file).toBe(face.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'), face.file).toBe(face.hash);
  }

  // Dùng trang tĩnh đích: alias cũ có meta-refresh sang privacy-policy.html,
  // rồi redirect HTTP sang /privacy-policy sẽ hủy context khi font đang tải.
  await page.goto('/privacy-policy');
  await expect(page).toHaveURL(`${origin}/privacy-policy`);
  const loaded = await page.evaluate(async ({ faces, origin }) => {
    const sample = '“Đường tu tập: Ắ ằ ẩ ễ ộ ớ ự ỹ — An sĩ toàn thư.”';
    const results: { file: string; status: string; ready: boolean; width: number }[] = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    for (const [index, face] of faces.entries()) {
      // Tên family riêng và URL-only ngăn font cài sẵn che một file build bị thiếu.
      const family = `TutamBookerlyAssetProof${index}`;
      const font = new FontFace(family, `url("${origin}/fonts/bookerly/${face.file}") format("truetype")`, {
        style: face.style, weight: face.weight,
      });
      await font.load();
      document.fonts.add(font);
      const declaration = `${face.style} ${face.weight} 32px "${family}"`;
      await document.fonts.load(declaration, sample);
      await document.fonts.ready;
      context.font = declaration;
      const width = context.measureText(sample).width;
      results.push({ file: face.file, status: font.status, ready: document.fonts.check(declaration, sample), width });
      document.fonts.delete(font);
    }
    return results;
  }, { faces, origin });
  expect(loaded).toHaveLength(4);
  for (const face of loaded) {
    expect(face.status, face.file).toBe('loaded');
    expect(face.ready, face.file).toBe(true);
    expect(face.width, face.file).toBeGreaterThan(0);
    expect(Number.isFinite(face.width), face.file).toBe(true);
  }
});
