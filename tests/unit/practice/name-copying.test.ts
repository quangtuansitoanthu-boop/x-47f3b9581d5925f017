import { recordCompletedNameCopyingRound, resetNameCopyingData, completeNameCopyingSession } from '../../../src/lib/browser/name-copying-storage';
import { getPracticeStorage } from '../../../src/lib/browser/practice-storage';
import { createPrincipalStorage } from '../../../src/lib/browser/principal-storage';
import { createPracticeLog } from '../../../src/lib/domain/practice/logs';
import { describe, expect, it } from 'vitest';
import { createNameCopyingDraft, readNameCopyingDraft, saveNameCopyingDraft, completeNameCopyingRound, nameCopyingTotal } from '../../../src/lib/browser/name-copying-storage';
import { matchesNameCopyingPhrase, NAME_COPYING_PHRASES } from '../../../src/lib/domain/practice/name-copying';
import { completedLogNumericId, COMPLETED_LOG_OUTBOX_KEY } from '../../../src/lib/browser/practice-log-outbox';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe('name copying drafts', () => {
  it('records a completed 108-name round once even when retried after a draft-save failure', () => {
    const storage = memoryStorage(); const phrase = NAME_COPYING_PHRASES[0];
    recordCompletedNameCopyingRound(storage, 'a', phrase, 108);
    recordCompletedNameCopyingRound(storage, 'a', phrase, 108);
    expect(getPracticeStorage(createPrincipalStorage(storage, 'a')).getLogs()).toMatchObject([{ count: 108, type: 'Chép danh hiệu', note: phrase }]);
    recordCompletedNameCopyingRound(storage, 'a', phrase, 216);
    expect(getPracticeStorage(createPrincipalStorage(storage, 'a')).getLogs()).toHaveLength(2);
    expect(getPracticeStorage(createPrincipalStorage(storage, 'b')).getLogs()).toHaveLength(0);
  });

  it('requires the complete title with correct Vietnamese accents while accepting equivalent Unicode', () => {
    for (const phrase of NAME_COPYING_PHRASES) {
      expect(matchesNameCopyingPhrase(phrase.normalize('NFD'), phrase)).toBe(true);
      expect(matchesNameCopyingPhrase(phrase.slice(0, -1), phrase)).toBe(false);
    }
    expect(matchesNameCopyingPhrase('nam mo a di da phat', 'Nam mô A Di Đà Phật')).toBe(false);
    expect(matchesNameCopyingPhrase('Nam mô A Di Đà Phát', 'Nam mô A Di Đà Phật')).toBe(false);
    expect(matchesNameCopyingPhrase('Nam mô A Di Đa Phật', 'Nam mô A Di Đà Phật')).toBe(false);
    expect(matchesNameCopyingPhrase('Nam mô Địa Tạng Vương Bồ Tát', 'Nam mô A Di Đà Phật')).toBe(false);
    expect(matchesNameCopyingPhrase('Nam mô A Di Đà Phật!', 'Nam mô A Di Đà Phật')).toBe(false);
    expect(matchesNameCopyingPhrase('  nam   mô a di đà phật  ', 'Nam mô A Di Đà Phật')).toBe(true);
    expect(matchesNameCopyingPhrase('OM MANI PAD ME HUM', 'Ôm Ma Ni Pát Mê Hùm')).toBe(false);
  });
  it('preserves previous totals when the mantra option is added', () => {
    const storage = memoryStorage();
    const previous = createNameCopyingDraft();
    previous.completed['Nam mô A Di Đà Phật'] = 216;
    previous.lines['Nam mô A Di Đà Phật'][0] = 'Nam mô A Di Đà Phật';
    const { ['Ôm Ma Ni Pát Mê Hùm']: _lines, ...oldLines } = previous.lines;
    const { ['Ôm Ma Ni Pát Mê Hùm']: _completed, ...oldCompleted } = previous.completed;
    const legacy = { ...storage, getItem: () => JSON.stringify({ ...previous, lines: oldLines, completed: oldCompleted }) };
    const restored = readNameCopyingDraft(legacy, null);
    expect(nameCopyingTotal(restored)).toBe(217);
    expect(restored.lines['Ôm Ma Ni Pát Mê Hùm']).toHaveLength(108);
    restored.selected = 'Ôm Ma Ni Pát Mê Hùm';
    restored.lines[restored.selected].fill('OM MANI PAD ME HUM');
    expect(completeNameCopyingRound(restored)).toBe(false);
    expect(restored.lines[restored.selected][0]).toBe('OM MANI PAD ME HUM');
    restored.lines[restored.selected].fill('ÔM MA NI PÁT MÊ HÙM');
    expect(completeNameCopyingRound(restored)).toBe(true);
    expect(nameCopyingTotal(restored)).toBe(325);
    const { ['Ôm Ma Ni Pát Mê Hùm']: mantraLines, ...otherLines } = restored.lines;
    const { ['Ôm Ma Ni Pát Mê Hùm']: mantraTotal, ...otherTotals } = restored.completed;
    const previousLabel = { ...storage, getItem: () => JSON.stringify({ selected: 'Om Mani PAD ME HUM',
      lines: { ...otherLines, 'Om Mani PAD ME HUM': mantraLines }, completed: { ...otherTotals, 'Om Mani PAD ME HUM': mantraTotal } }) };
    expect(readNameCopyingDraft(previousLabel, null).selected).toBe('Ôm Ma Ni Pát Mê Hùm');
    expect(nameCopyingTotal(readNameCopyingDraft(previousLabel, null))).toBe(325);
  });
  it('preserves completed totals and old unaccented draft text without confirming that text', () => {
    const storage = memoryStorage();
    const draft = createNameCopyingDraft();
    draft.completed[draft.selected] = 216;
    draft.lines[draft.selected][0] = 'NAM MO A DI DA PHAT';
    saveNameCopyingDraft(storage, 'existing-user', draft);
    const restored = readNameCopyingDraft(storage, 'existing-user');
    expect(restored.completed[restored.selected]).toBe(216);
    expect(restored.lines[restored.selected][0]).toBe('NAM MO A DI DA PHAT');
    expect(nameCopyingTotal(restored)).toBe(216);
    expect(completeNameCopyingRound(restored)).toBe(false);
    restored.lines[restored.selected][0] = 'NAM MÔ A DI ĐÀ PHẬT';
    expect(nameCopyingTotal(restored)).toBe(217);
  });
  it('rolls over every 108 valid lines once and adds the next round to the total', () => {
    const draft = createNameCopyingDraft();
    draft.selected = 'Nam mô Địa Tạng Vương Bồ Tát';
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'].fill('NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT');
    expect(nameCopyingTotal(draft)).toBe(108);
    expect(completeNameCopyingRound(draft)).toBe(true);
    expect(draft.lines['Nam mô Địa Tạng Vương Bồ Tát'].every(line => line === '')).toBe(true);
    expect(nameCopyingTotal(draft)).toBe(108);
    expect(completeNameCopyingRound(draft)).toBe(false);
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'][0] = 'NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT';
    expect(nameCopyingTotal(draft)).toBe(109);
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'].fill('NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT');
    completeNameCopyingRound(draft);
    expect(nameCopyingTotal(draft)).toBe(216);
    const storage = memoryStorage();
    saveNameCopyingDraft(storage, 'user-a', draft);
    expect(nameCopyingTotal(readNameCopyingDraft(storage, 'user-a'))).toBe(216);
    draft.selected = 'Nam mô A Di Đà Phật';
    expect(nameCopyingTotal(draft)).toBe(216);
  });

  it('does not discard incomplete or wrong-title lines', () => {
    const draft = createNameCopyingDraft();
    draft.selected = 'Nam mô Địa Tạng Vương Bồ Tát';
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'].fill('NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT');
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'][107] = 'NAM MÔ A DI ĐÀ PHẬT';
    expect(completeNameCopyingRound(draft)).toBe(false);
    expect(nameCopyingTotal(draft)).toBe(107);
    expect(draft.lines['Nam mô Địa Tạng Vương Bồ Tát'][107]).toBe('NAM MÔ A DI ĐÀ PHẬT');
  });
  it('keeps separate drafts for each title and principal without network access', () => {
    const storage = memoryStorage();
    const draft = createNameCopyingDraft();
    draft.lines['Nam mô Địa Tạng Vương Bồ Tát'][0] = 'NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT';
    draft.selected = 'Nam mô A Di Đà Phật';
    draft.lines['Nam mô A Di Đà Phật'][0] = 'NAM MÔ A DI ĐÀ PHẬT';
    saveNameCopyingDraft(storage, 'user-a', draft);
    expect(readNameCopyingDraft(storage, 'user-a')).toEqual(draft);
    expect(readNameCopyingDraft(storage, 'user-b')).toEqual(createNameCopyingDraft());
    expect(readNameCopyingDraft(storage, null)).toEqual(createNameCopyingDraft());
  });

  it('rejects corrupt and oversized persisted data and keeps valid partial lines', () => {
    const storage = memoryStorage();
    const draft = createNameCopyingDraft();
    draft.lines['Nam mô Quán Thế Âm Bồ Tát'][9] = 'Nam mô Quán';
    saveNameCopyingDraft(storage, null, draft);
    expect(readNameCopyingDraft(storage, null).lines['Nam mô Quán Thế Âm Bồ Tát'][9]).toBe('NAM MÔ QUÁN');
    const corrupt = { ...storage, getItem: () => '{broken' };
    expect(() => readNameCopyingDraft(corrupt, null)).toThrow();
    const invalid = { ...storage, getItem: () => JSON.stringify({ selected: '__proto__', lines: {} }) };
    expect(() => readNameCopyingDraft(invalid, null)).toThrow();
    draft.lines['Nam mô Quán Thế Âm Bồ Tát'][0] = 'x'.repeat(201);
    saveNameCopyingDraft(storage, null, draft);
    expect(() => readNameCopyingDraft(storage, null)).toThrow();
  });

  it('resets name copying draft and deletes all name-copying practice logs while keeping other logs intact', () => {
    const storage = memoryStorage();
    const principal = 'user-reset-test';
    const draft = createNameCopyingDraft();
    draft.completed['Nam mô A Di Đà Phật'] = 108;
    draft.lines['Nam mô A Di Đà Phật'][0] = 'NAM MÔ A DI ĐÀ PHẬT';
    draft.lines['Nam mô A Di Đà Phật'][1] = 'NAM MÔ A DI ĐÀ PHẬT';
    saveNameCopyingDraft(storage, principal, draft);

    const scoped = createPrincipalStorage(storage, principal);
    const practice = getPracticeStorage(scoped);
    practice.saveLog(createPracticeLog({ id: 101, type: 'Chép danh hiệu', count: 108, date: '2026-11-05', note: 'Nam mô A Di Đà Phật' }));
    practice.saveLog(createPracticeLog({ id: 102, type: 'Chép danh hiệu', count: 108, date: '2026-11-05', note: 'Nam mô A Di Đà Phật' }));
    practice.saveLog(createPracticeLog({ id: 201, type: 'Niệm danh hiệu', count: 500, date: '2026-11-05', note: 'Khóa chiều' }));
    practice.saveLog(createPracticeLog({ id: 202, type: 'Ngồi thiền', count: 15, date: '2026-11-05', note: 'Thiền tọa' }));

    expect(practice.getLogs()).toHaveLength(4);
    expect(nameCopyingTotal(readNameCopyingDraft(storage, principal))).toBe(110);
    const unrelatedLogs = practice.getLogs().filter(log => log.type !== 'Chép danh hiệu');

    const resetDraft = resetNameCopyingData(storage, principal);
    expect(nameCopyingTotal(resetDraft)).toBe(0);
    expect(nameCopyingTotal(readNameCopyingDraft(storage, principal))).toBe(0);
    expect(resetDraft.lines['Nam mô A Di Đà Phật'].every(l => l === '')).toBe(true);

    const remainingLogs = practice.getLogs();
    expect(remainingLogs).toHaveLength(2);
    expect(remainingLogs).toEqual(unrelatedLogs);
    expect(practice.getDeletedLogIds().has('101')).toBe(true);
    expect(practice.getDeletedLogIds().has('102')).toBe(true);
  });

  it('completes a name-copying session with x verified names, records to practice logs, and resets input lines', () => {
    const storage = memoryStorage();
    const principal = 'user-complete-session';
    const draft = createNameCopyingDraft();
    const phrase = 'Nam mô A Di Đà Phật';
    draft.selected = phrase;
    for (let i = 0; i < 10; i++) {
      draft.lines[phrase][i] = 'NAM MÔ A DI ĐÀ PHẬT';
    }
    draft.lines[phrase][10] = 'NAM MÔ';
    draft.lines[phrase][11] = 'SAI CHỮ';
    saveNameCopyingDraft(storage, principal, draft);

    const result = completeNameCopyingSession(storage, principal, draft);
    expect(result.recordedCount).toBe(10);
    expect(result.draft.completed[phrase]).toBe(10);
    expect(result.draft.lines[phrase].every(line => line === '')).toBe(true);
    expect(nameCopyingTotal(result.draft)).toBe(10);

    const scoped = createPrincipalStorage(storage, principal);
    const practice = getPracticeStorage(scoped);
    const logs = practice.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('Chép danh hiệu');
    expect(logs[0].count).toBe(10);
    expect(logs[0].note).toBe(phrase);

    const persisted = readNameCopyingDraft(storage, principal);
    expect(persisted.completed[phrase]).toBe(10);
    expect(persisted.lines[phrase].every(line => line === '')).toBe(true);
  });

  it('completes session with 0 verified names by resetting lines without adding zero-count practice logs', () => {
    const storage = memoryStorage();
    const principal = 'user-empty-session';
    const draft = createNameCopyingDraft();
    const phrase = 'Nam mô Quán Thế Âm Bồ Tát';
    draft.selected = phrase;
    draft.lines[phrase][0] = 'chưa đúng';
    saveNameCopyingDraft(storage, principal, draft);

    const result = completeNameCopyingSession(storage, principal, draft);
    expect(result.recordedCount).toBe(0);
    expect(result.draft.completed[phrase]).toBe(0);
    expect(result.draft.lines[phrase].every(line => line === '')).toBe(true);

    const scoped = createPrincipalStorage(storage, principal);
    const practice = getPracticeStorage(scoped);
    expect(practice.getLogs()).toHaveLength(0);
  });

  it('preserves the caller draft when recording succeeds but clearing its saved lines fails', () => {
    const backing = memoryStorage();
    let failDraft = false;
    const storage = { ...backing, setItem(key: string, value: string) {
      if (failDraft && key.endsWith(':tt_name_copying_draft_v1')) throw new Error('storage_full');
      backing.setItem(key, value);
    } };
    const draft = createNameCopyingDraft(), phrase = draft.selected;
    draft.lines[phrase][0] = phrase;
    draft.lines[phrase][1] = phrase;
    saveNameCopyingDraft(storage, 'retry-user', draft);
    const before = JSON.parse(JSON.stringify(draft));
    failDraft = true;

    expect(() => completeNameCopyingSession(storage, 'retry-user', draft)).toThrow('storage_full');
    expect(draft).toEqual(before);
    expect(readNameCopyingDraft(storage, 'retry-user').completed[phrase]).toBe(0);
  });

  it('retries the same partial completion after reload without crediting it again or changing its original date', () => {
    const backing = memoryStorage();
    let failDraft = false;
    const storage = { ...backing, setItem(key: string, value: string) {
      if (failDraft && key.endsWith(':tt_name_copying_draft_v1')) throw new Error('storage_full');
      backing.setItem(key, value);
    } };
    const principal = 'reload-user', draft = createNameCopyingDraft(), phrase = draft.selected;
    draft.lines[phrase][0] = phrase;
    draft.lines[phrase][1] = phrase;
    saveNameCopyingDraft(storage, principal, draft);
    failDraft = true;
    expect(() => completeNameCopyingSession(storage, principal, draft, new Date('2026-11-06T15:00:00Z'))).toThrow('storage_full');
    const practice = getPracticeStorage(createPrincipalStorage(storage, principal));
    const recorded = practice.getLogs();
    expect(recorded).toHaveLength(1);
    failDraft = false;

    const result = completeNameCopyingSession(storage, principal, readNameCopyingDraft(storage, principal), new Date('2026-11-07T15:00:00Z'));
    expect(result.recordedCount).toBe(2);
    expect(practice.getLogs()).toEqual(recorded);
    expect(result.draft.completed[phrase]).toBe(2);
    expect(result.draft.lines[phrase].every(line => line === '')).toBe(true);
    result.draft.lines[phrase][0] = phrase;
    completeNameCopyingSession(storage, principal, result.draft, new Date('2026-11-08T15:00:00Z'));
    expect(practice.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(3);
  });

  it('does not restore a deleted partial completion when retrying its uncleared draft', () => {
    const backing = memoryStorage();
    let failDraft = false;
    const storage = { ...backing, setItem(key: string, value: string) {
      if (failDraft && key.endsWith(':tt_name_copying_draft_v1')) throw new Error('storage_full');
      backing.setItem(key, value);
    } };
    const principal = 'deleted-user', draft = createNameCopyingDraft(), phrase = draft.selected;
    draft.lines[phrase][0] = phrase;
    saveNameCopyingDraft(storage, principal, draft);
    failDraft = true;
    expect(() => completeNameCopyingSession(storage, principal, draft, new Date('2026-11-06T15:00:00Z'))).toThrow('storage_full');
    const practice = getPracticeStorage(createPrincipalStorage(storage, principal));
    const id = practice.getLogs()[0].id;
    practice.deleteLog(id);
    failDraft = false;

    completeNameCopyingSession(storage, principal, readNameCopyingDraft(storage, principal), new Date('2026-11-07T15:00:00Z'));
    expect(practice.getLogs()).toEqual([]);
    expect(practice.getDeletedLogIds().has(String(id))).toBe(true);
  });

  it('credits genuinely new partial copying after an explicit reset without resurrecting the old receipt', () => {
    const storage = memoryStorage(), principal = 'new-session-after-reset';
    const draft = createNameCopyingDraft(), phrase = draft.selected;
    draft.lines[phrase][0] = phrase;
    draft.lines[phrase][1] = phrase;
    completeNameCopyingSession(storage, principal, draft, new Date('2026-11-06T15:00:00Z'));
    const practice = getPracticeStorage(createPrincipalStorage(storage, principal));
    const previous = practice.getLogs()[0];
    resetNameCopyingData(storage, principal);
    const fresh = readNameCopyingDraft(storage, principal);
    fresh.lines[phrase][0] = phrase;
    fresh.lines[phrase][1] = phrase;

    const result = completeNameCopyingSession(storage, principal, fresh, new Date('2026-11-07T15:00:00Z'));
    expect(practice.getLogs()).toHaveLength(1);
    expect(practice.getLogs()[0]).toMatchObject({ count: 2, type: 'Chép danh hiệu', date: '2026-11-07' });
    expect(practice.getLogs()[0].id).not.toBe(previous.id);
    expect(practice.getDeletedLogIds().has(String(previous.id))).toBe(true);
    expect(result.draft.completed[phrase]).toBe(2);
  });

  it('keeps legacy completion IDs and does not mint a new epoch when reading an existing draft', () => {
    const storage = memoryStorage(), principal = 'legacy-name-draft';
    const draft = createNameCopyingDraft(), phrase = draft.selected;
    saveNameCopyingDraft(storage, principal, draft);
    const first = readNameCopyingDraft(storage, principal);
    const second = readNameCopyingDraft(storage, principal);
    expect(first).not.toHaveProperty('completionEpoch');
    expect(second).toEqual(first);
    const scoped = createPrincipalStorage(storage, principal);
    const legacyId = completedLogNumericId(scoped, `name-copying:${phrase}:108`);
    recordCompletedNameCopyingRound(storage, principal, phrase, 108, undefined, first.completionEpoch);
    expect(getPracticeStorage(scoped).getLogs()).toEqual([expect.objectContaining({ id: legacyId, count: 108 })]);
  });

  it('persists the explicit reset epoch across reads, full rounds and partial completions without rotating the shared namespace', () => {
    const storage = memoryStorage(), principal = 'round-after-reset', phrase = NAME_COPYING_PHRASES[0];
    const scoped = createPrincipalStorage(storage, principal), practice = getPracticeStorage(scoped);
    recordCompletedNameCopyingRound(storage, principal, phrase, 108);
    const oldId = practice.getLogs()[0].id;
    const originalOutbox = scoped.getItem(COMPLETED_LOG_OUTBOX_KEY);
    const reset = resetNameCopyingData(storage, principal);
    const restored = readNameCopyingDraft(storage, principal);
    expect(reset.completionEpoch).toBeTruthy();
    expect(restored.completionEpoch).toBe(reset.completionEpoch);
    expect(readNameCopyingDraft(storage, principal).completionEpoch).toBe(reset.completionEpoch);
    expect(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)).toBe(originalOutbox);
    restored.lines[phrase].fill(phrase);
    expect(completeNameCopyingRound(restored)).toBe(true);
    recordCompletedNameCopyingRound(storage, principal, phrase, restored.completed[phrase], new Date('2026-11-07T15:00:00Z'), restored.completionEpoch);
    recordCompletedNameCopyingRound(storage, principal, phrase, restored.completed[phrase], new Date('2026-11-08T15:00:00Z'), restored.completionEpoch);
    saveNameCopyingDraft(storage, principal, restored);
    expect(practice.getLogs()).toHaveLength(1);
    expect(practice.getLogs()[0]).toMatchObject({ count: 108, date: '2026-11-07' });
    expect(practice.getLogs()[0].id).not.toBe(oldId);
    expect(practice.getDeletedLogIds().has(String(oldId))).toBe(true);
    const next = readNameCopyingDraft(storage, principal);
    next.lines[phrase][0] = phrase;
    const result = completeNameCopyingSession(storage, principal, next);
    expect(result.draft.completed[phrase]).toBe(109);
    expect(result.draft.completionEpoch).toBe(reset.completionEpoch);
    expect(practice.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(109);
  });

  it('does not delete receipts or rotate the shared namespace if persisting an explicit reset fails', () => {
    const backing = memoryStorage(), principal = 'failed-reset';
    let failDraft = false;
    const storage = { ...backing, setItem(key: string, value: string) {
      if (failDraft && key.endsWith(':tt_name_copying_draft_v1')) throw new Error('storage_full');
      backing.setItem(key, value);
    } };
    const draft = createNameCopyingDraft();
    draft.lines[draft.selected][0] = draft.selected;
    const completed = completeNameCopyingSession(storage, principal, draft).draft;
    const scoped = createPrincipalStorage(storage, principal), practice = getPracticeStorage(scoped);
    const logs = practice.getLogs(), originalOutbox = scoped.getItem(COMPLETED_LOG_OUTBOX_KEY);
    failDraft = true;
    expect(() => resetNameCopyingData(storage, principal)).toThrow('storage_full');
    expect(readNameCopyingDraft(storage, principal)).toEqual(completed);
    expect(practice.getLogs()).toEqual(logs);
    expect(practice.getDeletedLogIds().size).toBe(0);
    expect(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)).toBe(originalOutbox);
  });
});
