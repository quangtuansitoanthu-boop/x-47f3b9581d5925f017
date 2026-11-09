import { describe, expect, it } from 'vitest';
import { userTestimonials } from '$lib/i18n/user-testimonials';

describe('user testimonials', () => {
  it('replaces Thanh Phương with Đức Tịnh Hiếu', () => {
    const thanhPhuong = userTestimonials.find((t) => t.name === 'Thanh Phương');
    expect(thanhPhuong).toBeUndefined();

    const ducTinhHieu = userTestimonials.find((t) => t.name === 'Đức Tịnh Hiếu');
    expect(ducTinhHieu).toBeDefined();
    expect(ducTinhHieu?.paragraphs.length).toBeGreaterThan(0);
    expect(ducTinhHieu?.paragraphs[0]).toContain('App có nhiều tính năng phù hợp');
    // Ensure no redundant signature when the name is already Đức Tịnh Hiếu
    expect(ducTinhHieu?.signature).toBeUndefined();
  });
});
