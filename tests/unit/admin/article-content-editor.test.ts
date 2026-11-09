import { describe, expect, it } from 'vitest';

import {
  createArticleEditorHtml,
  createArticleImageHtml,
  createArticleLinkHtml,
  createArticleTableHtml,
  isSafeEditorLink,
} from '../../../src/lib/components/admin/articles/article-content-editor';

describe('article content editor helpers', () => {
  it('opens legacy token content as safe visual HTML', () => {
    const html = createArticleEditorHtml('Nội dung **in đậm** và _in nghiêng_.');

    expect(html).toContain('<strong>in đậm</strong>');
    expect(html).toContain('<em>in nghiêng</em>');
  });

  it('sanitizes stored HTML before placing it in the editable DOM', () => {
    const html = createArticleEditorHtml(
      '<p onclick="steal()" style="font-size:18px;position:fixed">Nội dung</p><script>alert(1)</script>',
    );

    expect(html).toBe('<p style="font-size:18px">Nội dung</p>');
  });

  it('converts image markdown to safe same-origin image markup', () => {
    const html = createArticleImageHtml('![Logo](/assets/branding/tu-tap-logo.png)');

    expect(html).toContain('<img src="/assets/branding/tu-tap-logo.png"');
    expect(createArticleImageHtml('![x](javascript:alert(1))')).not.toContain('<img');
  });

  it('accepts only safe editor links', () => {
    expect(isSafeEditorLink('https://quangtu.vn/noi-dung')).toBe(true);
    expect(isSafeEditorLink('mailto:lienhe@quangtu.vn')).toBe(true);
    expect(isSafeEditorLink('/noi-dung')).toBe(true);
    expect(isSafeEditorLink('javascript:alert(1)')).toBe(false);
    expect(isSafeEditorLink('//evil.example')).toBe(false);
  });

  it('creates safe links for selected or newly inserted text', () => {
    expect(createArticleLinkHtml('https://quangtu.vn/noi-dung', 'Đọc tiếp'))
      .toBe('<a href="https://quangtu.vn/noi-dung">Đọc tiếp</a>');
    expect(createArticleLinkHtml('javascript:alert(1)', 'Không an toàn')).toBe('');
    expect(createArticleLinkHtml('/noi-dung', '<b>Nhãn</b>')).toContain('&lt;b&gt;Nhãn&lt;/b&gt;');
  });

  it('creates bounded accessible tables', () => {
    const html = createArticleTableHtml(3, 2, true);

    expect(html).toContain('<th scope="col">Cột 1</th>');
    expect(html.match(/<tr>/gu)).toHaveLength(3);
    expect(html.match(/<td>/gu)).toHaveLength(4);
    expect(createArticleTableHtml(99, 99).match(/<th /gu)).toHaveLength(8);
  });
});
