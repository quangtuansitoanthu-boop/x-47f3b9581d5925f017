const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const encoder = new TextEncoder();
const UTF8_NAME_FLAG = 0x0800;

export interface ZipEntry {
  fileName: string;
  bytes: ArrayBuffer;
  extension?: string;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pushUint16(chunks: number[], value: number): void {
  chunks.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(chunks: number[], value: number): void {
  chunks.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function sanitizeZipName(name: string): string {
  const normalized = String(name || '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim();
  return normalized || 'audio';
}

export function buildZipBlob(entries: ZipEntry[]): Blob {
  const files = entries.map((entry, index) => {
    const rawName = sanitizeZipName(entry.fileName);
    const hasKnownExt = /\.(mp3|m4a|webm|ogg|opus|wav|flac|aac)$/iu.test(rawName);
    const requestedExt = entry.extension
      ? (entry.extension.startsWith('.') ? entry.extension : `.${entry.extension}`)
      : (hasKnownExt ? '' : '.mp3');
    const ext = requestedExt && rawName.toLowerCase().endsWith(requestedExt.toLowerCase()) ? '' : requestedExt;
    const fileName = `${String(index + 1).padStart(2, '0')}. ${rawName}${ext}`;
    const bytes = new Uint8Array(entry.bytes);
    return {
      fileName,
      fileNameBytes: encoder.encode(fileName),
      bytes: entry.bytes,
      byteLength: bytes.byteLength,
      crc: crc32(bytes),
    };
  });

  const localParts: ArrayBuffer[] = [];
  const centralChunks: number[] = [];
  let offset = 0;

  for (const file of files) {
    const header = new Uint8Array(30 + file.fileNameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    // Cả hai header cần cờ UTF-8 để phần mềm giải nén giữ đúng tên tiếng Việt.
    view.setUint16(6, UTF8_NAME_FLAG, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, file.crc, true);
    view.setUint32(18, file.byteLength, true);
    view.setUint32(22, file.byteLength, true);
    view.setUint16(26, file.fileNameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(file.fileNameBytes, 30);
    localParts.push(header.buffer, file.bytes);

    pushUint32(centralChunks, 0x02014b50);
    pushUint16(centralChunks, 20);
    pushUint16(centralChunks, 20);
    pushUint16(centralChunks, UTF8_NAME_FLAG);
    pushUint16(centralChunks, 0);
    pushUint16(centralChunks, 0);
    pushUint16(centralChunks, 0);
    pushUint32(centralChunks, file.crc);
    pushUint32(centralChunks, file.byteLength);
    pushUint32(centralChunks, file.byteLength);
    pushUint16(centralChunks, file.fileNameBytes.length);
    pushUint16(centralChunks, 0);
    pushUint16(centralChunks, 0);
    pushUint16(centralChunks, 0);
    pushUint16(centralChunks, 0);
    pushUint32(centralChunks, 0);
    pushUint32(centralChunks, offset);
    centralChunks.push(...file.fileNameBytes);

    offset += header.byteLength + file.byteLength;
  }

  const centralDirectory = Uint8Array.from(centralChunks);
  const endOfCentral = new Uint8Array(22);
  const endView = new DataView(endOfCentral.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, centralDirectory.buffer, endOfCentral.buffer], { type: 'application/zip' });
}
