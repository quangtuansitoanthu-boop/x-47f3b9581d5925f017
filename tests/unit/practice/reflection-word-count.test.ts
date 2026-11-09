import { describe, it, expect } from 'vitest';
import { countReflectionWords, REFLECTION_MINIMUM_WORDS } from '$lib/domain/practice/personal-practice';

describe('countReflectionWords', () => {
  it('returns 0 for empty or whitespace-only strings', () => {
    expect(countReflectionWords('')).toBe(0);
    expect(countReflectionWords('   \n\t  ')).toBe(0);
  });

  it('counts words accurately across spaces, tabs, and newlines', () => {
    const text = 'Hôm nay con quán chiếu lại ba nghiệp Thân Khẩu Ý';
    expect(countReflectionWords(text)).toBe(11);
  });

  it('handles multiple consecutive spaces and punctuation gracefully', () => {
    const text = '  Nam   Mô   A   Di   Đà   Phật!  \n\n  Nguyện   an lành.  ';
    expect(countReflectionWords(text)).toBe(9);
  });

  it('verifies standard minimum threshold is 50 words', () => {
    expect(REFLECTION_MINIMUM_WORDS).toBe(50);
  });
});
