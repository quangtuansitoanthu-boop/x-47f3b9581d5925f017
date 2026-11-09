import { describe, expect, it } from 'vitest';
import {
  cleanPastedHtml,
  cleanPastedHtmlRegex,
  formatPlainTextToHtml,
  isVerseLine,
  isVerseBlock,
  isHeadingText,
} from '../../../src/lib/components/admin/editor/paste-cleaner';

describe('paste HTML normalizer & verse centering', () => {
  it('removes Word class tokens after recognizing headings while preserving authored classes and content', () => {
    const input = '<p class="MsoHeading2 reader-note">Hướng dẫn thực hành</p><p class="MsoNormal"><b>Giữ tiếng Việt</b> và <i>định dạng</i>.</p>';
    for (const clean of [cleanPastedHtml, cleanPastedHtmlRegex]) {
      const result = clean(input);
      expect(result).not.toMatch(/MsoHeading|MsoNormal/);
      expect(result).toContain('class="reader-note"');
      expect(result).toContain('<strong>Hướng dẫn thực hành</strong>');
      expect(result).toContain('<b>Giữ tiếng Việt</b>');
      expect(result).toContain('<i>định dạng</i>');
    }
  });
  it('identifies short chanting / poetry verse lines correctly', () => {
    expect(isVerseLine('Cúng dường tất cả Phật')).toBe(true);
    expect(isVerseLine('Tôn Pháp, các Bồ Tát,')).toBe(true);
    expect(isVerseLine('Vô biên chúng Thanh-văn')).toBe(true);
    expect(isVerseLine('Và cả thảy Thánh Hiền')).toBe(true);
    expect(isVerseLine('Duyên khởi dài sáng chói')).toBe(true);
    expect(isVerseLine('Trùm đến vô biên cõi,')).toBe(true);
    expect(isVerseLine('Khắp xông các chúng sanh')).toBe(true);
    expect(isVerseLine('Đều phát lòng Bồ-đề,')).toBe(true);
    expect(isVerseLine('Xa lìa những nghiệp vọng')).toBe(true);
    expect(isVerseLine('Trọn nên đạo Vô thượng.')).toBe(true);

    // Multi-sentence prose line should NOT be a verse line
    expect(isVerseLine('Đây là câu một. Còn đây là câu hai cùng một dòng.')).toBe(false);

    // Long prose line (> 70 chars or > 14 words) should NOT be a verse line
    expect(
      isVerseLine(
        'Hôm nay chúng ta cùng nhau tìm hiểu về nghi thức tụng niệm và ý nghĩa sâu xa của các bài kệ cúng dường trong đời sống tu tập hằng ngày.'
      )
    ).toBe(false);
  });

  it('automatically centers short verse lines from the user image', () => {
    const input = `
      <p>Cúng dường tất cả Phật</p>
      <p>Tôn Pháp, các Bồ Tát,</p>
      <p>Vô biên chúng Thanh-văn</p>
      <p>Và cả thảy Thánh Hiền</p>
    `;
    const cleaned = cleanPastedHtml(input);

    expect(cleaned).toContain('text-align: center');
    expect(cleaned).not.toContain('text-align: justify');
    expect(cleaned).toContain('Cúng dường tất cả Phật');
    expect(cleaned).toContain('Tôn Pháp, các Bồ Tát,');
  });

  it('automatically justifies continuous prose paragraphs', () => {
    const prose = `
      <p>Khi thực hành cúng dường, người Phật tử cần giữ tâm thanh tịnh, không cầu danh lợi hay báo đáp, mà chỉ nhất tâm hướng về Tam Bảo với lòng tri ân sâu sắc đối với mười phương chư Phật.</p>
    `;
    const cleaned = cleanPastedHtml(prose);

    expect(cleaned).toContain('text-align: justify');
    expect(cleaned).not.toContain('text-align: center');
  });

  it('centers stanzas with <br> line breaks', () => {
    const stanza = `
      <p>Cúng dường tất cả Phật<br>Tôn Pháp, các Bồ Tát,<br>Vô biên chúng Thanh-văn<br>Và cả thảy Thánh Hiền</p>
    `;
    const cleaned = cleanPastedHtml(stanza);

    expect(cleaned).toContain('text-align: center');
    expect(cleaned).toContain('<br');
  });

  it('preserves existing text-align: right for author signatures or dates', () => {
    const signature = '<p style="text-align: right;">(Thích Nhất Hạnh)</p>';
    const cleaned = cleanPastedHtml(signature);

    expect(cleaned).toContain('text-align: right');
    expect(cleaned).not.toContain('text-align: center');
  });

  it('preserves intentional Word paragraph alignment instead of replacing it with heuristics', () => {
    const input = `
      <p style="mso-style-name:Normal; text-align: center; font-family: Calibri;">Đoạn văn dài này được người biên tập chủ ý căn giữa trong tài liệu Word và phải giữ nguyên khi dán vào trình soạn thảo.</p>
      <p style="text-align: left; font-size: 11pt;">Đoạn văn dài này được người biên tập chủ ý căn trái trong tài liệu Word và không được tự động đổi thành căn đều hai bên.</p>
    `;
    const cleaned = cleanPastedHtml(input);

    expect(cleaned).toContain('text-align: center');
    expect(cleaned).toContain('text-align: left');
    expect(cleaned).not.toContain('font-family');
    expect(cleaned).not.toContain('font-size');
    expect(cleaned).not.toContain('text-align: justify');
  });

  it('strips font-family and font-size while applying default alignments', () => {
    const input = `
      <p style="font-family: Calibri; font-size: 11pt; font-weight: bold;">Cúng dường tất cả Phật</p>
      <p style="font-family: Arial; font-size: 12pt;">Đây là một đoạn văn dài miêu tả về ý nghĩa của việc tu học Phật pháp trong đời sống hàng ngày của mỗi người con Phật khi bước vào cửa chùa.</p>
    `;
    const cleaned = cleanPastedHtml(input);

    expect(cleaned).not.toContain('font-family');
    expect(cleaned).not.toContain('font-size');
    expect(cleaned).not.toContain('Calibri');
    expect(cleaned).not.toContain('Arial');
    expect(cleaned).toContain('font-weight: bold');
    // First paragraph (short verse) is centered
    expect(cleaned).toContain('text-align: center');
    // Second paragraph (prose) is justified
    expect(cleaned).toContain('text-align: justify');
  });

  it('converts plain text verses into centered paragraphs and prose into justified paragraphs', () => {
    const plainText = `Cúng dường tất cả Phật
Tôn Pháp, các Bồ Tát,

Khi thực hành cúng dường, người Phật tử cần giữ tâm thanh tịnh, không cầu danh lợi hay báo đáp, mà chỉ nhất tâm hướng về Tam Bảo với lòng tri ân sâu sắc.`;

    const html = formatPlainTextToHtml(plainText);

    expect(html).toContain('<p style="text-align: center">Cúng dường tất cả Phật</p>');
    expect(html).toContain('<p style="text-align: center">Tôn Pháp, các Bồ Tát,</p>');
    expect(html).toContain('<p style="text-align: justify">Khi thực hành cúng dường');
  });

  it('identifies book and chapter headings from user images correctly', () => {
    // Image 1
    expect(isHeadingText('ĐOẠN VI')).toBe(true);
    expect(isHeadingText('CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT')).toBe(true);

    // Image 2
    expect(isHeadingText('PHẦN THỨ NHẤT - PHẦN TỰA')).toBe(true);
    expect(isHeadingText('CHƯƠNG I')).toBe(true);
    expect(isHeadingText('TỰA CHUNG')).toBe(true);

    // Mixed case prefixed headings
    expect(isHeadingText('Đoạn VI: Mở đầu')).toBe(true);
    expect(isHeadingText('Chương 1: Khởi tâm')).toBe(true);
    expect(isHeadingText('Phần 2: Luận giải')).toBe(true);
    expect(isHeadingText('Lời nói đầu')).toBe(true);

    // Chanting verse lines should NOT be detected as headings
    expect(isHeadingText('Cúng dường tất cả Phật')).toBe(false);
    expect(isHeadingText('Tôn Pháp, các Bồ Tát,')).toBe(false);
  });

  it('automatically centers and bolds headings in HTML paste', () => {
    const input = `
      <p>ĐOẠN VI</p>
      <p>CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT</p>
      <p>PHẦN THỨ NHẤT - PHẦN TỰA</p>
      <p>CHƯƠNG I</p>
      <p>TỰA CHUNG</p>
      <p>Cúng dường tất cả Phật</p>
    `;
    const cleaned = cleanPastedHtml(input);

    // Headings must be centered and bolded
    expect(cleaned).toContain('<p style="text-align: center"><strong>ĐOẠN VI</strong></p>');
    expect(cleaned).toContain('<p style="text-align: center"><strong>CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT</strong></p>');
    expect(cleaned).toContain('<p style="text-align: center"><strong>PHẦN THỨ NHẤT - PHẦN TỰA</strong></p>');
    expect(cleaned).toContain('<p style="text-align: center"><strong>CHƯƠNG I</strong></p>');
    expect(cleaned).toContain('<p style="text-align: center"><strong>TỰA CHUNG</strong></p>');

    // Verse line should be centered but NOT forced bold
    expect(cleaned).toContain('<p style="text-align: center">Cúng dường tất cả Phật</p>');
  });

  it('automatically centers and bolds headings in plain text paste', () => {
    const plainText = `ĐOẠN VI
CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT

Cúng dường tất cả Phật
Tôn Pháp, các Bồ Tát,

Đoạn văn xuôi dài mô tả nội dung của bài viết sẽ được căn đều hai bên như bình thường.`;

    const html = formatPlainTextToHtml(plainText);

    expect(html).toContain('<p style="text-align: center"><strong>ĐOẠN VI</strong></p>');
    expect(html).toContain('<p style="text-align: center"><strong>CHỈ RÕ TÍNH-THẤY KHÔNG PHẢI LÀ CON MẮT</strong></p>');
    expect(html).toContain('<p style="text-align: center">Cúng dường tất cả Phật</p>');
    expect(html).toContain('<p style="text-align: justify">Đoạn văn xuôi dài mô tả');
  });

  it('centers native HTML heading tags (h1-h6) and ensures bold', () => {
    const input = '<h2>CHƯƠNG I: PHÁP NGỮ</h2>';
    const cleaned = cleanPastedHtml(input);

    expect(cleaned).toContain('text-align: center');
    expect(cleaned).toContain('CHƯƠNG I: PHÁP NGỮ');
  });
});
