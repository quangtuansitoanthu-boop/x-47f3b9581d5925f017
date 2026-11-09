import { describe, expect, it } from 'vitest';

import {
  findNonWhitePixelBounds,
  pixelBoundsToPdfCropBox,
} from '../../../src/lib/browser/pdf-crop';

function whitePixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  return pixels;
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, value: number): void {
  const offset = (y * width + x) * 4;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

describe('PDF automatic margin crop', () => {
  it('finds content while ignoring near-white page margins', () => {
    const pixels = whitePixels(10, 10);
    setPixel(pixels, 10, 3, 2, 20);
    setPixel(pixels, 10, 7, 8, 20);

    expect(findNonWhitePixelBounds(pixels, 10, 10)).toEqual({
      maxX: 7,
      maxY: 8,
      minX: 3,
      minY: 2,
    });
  });

  it('converts canvas coordinates into the PDF bottom-up coordinate system', () => {
    expect(pixelBoundsToPdfCropBox(
      { minX: 20, minY: 10, maxX: 80, maxY: 90 },
      100,
      100,
      [0, 0, 200, 300],
    )).toEqual([36, 24, 164, 276]);
  });

  it('does not crop a page whose content already reaches the edges', () => {
    expect(pixelBoundsToPdfCropBox(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      100,
      100,
      [0, 0, 200, 300],
    )).toBeNull();
  });
});
