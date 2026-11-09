import { describe, it, expect } from 'vitest';
import {
  ensureAbsoluteUrl,
  getImageMimeType,
  cleanMetaDescription,
  DEFAULT_SITE_TITLE,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_TALK_TITLE,
  DEFAULT_FALLBACK_IMAGE,
} from '$lib/domain/social-preview';

describe('social-preview domain helpers', () => {
  it('preserves supplementary Unicode characters from decimal and hex HTML entities', () => {
    expect(cleanMetaDescription('<p>Chánh niệm &#128591; &#x1F338;</p>', 'fallback'))
      .toBe('Chánh niệm 🙏 🌸');
  });

  it('does not split an emoji at the description length boundary', () => {
    const result = cleanMetaDescription('ABC🙏 lời nhắc dài', 'fallback', 7);
    expect(result).toBe('ABC...');
  });

  it('keeps invalid numeric entities without throwing or corrupting the description', () => {
    expect(cleanMetaDescription('Giữ &#x110000; &#55296; &#0;', 'fallback'))
      .toBe('Giữ &#x110000; &#55296; &#0;');
  });

  it('formats absolute URLs correctly for relative paths', () => {
    const origin = 'https://quangtu.vn';
    expect(ensureAbsoluteUrl('/assets/images/cover.jpg', origin)).toBe('https://quangtu.vn/assets/images/cover.jpg');
    expect(ensureAbsoluteUrl('assets/images/cover.jpg', origin)).toBe('https://quangtu.vn/assets/images/cover.jpg');
  });

  it('keeps already absolute https URLs intact and upgrades non-localhost http to https', () => {
    const origin = 'https://quangtu.vn';
    const remoteUrl = 'https://images.unsplash.com/photo-12345?w=800';
    expect(ensureAbsoluteUrl(remoteUrl, origin)).toBe(remoteUrl);
    expect(ensureAbsoluteUrl('http://quangtu.vn/cover.png', origin)).toBe('https://quangtu.vn/cover.png');
    expect(ensureAbsoluteUrl('//cdn.example.com/cover.webp', origin)).toBe('https://cdn.example.com/cover.webp');
  });

  it('detects image mime types correctly', () => {
    expect(getImageMimeType('https://quangtu.vn/cover.jpg')).toBe('image/jpeg');
    expect(getImageMimeType('https://quangtu.vn/cover.jpeg?w=800')).toBe('image/jpeg');
    expect(getImageMimeType('https://quangtu.vn/cover.png')).toBe('image/png');
    expect(getImageMimeType('https://quangtu.vn/cover.webp')).toBe('image/webp');
    expect(getImageMimeType('https://quangtu.vn/cover.svg')).toBe('image/svg+xml');
    expect(getImageMimeType('')).toBe('image/png');
  });

  it('recognizes cover image extensions before a URL fragment', () => {
    expect(getImageMimeType('https://quangtu.vn/cover.png#preview')).toBe('image/png');
    expect(getImageMimeType('https://quangtu.vn/cover.WEBP#preview?size=small')).toBe('image/webp');
  });

  it('falls back to default branding image when rawUrl is empty or null', () => {
    const origin = 'https://quangtu.vn';
    expect(ensureAbsoluteUrl('', origin)).toBe(`https://quangtu.vn${DEFAULT_FALLBACK_IMAGE}`);
    expect(ensureAbsoluteUrl(null, origin)).toBe(`https://quangtu.vn${DEFAULT_FALLBACK_IMAGE}`);
    expect(ensureAbsoluteUrl(undefined, origin)).toBe(`https://quangtu.vn${DEFAULT_FALLBACK_IMAGE}`);
  });

  it('cleans and strips HTML and decodes HTML entities from meta descriptions', () => {
    const html = '<p>Bài giảng &quot;<strong>Phật pháp</strong>&quot; sâu sắc &amp; ý nghĩa về <em>Nhân quả</em>.</p>';
    expect(cleanMetaDescription(html, DEFAULT_SITE_DESCRIPTION)).toBe('Bài giảng "Phật pháp" sâu sắc & ý nghĩa về Nhân quả.');
  });

  it('truncates long descriptions cleanly', () => {
    const longText = 'A'.repeat(300);
    const cleaned = cleanMetaDescription(longText, DEFAULT_SITE_DESCRIPTION, 100);
    expect(cleaned.length).toBe(100);
    expect(cleaned.endsWith('...')).toBe(true);
  });

  it('falls back to default description when text is empty', () => {
    expect(cleanMetaDescription('', DEFAULT_SITE_DESCRIPTION)).toBe(DEFAULT_SITE_DESCRIPTION);
    expect(cleanMetaDescription(null, DEFAULT_SITE_DESCRIPTION)).toBe(DEFAULT_SITE_DESCRIPTION);
  });
});
