import { describe, expect, it } from 'vitest';
import { completedPracticeDisplayType, resolvePracticeDisplayName } from '../../../src/lib/domain/practice/progress-display';

const empty = new Map<string, string>();
const name = (title: string | null, source: string | null, fallback = 'Tụng kinh') =>
  resolvePracticeDisplayName(title, source, fallback, empty, empty);

describe('practice progress display names', () => {
  it.each([null, 'custom:cp_1793419040777_wjlpf'])('does not expose a custom selection key when the saved title is %s', title => {
    expect(name(title, 'custom:cp_1793419040777_wjlpf', 'Niệm danh hiệu')).toBe('Niệm danh hiệu');
    expect(name('Danh hiệu tự chọn', 'custom:cp_1793419040777_wjlpf')).toBe('Danh hiệu tự chọn');
  });
  it.each(['tt_1781742129071', 'pt_drive_74959767068eaae1db4846f62b62eda8:0', 'completed-tool:Lễ Phật', 'manual:campaign:1', 'legacy_import_123', '12345678-1234-1234-1234-123456789abc'])('never presents internal source %s as a title', id => {
    expect(name(null, id)).toBe('Tụng kinh');
    expect(name(id, id)).toBe('Tụng kinh');
  });
  it('recovers the verified historical title without reintroducing the removed catalog item', () => {
    expect(name(null, 'tt_1781742129070')).toBe('NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT');
    expect(name('tt_1781742129070', null)).toBe('NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT');
  });
  it('prefers the saved specific title, then existing catalog names, without changing input', () => {
    const row = Object.freeze({ title: 'NGHI THỨC TRÌ TỤNG', sourceId: 'tt_1781742129070' });
    expect(name(row.title, row.sourceId)).toBe(row.title);
    const albums = new Map([['pt_drive_abc', 'Tên album đã có']]);
    expect(resolvePracticeDisplayName(null, 'pt_drive_abc:0', 'Pháp thoại', empty, albums)).toBe('Tên album đã có');
    expect(resolvePracticeDisplayName('pt_drive_abc:0', 'pt_drive_abc:0', 'Pháp thoại', empty, albums)).toBe('Tên album đã có');
    expect(resolvePracticeDisplayName(123, 'tt_123', 'Tụng kinh', empty, empty)).toBe('Tụng kinh');
    expect(name(null, 'Nam mô A Di Đà Phật')).toBe('Nam mô A Di Đà Phật');
    expect(row.sourceId).toBe('tt_1781742129070');
  });
  it('classifies prostrations by existing source metadata without confusing recitation titles', () => {
    expect(completedPracticeDisplayType({ sourceKind: 'manual_log', sourceId: 'completed-tool:Lễ Phật' })).toBe('Lễ Phật');
    expect(completedPracticeDisplayType({ sourceKind: 'legacy_import', sourceId: 'Lễ Phật' })).toBe('Lễ Phật');
    expect(completedPracticeDisplayType({ sourceKind: 'legacy_import', sourceId: 'Lễ Phật — A Di Đà', practiceType: 'Lễ Phật' })).toBe('Lễ Phật');
    expect(completedPracticeDisplayType({ sourceKind: 'manual_log', sourceId: 'campaign-id', practiceType: 'Lễ Phật' })).toBe('Lễ Phật');
    expect(completedPracticeDisplayType({ sourceKind: 'guided_rosary', sourceId: 'Nam mô A Di Đà Phật' })).toBeNull();
    expect(completedPracticeDisplayType({ sourceKind: 'manual_log', sourceId: 'completed-tool:Chép danh hiệu' })).toBe('Chép danh hiệu');
    expect(completedPracticeDisplayType({ sourceKind: 'manual_log', sourceId: 'completed-tool:Chép kinh' })).toBe('Chép kinh');
    expect(completedPracticeDisplayType({ sourceKind: 'article', sourceId: 'Lễ Phật' })).toBeNull();
  });
});
