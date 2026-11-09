import { describe, expect, it } from 'vitest';
import { parsePositionedImage } from '../../src/lib/domain/positioned-image';

describe('positioned image assets', () => {
  it('decodes the legacy cover position marker without leaking it into the image URL', () => {
    expect(parsePositionedImage('https://media.quangtu.vn/covers/book.webp#pos=50%25%2024%25')).toEqual({
      src: 'https://media.quangtu.vn/covers/book.webp',
      position: '50% 24%'
    });
  });

  it('uses the centered fallback for ordinary and malformed image values', () => {
    expect(parsePositionedImage('/covers/book.webp')).toEqual({ src: '/covers/book.webp', position: 'center' });
    expect(parsePositionedImage('/covers/book.webp#pos=%E0%A4%A')).toEqual({ src: '/covers/book.webp', position: 'center' });
  });

  it('uses the latest position without leaking duplicated legacy markers into the URL', () => {
    expect(parsePositionedImage('/covers/book.webp#pos=top#pos=50%25%2075%25')).toEqual({
      src: '/covers/book.webp',
      position: '50% 75%'
    });
  });
});
