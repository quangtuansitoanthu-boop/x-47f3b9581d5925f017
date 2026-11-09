import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

interface ImageExportPlugin {
  saveImage(options: { fileName: string; base64: string }): Promise<{ saved: boolean }>;
}
const ImageExport = registerPlugin<ImageExportPlugin>('ImageExport');
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BYTES = 8 * 1024 * 1024;

/** Native resolves only after the destination is written; web starts a browser download. */
export async function savePngImage(blob: Blob, fileName: string): Promise<boolean> {
  if (blob.type !== 'image/png' || blob.size < 8 || blob.size > MAX_PNG_BYTES) throw new Error('invalid_png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('invalid_png');
  const safeName = fileName.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 100).replace(/^\.+/, '') || 'tu-tap.png';
  if (isNativeApp() && nativePlatform() === 'android') {
    // Only small, generated PNG cards cross the bridge. Never use this for books/video.
    const chunks: string[] = [];
    for (let start = 0; start < bytes.length; start += 8192) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)));
    const result = await ImageExport.saveImage({ fileName: safeName, base64: btoa(chunks.join('')) });
    return result.saved === true;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.append(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return true;
}
