import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAudioLibraryRequestLifecycle } from '$lib/browser/audio-library-request-lifecycle';

function applyRoleChange(previousRole: string, nextRole: string) {
  const source = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
  const body = /const applyCollectionSession = \(\) => \{([\s\S]*?)\n    \};/u.exec(source)?.[1];
  if (!body) throw new Error('Missing actual collection session handler');
  const close = vi.fn(), transition = vi.fn(() => false);
  new Function('sessionStore', 'previousCatalogRole', 'collectionRequests', 'handleSelectAlbum', body)(
    { value: { authenticated: true, user: { id: 'same-account', role: nextRole } } }, previousRole, { transition }, close,
  );
  return { close, transition };
}

it('closes a selected album when the same account loses its privileged role', () => {
  const result = applyRoleChange('admin', 'user');
  expect(result.close).toHaveBeenCalledWith(null);
  expect(result.transition).toHaveBeenCalledOnce();
});

it('keeps a selected album during same-account token refresh without a role change', () => {
  expect(applyRoleChange('admin', 'admin').close).not.toHaveBeenCalled();
});

it('keeps a public dialog when the same account gains a privileged role', () => {
  expect(applyRoleChange('user', 'admin').close).not.toHaveBeenCalled();
});

function applyOpenedAlbumSession(options: {
  previousId: string | null;
  previousRole: string;
  nextId: string | null;
  nextRole: string;
  visibility?: string;
  selectedId?: string | null;
  target?: string;
}) {
  const source = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
  const body = /const applyCollectionSession = \(\) => \{([\s\S]*?)\n    \};/u.exec(source)?.[1];
  if (!body) throw new Error('Missing actual collection session handler');
  const close = vi.fn(), refresh = vi.fn();
  const selection = new Function(
    'sessionStore', 'previousCatalogRole', 'collectionRequests', 'handleSelectAlbum',
    'window', 'recoveredInitialAlbum', 'initialAlbumTarget', 'pushedAlbumHistory',
    'selectedAlbumId', 'checkedInitialUrl', 'collectionGeneration', 'collectionBusyKeys',
    'collectionStatus', 'refreshClientCollections', 'albums',
    `${body}\nreturn selectedAlbumId;`,
  )(
    { value: { authenticated: Boolean(options.nextId), user: options.nextId ? { id: options.nextId, role: options.nextRole } : null } },
    options.previousRole, createAudioLibraryRequestLifecycle(options.previousId), close,
    { location: { href: `https://fixture.invalid/phap-thoai?album=${options.target ?? 'public-album'}` } },
    false, null, true, options.selectedId === undefined ? 'public-album' : options.selectedId,
    true, 0, [], '', refresh, [{ id: 'public-album', visibility: options.visibility ?? 'public' }],
  );
  return { close, refresh, selection };
}

it('preserves an explicitly opened public album during initial account hydration', () => {
  const result = applyOpenedAlbumSession({ previousId: null, previousRole: 'guest', nextId: 'account-a', nextRole: 'admin' });
  expect(result.close).not.toHaveBeenCalled();
  expect(result.selection).toBe('public-album');
  expect(result.refresh).toHaveBeenCalledWith(1);
});

it.each([
  { name: 'private metadata', previousId: null, previousRole: 'guest', nextId: 'account-a', nextRole: 'admin', visibility: 'private' },
  { name: 'account switch', previousId: 'account-a', previousRole: 'admin', nextId: 'account-b', nextRole: 'admin' },
  { name: 'logout', previousId: 'account-a', previousRole: 'admin', nextId: null, nextRole: 'guest' },
  { name: 'dismissed selection', previousId: null, previousRole: 'guest', nextId: 'account-a', nextRole: 'admin', selectedId: null },
  { name: 'changed URL', previousId: null, previousRole: 'guest', nextId: 'account-a', nextRole: 'admin', target: 'other-album' },
])('closes rather than recovers an opened album for $name', (options) => {
  expect(applyOpenedAlbumSession(options).close).toHaveBeenCalledWith(null);
});
