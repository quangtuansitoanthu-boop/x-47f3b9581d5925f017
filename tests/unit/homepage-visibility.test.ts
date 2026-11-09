import { describe, expect, it } from 'vitest';

import { isHomepageArticleVisible } from '../../src/lib/domain/library/homepage-visibility';

describe('homepage category visibility parity', () => {
  it('keeps practice categories admin-only and excludes talk albums for every role', () => {
    const sutra = { danh_muc: 'KINH PHẬT' };
    const ceremony = { danh_muc: 'CÁC NGHI THỨC' };
    const publicArticle = { danh_muc: 'CHUYỆN NHÂN QUẢ', trang_thai: 'Hoàn thành' };
    const talk = { danh_muc: 'PHÁP THOẠI', playlist_json: '[]' };

    expect(isHomepageArticleVisible(sutra, 'admin')).toBe(true);
    expect(isHomepageArticleVisible(ceremony, 'admin')).toBe(true);
    expect(isHomepageArticleVisible(sutra, 'ctv')).toBe(false);
    expect(isHomepageArticleVisible(ceremony, 'user')).toBe(false);
    expect(isHomepageArticleVisible(publicArticle, 'ctv')).toBe(true);
    expect(isHomepageArticleVisible(talk, 'admin')).toBe(false);

    const pendingArticle = { danh_muc: 'CHUYỆN NHÂN QUẢ', trang_thai: 'Chờ duyệt' };
    expect(isHomepageArticleVisible(pendingArticle, 'guest')).toBe(false);
    expect(isHomepageArticleVisible(pendingArticle, 'user')).toBe(false);
    expect(isHomepageArticleVisible(pendingArticle, 'ctv')).toBe(true);
    expect(isHomepageArticleVisible(pendingArticle, 'admin')).toBe(true);

    const rejectedArticle = { danh_muc: 'CHUYỆN NHÂN QUẢ', trang_thai: 'Trả lại: Cần sửa lỗi' };
    expect(isHomepageArticleVisible(rejectedArticle, 'guest')).toBe(false);
    expect(isHomepageArticleVisible(rejectedArticle, 'user')).toBe(false);
    expect(isHomepageArticleVisible(rejectedArticle, 'ctv')).toBe(true);
    expect(isHomepageArticleVisible(rejectedArticle, 'admin')).toBe(true);

    const draftArticle = { danh_muc: 'CHUYỆN NHÂN QUẢ', trang_thai: 'Đang cập nhật' };
    expect(isHomepageArticleVisible(draftArticle, 'guest')).toBe(false);
    expect(isHomepageArticleVisible(draftArticle, 'user')).toBe(false);
    expect(isHomepageArticleVisible(draftArticle, 'ctv')).toBe(true);
  });
});
