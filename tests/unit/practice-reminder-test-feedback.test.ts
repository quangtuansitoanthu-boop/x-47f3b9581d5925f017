import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { reminderSyncStatusText } from '$lib/i18n/reminder-sync-status';

const component = readFileSync('src/lib/components/practice/reminder/PracticeReminderCard.svelte', 'utf8');
const script = component.slice(component.indexOf('>') + 1, component.indexOf('</script>'));
const ast = ts.createSourceFile('reminder.ts', script, ts.ScriptTarget.Latest, true);
const handler = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleTest');
if (!handler) throw new Error('Existing reminder test handler missing');
const source = ts.transpileModule(handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it('distinguishes durable rules from bounded iOS notifications and never invents Android notification counts', () => {
  const android = reminderSyncStatusText({ success: true, scheduledCount: 99, details: { mode: 'android-durable', reason: null, ruleCount: 99, alarmMode: 'inexact' } }, 'vi');
  expect(android).toContain('99 quy tắc');
  expect(android).not.toContain('99 thông báo');
  expect(android).toContain('có thể nhắc trễ');
  const limited = reminderSyncStatusText({ success: true, scheduledCount: 64, details: { mode: 'ios-batch', reason: 'capacity', limited: true, horizonDays: 45, actualOneOffThrough: '2026-11-07T12:30:00Z' } }, 'en');
  expect(limited).toContain('64 notifications');
  expect(limited).toContain('system notification limit');
  expect(limited).toContain('One-off notifications in this batch');
  expect(limited).not.toContain('2027');
});

it('does not promise web background scheduling or an unconfirmed one-off horizon', () => {
  expect(reminderSyncStatusText({ success: false, scheduledCount: 0, details: { mode: 'web-unsupported', reason: 'unsupported' } }, 'vi')).toContain('cần ứng dụng Android/iOS');
  expect(reminderSyncStatusText({ success: false, scheduledCount: 0, details: { mode: 'ios-batch', reason: 'schedule-failed', limited: true, actualOneOffThrough: '2026-11-07T12:30:00Z' } }, 'en')).not.toContain('scheduled through');
});

it.each(['vi', 'en'])('contains a rejected OS test-notification request and displays error feedback (%s)', async locale => {
  const showFeedback = vi.fn();
  const requestPermission = vi.fn();
  const send = vi.fn().mockRejectedValue(new Error('UNUserNotificationCenter.add failed'));
  const h = runInNewContext(`let testing=false; ${source}; ({click:handleTest, busy:()=>testing})`, {
    sendTestNotification: send,
    localeStore: { current: locale },
    isEn: locale === 'en',
    t: { testSuccess: 'SUCCESS' },
    showFeedback,
    handleRequestPermission: requestPermission,
  }) as { click: () => Promise<void>; busy: () => boolean };

  // An event handler must consume the native scheduling rejection rather than
  // returning an unhandled rejected promise to Svelte's click dispatch.
  await expect(h.click()).resolves.toBeUndefined();
  expect(h.busy()).toBe(false);
  expect(showFeedback).toHaveBeenCalledExactlyOnceWith(expect.any(String), true);
  expect(showFeedback.mock.calls[0][0]).not.toBe('SUCCESS');
  expect(showFeedback.mock.calls[0][0].length).toBeGreaterThan(0);
  expect(requestPermission).not.toHaveBeenCalled();
  expect(component).toContain('role={feedbackIsError ? \'alert\' : \'status\'}');
  expect(component).toContain('{feedbackMessage}');
});
