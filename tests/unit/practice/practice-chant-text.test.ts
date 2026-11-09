// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { practiceChantText } from '$lib/browser/practice-chant-text';

describe('practice chant text', () => {
  it('removes leading mantra numbers across HTML lines without changing displayed content', () => {
    const html = '<p>1. Nam mô A Di Đà Phật<br>02) Nam mô Quán Thế Âm Bồ Tát</p><p>(3) Án ma ni bát mê hồng</p><p>[4] Nam mô Địa Tạng Vương Bồ Tát</p><div>5 Nam mô Dược Sư Phật</div>';
    expect(practiceChantText(html)).toBe('Nam mô A Di Đà Phật Nam mô Quán Thế Âm Bồ Tát Án ma ni bát mê hồng Nam mô Địa Tạng Vương Bồ Tát Nam mô Dược Sư Phật');
    expect(html).toContain('1.');
  });

  it('preserves numbers within the text and strips standalone ordinal lines', () => {
    expect(practiceChantText('<p>01</p><p>Nguyện một lòng trì tụng 108 lần.</p><p>2. Nam mô Phật.</p>'))
      .toBe('Nguyện một lòng trì tụng 108 lần. Nam mô Phật.');
    expect(practiceChantText('<p>3.14 là một số.</p>')).toBe('3.14 là một số.');
    expect(practiceChantText('<h3>I. Trì tụng</h3><p>II. Nam mô Phật.</p><p>3– Án ma ni bát mê hồng.</p><p>(7 biến)</p>'))
      .toBe('Trì tụng Nam mô Phật. Án ma ni bát mê hồng. (7 biến)');
  });
});
