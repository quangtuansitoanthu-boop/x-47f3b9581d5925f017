import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { manualPracticeLogCopy } from '../../../src/lib/i18n/manual-practice-log';

const source = readFileSync('src/lib/components/practice/tracker/PracticeLogModal.svelte', 'utf8');
const ast = ts.createSourceFile('modal.ts', source.slice(source.indexOf('>') + 1, source.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const submit = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'submit')!;
const compiled = ts.transpileModule(submit.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const labelDefinition = ast.statements.filter(ts.isVariableStatement)
  .find(node => node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'countLabel'))!;
const labelCode = ts.transpileModule(labelDefinition.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(dateValue: string, today = '2026-11-08') {
  const original = Object.freeze({ id: 123, date: '2026-11-08', type: 'Lễ Phật', count: 3, note: 'Bản nháp', created: '2026-11-08T01:00:00Z' });
  const dateInput = { setCustomValidity: vi.fn(), reportValidity: vi.fn() };
  const onSave = vi.fn();
  const scope = { log: original, dateValue, maxDate: '2026-11-07', selectedType: 'Lễ Phật', selectedCampaign: null,
    countValue: 3, noteValue: ' Bản nháp ', onSave, isEn: false, getVietnamIsoDate: () => today,
    manualPracticeLogCopy: { vi: { invalidDate: 'Ngày không hợp lệ' }, en: { invalidDate: 'Invalid date' } } };
  const event = { preventDefault: vi.fn(), currentTarget: { elements: { namedItem: () => dateInput } } };
  runInNewContext(`${compiled}\nsubmit(event);`, { ...scope, event });
  return { onSave, dateInput, original };
}

describe('manual practice form date validation', () => {
  it.each(['2026-11-09', '2026-02-30', 'invalid', ''])('rejects %s without saving or replacing the draft', value => {
    const result = harness(value);
    expect(result.onSave).not.toHaveBeenCalled();
    expect(result.dateInput.setCustomValidity).toHaveBeenCalledWith('Ngày không hợp lệ');
    expect(result.dateInput.reportValidity).toHaveBeenCalledOnce();
    expect(result.original.note).toBe('Bản nháp');
  });
  it('rechecks the current Vietnam date on submit, allowing a newly started day', () => {
    const result = harness('2026-11-09', '2026-11-09');
    expect(result.onSave).toHaveBeenCalledWith({ ...result.original, date: '2026-11-09', campaignId: null, campaignTitle: null });
  });
  it('keeps valid past entries and the existing save contract', () => {
    const result = harness('2026-10-31');
    expect(result.onSave).toHaveBeenCalledWith({ ...result.original, date: '2026-10-31', campaignId: null, campaignTitle: null });
  });
  it.each([
    ['Lễ Phật', false, 'Số lạy'], ['Lễ Phật', true, 'Number of prostrations'],
    ['Chép kinh', false, 'Số lượt chép kinh'], ['Chép kinh', true, 'Number of scripture transcription sessions'],
    ['Ngồi thiền', false, 'Thời gian ngồi thiền (phút)'],
    ['Nghe pháp thoại', false, 'Thời gian nghe pháp thoại (phút)'],
  ] as const)('keeps the %s quantity label aligned with saved counts (%s)', (selectedType, isEn, expected) => {
    const result = runInNewContext(`${labelCode}\ncountLabel;`, {
      selectedType, isEn, manualPracticeLogCopy, $derived: { by: (run: () => string) => run() },
    });
    expect(result).toBe(expected);
  });
});
