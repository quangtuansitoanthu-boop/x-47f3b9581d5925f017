import { afterEach, expect, it } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { alertInApp, appDialogState, cancelAppDialogs, confirmInApp, isAppDialogOpen, promptInApp, registerAppDialogHost, resolveAppDialog } from '../../src/lib/browser/app-dialog';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; });

it('keeps a personal validation presentation scoped when the next queued alert is generic', async () => {
  dispose = registerAppDialogHost();
  const personal = alertInApp('Missing event name', { title: 'Missing information', presentation: 'personal-event' });
  const generic = alertInApp('Unrelated notice');
  const first = get(appDialogState)!;
  expect(first.title).toBe('Missing information');
  expect(first.presentation).toBe('personal-event');
  resolveAppDialog(first.id, true);
  await personal;
  await tick();
  const next = get(appDialogState)!;
  expect(next.message).toBe('Unrelated notice');
  expect(next.title).toBeUndefined();
  expect(next.presentation).toBeUndefined();
  resolveAppDialog(next.id, true);
  await generic;
});

it('cancels safely when the app host is unavailable', async () => {
  await expect(confirmInApp('Delete?')).resolves.toBe(false);
  await expect(alertInApp('Notice')).resolves.toBeUndefined();
  await expect(promptInApp('Input')).resolves.toBeNull();
  expect(get(appDialogState)).toBeNull();
});

it('preserves prompt defaults and empty input, while cancellation returns null', async () => {
  dispose = registerAppDialogHost();
  const accepted = promptInApp('URL', 'https://example.com');
  expect(get(appDialogState)?.defaultValue).toBe('https://example.com');
  resolveAppDialog(get(appDialogState)!.id, '');
  await expect(accepted).resolves.toBe('');
  await tick();
  const cancelled = promptInApp('Next');
  resolveAppDialog(get(appDialogState)!.id, false);
  await expect(cancelled).resolves.toBeNull();
});

it('cancels leftovers after committed navigation but keeps the root host usable', async () => {
  dispose = registerAppDialogHost();
  const confirmation = confirmInApp('Old screen');
  const prompt = promptInApp('Queued');
  expect(isAppDialogOpen()).toBe(true);
  cancelAppDialogs();
  await expect(confirmation).resolves.toBe(false);
  await expect(prompt).resolves.toBeNull();
  expect(isAppDialogOpen()).toBe(false);
  const next = confirmInApp('New screen');
  resolveAppDialog(get(appDialogState)!.id, true);
  await expect(next).resolves.toBe(true);
});

it('queues confirmations and alerts, ignoring stale responses', async () => {
  dispose = registerAppDialogHost();
  const first = confirmInApp('First');
  const firstId = get(appDialogState)!.id;
  const second = alertInApp('Second');
  expect(get(appDialogState)?.message).toBe('First');
  resolveAppDialog(firstId, true);
  await expect(first).resolves.toBe(true);
  await tick();
  const next = get(appDialogState)!;
  expect(next.message).toBe('Second');
  expect(next.kind).toBe('alert');
  resolveAppDialog(firstId, false);
  expect(get(appDialogState)?.id).toBe(next.id);
  resolveAppDialog(next.id, true);
  await expect(second).resolves.toBeUndefined();
  await tick();
  expect(get(appDialogState)).toBeNull();
});

it('settles active and queued requests on root teardown', async () => {
  dispose = registerAppDialogHost();
  const active = confirmInApp('Active');
  const queued = confirmInApp('Queued');
  const alert = alertInApp('Notice');
  dispose();
  await expect(active).resolves.toBe(false);
  await expect(queued).resolves.toBe(false);
  await expect(alert).resolves.toBeUndefined();
  await tick();
  expect(get(appDialogState)).toBeNull();
});

it('does not let an old root cleanup cancel a successor host', async () => {
  const oldDispose = registerAppDialogHost();
  const old = confirmInApp('Old root');
  dispose = registerAppDialogHost();
  await expect(old).resolves.toBe(false);
  const current = confirmInApp('New root');
  oldDispose();
  expect(get(appDialogState)?.message).toBe('New root');
  resolveAppDialog(get(appDialogState)!.id, true);
  await expect(current).resolves.toBe(true);
});
