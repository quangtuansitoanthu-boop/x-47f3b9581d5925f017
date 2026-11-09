import { describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ current: 'en' }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => locale }));
import { createInterfaceTranslator } from '../../src/lib/i18n/interface';
import copy from '../../src/lib/i18n/interface-en.json';
import { localizeTalkTopic } from '../../src/lib/i18n/talk-video';

describe('interface translation boundaries', () => {
  it('localizes known Dharma topics while preserving original values and custom names', () => {
    expect(localizeTalkTopic('Pháp ngữ', 'en')).toBe('Dharma sayings');
    expect(copy['Pháp ngữ']).toBe('Dharma sayings');
    expect(localizeTalkTopic('Nhân quả', 'en')).toBe('Karma');
    expect(localizeTalkTopic('Pháp ngữ', 'vi')).toBe('Pháp ngữ');
    expect(localizeTalkTopic(' Đăng nhập ', 'en')).toBe(' Đăng nhập ');
    expect(localizeTalkTopic('__proto__', 'en')).toBe('__proto__');
    expect(localizeTalkTopic(undefined, 'en')).toBe('Dharma sayings');
  });
  it('switches interface copy while retaining Vietnamese originals', () => {
    const t = createInterfaceTranslator();
    locale.current = 'en';
    expect(t('Đăng nhập')).toBe('Sign in');
    expect(t.locale()).toBe('en-GB');
    locale.current = 'vi';
    expect(t('Đăng nhập')).toBe('Đăng nhập');
    expect(t.locale()).toBe('vi-VN');
  });
  it('preserves user-entered names inside translated messages and unknown scripture', () => {
    locale.current = 'en';
    const t = createInterfaceTranslator();
    expect(t('Xóa {0}', 'Đăng nhập')).toBe('Delete Đăng nhập');
    expect(t('Nam mô Địa Tạng Vương Bồ Tát')).toBe('Nam mô Địa Tạng Vương Bồ Tát');
    expect(t('constructor')).toBe('constructor');
    expect(t('Thêm vào nghe sau: {0}', 'Pháp thoại của tôi')).toBe('Add to listen later: Pháp thoại của tôi');
    expect(t('Đang tải {0}…', 'Bài giảng riêng')).toBe('Downloading Bài giảng riêng…');
  });
  it('preserves interpolation markers and confirmation tokens', () => {
    for (const [source, translated] of Object.entries(copy)) {
      expect((translated.match(/\{\d+\}/gu) || []).sort(), source).toEqual((source.match(/\{\d+\}/gu) || []).sort());
    }
    expect(copy['XOÁ']).toBe('XOÁ');
    expect(copy['Nhập XOÁ để xác nhận']).toContain('XOÁ');
  });
  it.each([
    ['Quản lý tu tập', 'Practice management'],
    ['Quản lý thành viên', 'Member management'],
    ['Cài đặt hệ thống', 'System settings'],
    ['Tự tay chép lời kinh, rà soát và lưu bản chép', 'Copy sutra passages, review your work, and save your copy'],
    ['Quản lý bản PDF ngoại tuyến', 'Manage offline PDF'],
    ['Ngoại tuyến', 'Offline'],
    ['Loại sách', 'Book type'],
    ['Đóng nền tùy chọn', 'Close settings backdrop'],
    ['Cài đặt chép kinh', 'Sutra copying settings'],
    ['Đọc để chép', 'Read aloud while copying'],
    ['Dùng trình đọc Kinh sách. Ưu tiên giọng ngoại tuyến đã cài trên thiết bị.', 'Uses the Library reader. Prefers offline voices installed on your device.'],
    ['Mặc định thiết bị', 'Device default'],
    ['Tốc độ đọc', 'Reading speed'],
    ['Cỡ chữ kinh mẫu', 'Reference text size'],
    ['Danh hiệu truyền thống', 'Traditional recitations'],
    ['Danh hiệu của bạn', 'Your recitations'],
    ['Thêm mới', 'Add new'],
    ['Thêm tùy chọn mới...', 'Add a custom recitation...'],
    ['Nhập danh hiệu hoặc câu chú mới', 'Enter a new sacred name or mantra'],
    ['Danh hiệu hoặc câu chú tùy chọn', 'Custom sacred name or mantra'],
    ['Ví dụ: Nam mô Tiêu Tai Diên Thọ Dược Sư Phật, Om Tare...', 'Example: Nam mô Tiêu Tai Diên Thọ Dược Sư Phật, Om Tare...'],
    ['Ghi nhận loại công phu:', 'Record as:'],
    ['Niệm danh hiệu', 'Buddha Recitation'],
    ['Lưu vào danh sách lựa chọn', 'Save to the selection list'],
    ['Xóa khỏi danh sách', 'Remove from the list'],
    ['Danh hiệu đã có trong danh sách, nhưng chưa thể chuyển lựa chọn. Hãy thử lại.', 'This recitation is already in the list, but could not be selected. Please try again.'],
    ['Công phu thường nhật', 'Daily practice'],
    ['Biên chép công đức', 'Mindful copying'],
    ['Thanh tịnh & Giới luật', 'Purity & precepts'],
    ['Kho kinh điển & Nghi thức', 'Sutras & rituals'],
    ['NGÀY THẬP TRAI', 'TEN FASTING DAYS'],
    ['VÍA PHẬT & BỒ TÁT', 'BUDDHA & BODHISATTVA OBSERVANCES'],
    ['THỌ KHANG BẢO GIÁM', 'THO KHANG BAO GIAM'],
    ['LỊCH TU TẬP', 'PRACTICE CALENDAR'],
    ['Chạm để xem chi tiết', 'Tap to view details'],
    ['Chi tiết nhắc nhở bên dưới', 'Reminder details below'],
    ['Trang sau', 'Next page'],
    ['Sau', 'Next'],
    ['Trang {0}', 'Page {0}'],
    ['Tập {0}', 'Volume {0}'],
  ])('localizes the previously untranslated interface label %s', (source, english) => {
    const t = createInterfaceTranslator();
    locale.current = 'en';
    expect(t(source)).toBe(english);
    locale.current = 'vi';
    expect(t(source)).toBe(source);
  });
  it('localizes saved custom recitation messages while preserving the entered recitation', () => {
    locale.current = 'en';
    const t = createInterfaceTranslator();
    const phrase = 'Nam mô Tiêu Tai Diên Thọ Dược Sư Phật';
    expect(t('📿 Đã lưu “{0}” vào danh sách lựa chọn', phrase)).toBe(`📿 Saved “${phrase}” to the selection list`);
    expect(t('🗑️ Đã xóa “{0}” khỏi danh sách lựa chọn', phrase)).toBe(`🗑️ Removed “${phrase}” from the selection list`);
  });
  it('localizes the talk Top 10 count unit and unavailable-count message', () => {
    const t = createInterfaceTranslator();
    const unavailable = 'Chưa tải được lượt nghe. Vui lòng thử lại sau.';
    locale.current = 'en';
    expect(t('lượt phát')).toBe('plays');
    expect(t(unavailable)).toBe('Could not load play counts. Please try again later.');
    locale.current = 'vi';
    expect(t('lượt phát')).toBe('lượt phát');
    expect(t(unavailable)).toBe(unavailable);
  });
});
