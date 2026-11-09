const encoder = new TextEncoder();
const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (value: number) => [value & 255, (value >>> 8) & 255];
const u32 = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

function zip(files: Array<{ name: string; content: string | Uint8Array<ArrayBuffer> }>): Blob {
  const body: BlobPart[] = [], central: number[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content, crc = crc32(data);
    const local = new Uint8Array([0x50,0x4b,0x03,0x04,...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    body.push(local, data);
    central.push(0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name);
    offset += local.length + data.length;
  }
  const end = new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(central.length),...u32(offset),...u16(0)]);
  return new Blob([...body, new Uint8Array(central), end], { type: 'application/epub+zip' });
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export interface EpubChapter {
  title: string;
  content: string;
}

export interface EpubImage {
  name: string;
  mediaType: string;
  data: Uint8Array<ArrayBuffer>;
}

export function createEpub(title: string, author: string, content: string, chapters: EpubChapter[] = [], images: EpubImage[] = []): Blob {
  const safeTitle = xml(title), safeAuthor = xml(author);
  const sections = chapters.length ? chapters : [{ title, content }];
  const identitySource = encoder.encode(JSON.stringify({ title, author, sections }));
  const identifier = `tutam-${crc32(identitySource).toString(16).padStart(8, '0')}`;
  const manifest = sections.map((_, index) => `<item id="chapter-${index}" href="chapter-${index}.xhtml" media-type="application/xhtml+xml"/>`).join('')
    + images.map((image, index) => `<item id="image-${index}" href="${xml(image.name)}" media-type="${xml(image.mediaType)}"/>`).join('');
  const spine = sections.map((_, index) => `<itemref idref="chapter-${index}"/>`).join('');
  const navigation = sections.map((chapter, index) => `<li><a href="chapter-${index}.xhtml">${xml(chapter.title)}</a></li>`).join('');
  const chapterFiles = sections.map((chapter, index) => ({
    name: `OEBPS/chapter-${index}.xhtml`,
    content: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" lang="vi"><head><title>${xml(chapter.title)}</title><style>body{font-family:serif;line-height:1.7;margin:5%}h1{text-align:center}</style></head><body><h1>${xml(chapter.title)}</h1>${chapter.content}</body></html>`,
  }));
  return zip([
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${identifier}</dc:identifier><dc:title>${safeTitle}</dc:title><dc:creator>${safeAuthor}</dc:creator><dc:language>vi</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest><spine>${spine}</spine></package>` },
    { name: 'OEBPS/nav.xhtml', content: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${safeTitle}</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>${navigation}</ol></nav></body></html>` },
    ...chapterFiles,
    ...images.map((image) => ({ name: `OEBPS/${image.name}`, content: image.data })),
  ]);
}
