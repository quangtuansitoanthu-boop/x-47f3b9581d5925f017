import { describe, it, expect } from 'vitest';
import { countReflectionWords, REFLECTION_MINIMUM_WORDS } from '$lib/domain/practice/personal-practice';

describe('Personal Journal Validation Logic', () => {
  it('rejects public share if content has fewer than 50 words', () => {
    const shortContent = 'Hôm nay con nóng giận với bạn đồng nghiệp.';
    const words = countReflectionWords(shortContent);
    expect(words).toBeLessThan(REFLECTION_MINIMUM_WORDS);
    const canShare = words >= REFLECTION_MINIMUM_WORDS;
    expect(canShare).toBe(false);
  });

  it('allows public share when content reaches 50 words or more', () => {
    const fullContent = 'Trưa nay trong bữa cơm gia đình, vì công việc áp lực nên con đã không kiềm chế được cơn giận, lớn tiếng gắt gỏng với mẹ khiến mẹ buồn lòng. Con nhận thấy đây là khẩu nghiệp do tâm sân và thiếu chánh niệm. Con xin chí thành phát lồ sám hối trước Tam Bảo và đại chúng, nguyện từ nay thực tập ái ngữ, giữ tâm nhu hòa.';
    const words = countReflectionWords(fullContent);
    expect(words).toBeGreaterThanOrEqual(REFLECTION_MINIMUM_WORDS);
    const canShare = words >= REFLECTION_MINIMUM_WORDS;
    expect(canShare).toBe(true);
  });
});
