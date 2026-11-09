export type PdfCropBox = [number, number, number, number];

interface PdfViewportLike {
  height: number;
  width: number;
}

interface PdfRenderTaskLike {
  cancel: () => void;
  promise: Promise<unknown>;
}

export interface PdfPageForCrop {
  getViewport: (options: { scale: number }) => PdfViewportLike;
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
  }) => PdfRenderTaskLike;
  view: number[];
}

export interface PixelBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export function findNonWhitePixelBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 248,
): PixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        pixels[offset] >= threshold
        && pixels[offset + 1] >= threshold
        && pixels[offset + 2] >= threshold
      ) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

export function pixelBoundsToPdfCropBox(
  bounds: PixelBounds,
  width: number,
  height: number,
  pageView: number[],
): PdfCropBox | null {
  if (pageView.length < 4 || width <= 0 || height <= 0) return null;
  const padX = Math.max(2, Math.round(width * 0.012));
  const padY = Math.max(2, Math.round(height * 0.012));
  const minX = Math.max(0, bounds.minX - padX);
  const minY = Math.max(0, bounds.minY - padY);
  const maxX = Math.min(width, bounds.maxX + padX);
  const maxY = Math.min(height, bounds.maxY + padY);
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  if (contentWidth >= width * 0.97 && contentHeight >= height * 0.97) return null;

  const [pageX0, pageY0, pageX1, pageY1] = pageView;
  const scaleX = (pageX1 - pageX0) / width;
  const scaleY = (pageY1 - pageY0) / height;
  return [
    pageX0 + minX * scaleX,
    pageY0 + (height - maxY) * scaleY,
    pageX0 + maxX * scaleX,
    pageY0 + (height - minY) * scaleY,
  ];
}

export async function detectPdfCropBox(
  page: PdfPageForCrop,
  pageNumber: number,
  cache: Map<number, PdfCropBox | null>,
  timeoutMs = 500,
): Promise<PdfCropBox | null> {
  if (cache.has(pageNumber)) return cache.get(pageNumber) ?? null;

  let cropBox: PdfCropBox | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const viewport = page.getViewport({ scale: 0.35 });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('crop_canvas_unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    const task = page.render({ canvas, canvasContext: context, viewport });
    await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          task.cancel();
          reject(new Error('crop_detection_timeout'));
        }, timeoutMs);
      }),
    ]);
    const image = context.getImageData(0, 0, width, height);
    const bounds = findNonWhitePixelBounds(image.data, width, height);
    if (bounds) cropBox = pixelBoundsToPdfCropBox(bounds, width, height, page.view);
  } catch {
    cropBox = null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  cache.set(pageNumber, cropBox);
  return cropBox;
}
