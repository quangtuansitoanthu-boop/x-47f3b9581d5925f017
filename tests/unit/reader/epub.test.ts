import { describe, expect, it } from 'vitest';

import { createEpub } from '../../../src/lib/components/reader/epub';

const decoder = new TextDecoder();

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readStoredEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (readUint32(bytes, offset) === 0x04034b50) {
    const contentLength = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.slice(contentStart, contentStart + contentLength)));
    offset = contentStart + contentLength;
  }

  return entries;
}

describe('EPUB generation', () => {
  it('includes binary images and their manifest entries without text encoding the bytes', async () => {
    const data = new Uint8Array([0, 255, 128, 42]);
    const archive = createEpub('Sách ảnh', 'Tác giả', '', [{ title: 'Chương 1', content: '<p>Trước</p><img src="images/image-0.png"/><p>Sau</p>' }], [{ name: 'images/image-0.png', mediaType: 'image/png', data }]);
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const entries = readStoredEntries(bytes);
    expect(entries.get('OEBPS/content.opf')).toContain('href="images/image-0.png" media-type="image/png"');
    expect(entries.get('OEBPS/chapter-0.xhtml')).toContain('<p>Trước</p><img src="images/image-0.png"/><p>Sau</p>');
    const name = new TextEncoder().encode('OEBPS/images/image-0.png');
    const offset = Buffer.from(bytes).indexOf(name);
    expect([...bytes.slice(offset + name.length, offset + name.length + data.length)]).toEqual([...data]);
  });
  it('builds books whose individual chapters exceed JavaScript argument limits', async () => {
    const largeChapter = `Nội dung chương lớn. ${'x'.repeat(350_000)}`;

    const epub = createEpub('Báo ứng hiện đời - Tập 8', 'Quang Từ', '', [{
      title: 'Chương dài',
      content: largeChapter
    }]);
    const bytes = new Uint8Array(await epub.arrayBuffer());

    expect(epub.type).toBe('application/epub+zip');
    expect(bytes.byteLength).toBeGreaterThan(largeChapter.length);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const entries = readStoredEntries(bytes);
    const chapter = entries.get('OEBPS/chapter-0.xhtml');
    expect(entries.get('mimetype')).toBe('application/epub+zip');
    expect(chapter).toContain('<h1>Chương dài</h1>');
    expect(chapter).toContain(largeChapter);

    const endOfCentralDirectory = bytes.byteLength - 22;
    const centralDirectoryOffset = readUint32(bytes, endOfCentralDirectory + 16);
    expect(readUint32(bytes, endOfCentralDirectory)).toBe(0x06054b50);
    expect(readUint32(bytes, centralDirectoryOffset)).toBe(0x02014b50);
  });
});
