import { describe, expect, it } from 'vitest';

import { buildZipBlob } from '$lib/browser/audio-zip';

describe('audio zip builder', () => {
  it('declares UTF-8 names in both headers so extraction preserves Vietnamese', async () => {
    const content = new Uint8Array([11, 22, 33]);
    const blob = buildZipBlob([{ fileName: 'Kinh Địa Tạng', bytes: content.buffer }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    const central = view.getUint32(end + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(central + 8, true) & 0x0800).toBe(0x0800);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(30, 30 + nameLength)))
      .toBe('01. Kinh Địa Tạng.mp3');
    expect(bytes.slice(30 + nameLength, central)).toEqual(content);
    expect(view.getUint32(central + 42, true)).toBe(0);
    expect(view.getUint32(central + 16, true)).toBe(view.getUint32(14, true));
  });

  it('keeps one extension when an audio title already includes its actual suffix', async () => {
    const bytes = new Uint8Array(await buildZipBlob([
      { fileName: 'Bài giảng.MP3', bytes: new ArrayBuffer(0), extension: '.mp3' },
      { fileName: 'Bài khác', bytes: new ArrayBuffer(0), extension: 'm4a' },
    ]).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const length = view.getUint16(26, true);
    const firstName = new TextDecoder().decode(bytes.slice(30, 30 + length));
    expect(firstName).toBe('01. Bài giảng.MP3');
    const second = 30 + length;
    const secondLength = view.getUint16(second + 26, true);
    expect(new TextDecoder().decode(bytes.slice(second + 30, second + 30 + secondLength)))
      .toBe('02. Bài khác.m4a');
  });

  it('creates a browser-safe zip blob with local and central directory headers', async () => {
    const blob = buildZipBlob([
      { fileName: 'Bài 1', bytes: new Uint8Array([1, 2, 3]).buffer },
      { fileName: 'Bài/2?', bytes: new Uint8Array([4, 5]).buffer },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe('application/zip');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    expect(bytes.includes(0x05)).toBe(true);
    expect(bytes.includes(0x06)).toBe(true);

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('01. Bài 1.mp3');
    expect(text).toContain('02. Bài2.mp3');
  });
});
