import { describe, expect, it } from 'vitest';

import { renderPracticeContent } from '../../../src/lib/domain/practice/content';
import { sanitizeStoredHtml } from '../../../src/lib/domain/content-sanitizer';
import { renderReaderContent } from '../../../src/lib/components/reader/content-renderer';
import { getSutraPriorityRank } from '../../../src/lib/domain/practice/state';
import {
  createChapterEditorHtml,
  createChapterImageHtml,
  serializeChapterEditorHtml,
} from '../../../src/lib/components/admin/books/chapter-content-editor';

describe('practice content rendering security', () => {
  it('keeps dedication blanks compact and left aligned without changing their text', () => {
    const line = 'Bố đẻ: ............................Mẹ đẻ: .......................................';
    for (const raw of [line, `{align:justify|${line}\nTrú tại địa chỉ: ................................................................}`]) {
      const rendered = renderReaderContent(raw);
      expect(rendered).toContain('tt-content__line--fill-in');
      expect(rendered).toContain('<span class="tt-content__blank">............................</span>');
      expect(rendered.replace(/<[^>]*>/gu, '')).toContain(line);
    }
  });

  it('does not turn ordinary ellipses or dots in image URLs into dedication blanks', () => {
    expect(renderReaderContent('{align:justify|Lắng nghe... và thực hành…}')).not.toContain('--fill-in');
    expect(renderReaderContent('![Ảnh](/assets/......jpg)')).toContain('src="/assets/......jpg"');
    expect(renderReaderContent('![Ảnh](/assets/......jpg)')).not.toContain('tt-content__blank');
  });

  it('opens legacy chapter source as sanitized visual editor HTML', () => {
    const html = createChapterEditorHtml('{align:center|**Nghi thức**}\n{c:#b45309|Nội dung}');

    expect(html).toContain('tt-content__line--center');
    expect(html).toContain('<strong>Nghi thức</strong>');
    expect(html).toContain('style="color:#b45309"');
    expect(html).not.toContain('{align:center|');
    expect(html).not.toContain('**Nghi thức**');
  });

  it('keeps safe HTML editable and removes hostile chapter markup', () => {
    const html = createChapterEditorHtml('<p onclick="alert(1)" style="text-align:center;position:fixed"><strong>Nội dung</strong><script>alert(1)</script></p>');

    expect(html).toContain('<p style="text-align:center"><strong>Nội dung</strong></p>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(serializeChapterEditorHtml(html)).toBe(html);
  });

  it('converts safe chapter image markdown without admitting unsafe URLs', () => {
    expect(createChapterImageHtml('![Chú thích](content/practice-image.jpg)')).toContain('<img');
    expect(createChapterImageHtml('![Xấu](javascript:alert(1))')).not.toContain('<img');
  });

  it('rejects malformed numeric URL entities without crashing the reader or editor', () => {
    const malformed = '<a href="&#999999999999999999999;">decimal</a><img src="&#x110000;" alt="hex">';

    expect(() => createChapterEditorHtml(malformed)).not.toThrow();
    expect(createChapterEditorHtml(malformed)).toBe('<a>decimal</a><img alt="hex">');
  });

  it('normalizes browser empty-editor placeholders to an empty chapter', () => {
    expect(serializeChapterEditorHtml('<br>')).toBe('');
    expect(serializeChapterEditorHtml('<div><br></div>')).toBe('');
    expect(serializeChapterEditorHtml('<p><span>&nbsp;</span></p>')).toBe('');
    expect(serializeChapterEditorHtml('<p><img src="/content/ke-anh.jpg"></p>')).toContain('<img');
  });

  it('keeps migrated chapter HTML stable across repeated editor reopen and save cycles', () => {
    const firstSave = serializeChapterEditorHtml(createChapterEditorHtml('{align:center|**Nội dung ổn định**}'));
    const secondSave = serializeChapterEditorHtml(createChapterEditorHtml(firstSave));

    expect(secondSave).toBe(firstSave);
  });

  it('keeps allowlisted rich-text styles and removes unsafe declarations', () => {
    const rendered = sanitizeStoredHtml(
      '<p style="text-align:center;color:#b45309;background-color:#fff4cc;font-size:18px;font-family:Lora;line-height:1.5;position:fixed;background:url(javascript:alert(1))"><s>Nội dung</s><sup>2</sup></p>',
    );

    expect(rendered).toContain('style="text-align:center;color:#b45309;background-color:#fff4cc;font-size:18px;font-family:Lora;line-height:1.5"');
    expect(rendered).toContain('<s>Nội dung</s><sup>2</sup>');
    expect(rendered).not.toMatch(/position|javascript|(?:^|;)background:/iu);
  });

  it('blocks attribute breakout payloads in markdown images and leaves them as text', () => {
    const payload = '![x](x" onerror="globalThis.__pwned=1)';
    const rendered = renderPracticeContent(payload);

    expect(rendered).not.toContain('<img');
    expect(rendered).not.toContain('onerror="globalThis.__pwned=1"');
    expect(rendered).toContain('![x](x&quot; onerror=&quot;globalThis.');
    expect(rendered).toContain('pwned=1)');
    expect(rendered).toContain('&quot;');
  });

  it('rejects javascript and data image URLs', () => {
    expect(renderPracticeContent('![x](javascript:alert(1))')).not.toContain('<img');
    expect(renderPracticeContent('![x](data:image/svg+xml;base64,PHN2Zz4=)')).not.toContain('<img');
  });

  it('routes relative media object keys through the same-origin media proxy', () => {
    const rendered = renderPracticeContent('![Chú thích "an toàn"](content/practice-image.jpg)');

    expect(rendered).toContain('<img src="/api/media/content/practice-image.jpg" alt="Chú thích &quot;an toàn&quot;" loading="lazy" />');
    expect(rendered).toContain('<figcaption class="tt-content__caption">Chú thích &quot;an toàn&quot;</figcaption>');
  });

  it('keeps static site assets same-origin and accepts canonical media proxy URLs', () => {
    expect(renderPracticeContent('![Logo](/assets/branding/tu-tap-logo.png)'))
      .toContain('src="/assets/branding/tu-tap-logo.png"');
    expect(renderPracticeContent('![Ảnh](/api/media/content/practice-image.jpg)'))
      .toContain('src="/api/media/content/practice-image.jpg"');
  });

  it('repairs legacy same-origin media paths without rewriting canonical media URLs', () => {
    expect(renderPracticeContent('![Ảnh](/content/practice-image.jpg)'))
      .toContain('src="/api/media/content/practice-image.jpg"');
    expect(renderPracticeContent('![Ảnh](https://quangtu.vn/content/practice-image.jpg)'))
      .toContain('src="/api/media/content/practice-image.jpg"');
    expect(renderPracticeContent('![Ảnh](https://media.quangtu.vn/content/practice-image.jpg)'))
      .toContain('src="https://media.quangtu.vn/content/practice-image.jpg"');
  });

  it('rejects malformed media keys instead of proxying them', () => {
    expect(renderPracticeContent('![Ảnh](content/%ZZ.jpg)')).not.toContain('<img');
    expect(renderPracticeContent('![Ảnh](content/../escape.jpg)')).not.toContain('<img');
    expect(renderPracticeContent('![Ảnh](/api/media/content/%ZZ.jpg)')).not.toContain('<img');
  });

  it('accepts safe video and source tags with valid media URLs and boolean attributes', () => {
    const videoHtml = '<div class="reader-video-wrapper"><video controls preload="metadata" playsinline poster="https://media.quangtu.vn/posters/test.webp" style="background-color:#000000"><source src="https://media.quangtu.vn/videos/test.mp4" type="video/mp4">Trình duyệt không hỗ trợ</video></div>';
    const sanitized = sanitizeStoredHtml(videoHtml);
    expect(sanitized).toContain('<video controls preload="metadata" playsinline');
    expect(sanitized).toContain('poster="https://media.quangtu.vn/posters/test.webp"');
    expect(sanitized).toContain('<source src="https://media.quangtu.vn/videos/test.mp4" type="video/mp4">');
    expect(sanitized).not.toContain('<script');
  });

  it('renders mixed HTML and custom align tags with markdown headings without leaking raw syntax', () => {
    const raw = '<p>{align:center|# LITURGY OF REPENTANCE BEFORE RECITING THE LOTUS SŪTRA}</p>\n<p>Đoạn văn bình thường</p>';
    const rendered = renderReaderContent(raw);

    expect(rendered).toContain('tt-content__line--center');
    expect(rendered).toContain('<strong>LITURGY OF REPENTANCE BEFORE RECITING THE LOTUS SŪTRA</strong>');
    expect(rendered).not.toContain('{align:center|');
    expect(rendered).not.toContain('# LITURGY');
    expect(rendered).toContain('<p>Đoạn văn bình thường</p>');
  });

  it('renders multiline align blocks across multiple lines cleanly', () => {
    const multiline = '{align:center|Dòng 1\nDòng 2\nDòng 3}';
    const rendered = renderReaderContent(multiline);

    expect(rendered).toContain('<span class="tt-content__line tt-content__line--center">Dòng 1</span>');
    expect(rendered).toContain('<span class="tt-content__line tt-content__line--center">Dòng 2</span>');
    expect(rendered).toContain('<span class="tt-content__line tt-content__line--center">Dòng 3</span>');
    expect(rendered).not.toContain('{align:center|');
  });

  it('renders color, bold, italic, and size tags within reader content', () => {
    const raw = '<p>{bold|In đậm} và {italic|in nghiêng} và {color:#b45309|chữ màu} và {size:20px|chữ lớn}</p>';
    const rendered = renderReaderContent(raw);

    expect(rendered).toContain('<strong>In đậm</strong>');
    expect(rendered).toContain('<em>in nghiêng</em>');
    expect(rendered).toContain('style="color:#b45309"');
    expect(rendered).not.toContain('{size:');
  });

  it('renders italic parenthetical actions and single asterisk markdown formatting', () => {
    expect(renderReaderContent('*(3 lần)*')).toContain('<em>(3 lần)</em>');

    const rawPlain = 'Nam mô A Di Đà Phật *(3 lần)*';
    expect(renderReaderContent(rawPlain)).toContain('<em>(3 lần)</em>');

    const rawHtml = '<p>Lễ Phật *(1 lạy)* và **in đậm** cùng *chú thích*</p>';
    const renderedHtml = renderReaderContent(rawHtml);
    expect(renderedHtml).toContain('<em>(1 lạy)</em>');
    expect(renderedHtml).toContain('<strong>in đậm</strong>');
    expect(renderedHtml).toContain('<em>chú thích</em>');
  });

  it('ranks sutras consistently in both Vietnamese and English', () => {
    // Vietnamese articles
    const viDiaTang = { id: 'tt_1780910773084', title: 'KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN', tags: ['kinh địa tạng'] };
    const viKimCang = { id: 'tt_1781359043077', title: 'KINH KIM CANG BÁT NHÃ BA LA MẬT', tags: ['kinh kim cang'] };
    const viPhapHoa = { id: 'book_1787189827026_8b568f64', title: 'KINH DIỆU PHÁP LIÊN HOA', tags: ['kinh pháp hoa'] };
    const viLangNghiem = { id: 'book_1788482371938_34f43522', title: 'KINH THỦ LĂNG NGHIÊM', tags: ['lăng nghiêm'] };

    expect(getSutraPriorityRank(viDiaTang)).toBe(1);
    expect(getSutraPriorityRank(viKimCang)).toBe(2);
    expect(getSutraPriorityRank(viPhapHoa)).toBe(3);
    expect(getSutraPriorityRank(viLangNghiem)).toBe(4);

    // English localized articles
    const enDiaTang = { id: 'tt_1780910773084', title: 'Ksitigarbha Bodhisattva Fundamental Vows Sutra', tags: [] };
    const enKimCang = { id: 'tt_1781359043077', title: 'Diamond Sutra (Vajracchedika Prajnaparamita Sutra)', tags: [] };
    const enPhapHoa = { id: 'book_1787189827026_8b568f64', title: 'Lotus Sutra (Saddharma Pundarika Sutra)', tags: [] };
    const enLangNghiem = { id: 'book_1788482371938_34f43522', title: 'Shurangama Sutra', tags: [] };

    expect(getSutraPriorityRank(enDiaTang)).toBe(1);
    expect(getSutraPriorityRank(enKimCang)).toBe(2);
    expect(getSutraPriorityRank(enPhapHoa)).toBe(3);
    expect(getSutraPriorityRank(enLangNghiem)).toBe(4);
  });

  it('does not classify Vajradhatu ritual tags as the Diamond Sutra', () => {
    expect(getSutraPriorityRank({
      id: 'tt_nghi_quy_tuy_cau_tuc_dac',
      title: 'NGHI QUỸ ĐÀ LA NI TÙY CẦU TỨC ĐẮC',
      tags: ['Nghi Quỹ Đà La Ni Tùy Cầu Tức Đắc', 'Kim Cang Đảnh Du Già', 'HT Thích Viên Đức', 'Mật Giáo', 'Kinh Phật'],
    })).toBe(999);
    expect(getSutraPriorityRank({ id: 'other', title: 'Bản tụng', tags: ['kinh kim cang'] })).toBe(2);
  });
});
