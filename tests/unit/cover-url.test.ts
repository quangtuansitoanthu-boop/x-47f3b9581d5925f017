import { expect, it } from 'vitest';
import { normalizeCoverSrc, coverRemoteFallback } from '$lib/domain/cover-url';

it('keeps remote images outside the bundled covers namespace on the original host', () => {
  for (const url of [
    'https://archive.org/download/album/cover.jpg',
    'https://images.example.org/artwork.png?width=640&token=public#pos=top',
    'https://images.example.org/kinh-duoc-su.webp',
  ]) {
    expect(normalizeCoverSrc(url)).toBe(url);
    expect(coverRemoteFallback(normalizeCoverSrc(url))).toBe('');
  }
});

for (const volume of [1, 2]) {
  const file = `phat-tu-thien-dia-du-ky-quyen-${volume}.webp`;
  it(`uses the bundled cover for Du Ky volume ${volume} with legacy media URLs`, () => {
    for (const raw of [`covers/${file}`, `/covers/${file}`, `/api/media/covers/${file}`, `https://quangtu.vn/api/media/covers/${file}`]) {
      expect(normalizeCoverSrc(raw)).toBe(`/covers/${file}`);
    }
    expect(normalizeCoverSrc(`/api/media/covers/${file}#pos=top`)).toBe(`/covers/${file}#pos=top`);
    expect(coverRemoteFallback(`/api/media/covers/${file}`)).toBe(`https://media.quangtu.vn/covers/${file}`);
  });
}
it('does not retry absolute remote images through another CDN', () => {
  expect(coverRemoteFallback('https://media.quangtu.vn/covers/remote.webp')).toBe('');
});

it('uses refreshed book covers for legacy catalog URLs and removes old crop positions', () => {
  for (const prefix of ['covers/', '/covers/', '/api/media/covers/', 'https://media.quangtu.vn/covers/']) {
    expect(normalizeCoverSrc(`${prefix}1783263779955_v6sks.webp#pos=45%25%2081%25`))
      .toBe('/covers/truyen-tranh-kinh-dia-tang-phan-1-20261022.webp');
  }
  expect(normalizeCoverSrc('covers/1781224825424_u1iol.webp'))
    .toBe('/covers/bao-ung-hien-doi-tap-8-20261022.webp');
  expect(normalizeCoverSrc('covers/1781528952418_a8sgb.webp'))
    .toBe('/covers/chuyen-hoa-thanh-phuc-20261022.webp');
});

it('uses refreshed practice artwork for both sutras and mantra rituals', () => {
  expect(normalizeCoverSrc('/api/media/covers/kinh-duoc-su.webp'))
    .toBe('/covers/tu-tap-kinh-duoc-su-20261022.webp');
  expect(normalizeCoverSrc('https://media.quangtu.vn/covers/1781274654514_3ihyn.webp#pos=top'))
    .toBe('/covers/tu-tap-1781274943336-20261022.webp');
});
