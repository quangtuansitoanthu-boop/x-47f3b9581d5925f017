import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reading adoption prompt', () => {
  it('surfaces an explicit one-time choice and tracks every session transition globally', () => {
    const prompt = readFileSync('src/lib/components/reader/ReadingAdoptionPrompt.svelte', 'utf8');
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');

    expect(layout).toContain('<ReadingAdoptionPrompt initialSession={sessionStore.value} />');
    expect(prompt).toContain('client?.shouldOfferAnonymousAdoption(userId)');
    expect(prompt).toContain('client?.keepAnonymousQueueSeparate(offeredUserId)');
    expect(prompt).toContain('Không thể lưu lựa chọn trên thiết bị. Hãy giải phóng dung lượng rồi thử lại.');
    expect(prompt).toContain('} catch {');
    expect(prompt).toContain('client.adoptAnonymousQueue(userId)');
    expect(prompt).toContain('client.prepareAnonymousAdoption(userId)');
    expect(prompt).toContain('isReadingActivityCapacityError(cause)');
    expect(prompt).toContain('Hàng đợi đọc quá lớn để gộp an toàn.');
    expect(prompt).toContain('Thiết bị chưa thể lưu dữ liệu đã gộp.');
    expect(prompt).toContain('await client.flush()');
    expect(prompt).toContain('window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged)');
    expect(prompt).toContain('window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged)');
    expect(prompt).toContain('Giữ riêng');
    expect(prompt).toContain('Gộp vào tài khoản');
    expect(prompt).toContain('Cần kết nối mạng để đối chiếu dữ liệu tài khoản trước khi gộp.');
  });
});
