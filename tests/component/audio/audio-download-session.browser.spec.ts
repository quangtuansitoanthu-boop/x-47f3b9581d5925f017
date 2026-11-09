import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Harness from './audio-download-session-harness.svelte';

const mocks = vi.hoisted(() => ({
  tracks: new Map<string, { url: string; albumId: string; title: string; blob: Blob; downloadedAt: number }>(),
  albums: new Map<string, { id: string }>(), remove: vi.fn(), pendingSignal: undefined as AbortSignal | undefined,
  snapshotGate: undefined as Promise<void> | undefined,
  native: true,
  singleTrack: undefined as undefined | Parameters<typeof import('$lib/browser/audio-downloads').downloadSingleTrackFile>[1],
  singleTrackGate: undefined as Promise<void> | undefined,
}));
vi.mock('$lib/browser/audio-downloads', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/browser/audio-downloads')>();
  return { ...actual, downloadSingleTrackFile: (...args: Parameters<typeof actual.downloadSingleTrackFile>) => {
    if (!mocks.singleTrackGate) return actual.downloadSingleTrackFile(...args);
    mocks.singleTrack = args[1];
    return mocks.singleTrackGate;
  } };
});
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => mocks.native, nativePlatform: () => mocks.native ? 'android' : 'web' }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url, resolvePublicUrl: (url: string) => url, isHtmlResponse: () => false, fetchNativeJsonMutation: async () => null }));
vi.mock('$lib/browser/offline-audio-database', () => ({
  getOfflineTrack: async (url: string) => mocks.tracks.get(url) ?? null,
  putOfflineTrack: async (track: typeof mocks.tracks extends Map<string, infer T> ? T : never) => { mocks.tracks.set(track.url, track); },
  putOfflineAlbum: async (album: { id: string }) => { mocks.albums.set(album.id, album); },
  offlineStorageBytes: async () => [...mocks.tracks.values()].reduce((total, track) => total + track.blob.size, 0),
  deleteOfflineAlbum: mocks.remove,
  readOfflineLibrarySnapshot: async () => {
    await mocks.snapshotGate;
    return { albums: [...mocks.albums.values()], bytes: 0, trackCounts: { 'pending-private': mocks.tracks.size } };
  },
}));
vi.mock('$lib/stores/audio-player.svelte', async () => {
  const { readable } = await import('svelte/store');
  const snapshot = { album: null, trackIndex: 0, playing: false, currentTime: 0, duration: 0, speed: 1, repeat: 0,
    volume: 1, muted: false, retry: 0, error: null, recentAlbumIds: [], sleepTimerRemainingMs: 0, sleepTimerEndOfTrack: false };
  return { audioPlayer: readable(snapshot), getAudioPlayer: async () => ({ ready: Promise.resolve(), snapshot, playTrack() {}, playAll() {}, seek() {} }) };
});

let component: ReturnType<typeof Harness> | undefined;
beforeEach(() => {
  localStorage.clear();
  mocks.tracks.clear(); mocks.albums.clear(); mocks.remove.mockReset(); mocks.pendingSignal = undefined;
  mocks.snapshotGate = undefined;
  mocks.native = true;
  mocks.singleTrack = undefined;
  mocks.singleTrackGate = undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/audio/first-private.mp3') return new Response(new Blob(['saved partial bytes']));
    if (String(input) !== '/audio/pending-private.mp3') throw new Error(`Unexpected request: ${String(input)}`);
    mocks.pendingSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      const cancel = () => reject(new DOMException('Transfer aborted', 'AbortError'));
      if (mocks.pendingSignal?.aborted) cancel();
      else mocks.pendingSignal?.addEventListener('abort', cancel, { once: true });
    });
  }));
});

it('finishes reading offline state for the new principal when session hydration overlaps the first snapshot', async () => {
  let releaseSnapshot!: () => void;
  mocks.snapshotGate = new Promise<void>(resolve => { releaseSnapshot = resolve; });
  component = mount(Harness, { target: document.body });
  flushSync();
  await tick();
  component.changeSession('account');
  releaseSnapshot();
  await vi.waitFor(() => expect(document.querySelector('.album-offline-notice')).not.toBeNull());
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren(); localStorage.clear();
});

it('hides the offline recommendation after ten seconds and resets on reopening', async () => {
  vi.useFakeTimers();
  component = mount(Harness, { target: document.body });
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(9999); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1); flushSync();
  expect(document.querySelector('.album-offline-notice')).toBeNull();
  (document.querySelector('.pt-as-back') as HTMLButtonElement).click(); flushSync();
  (document.querySelector('.pt-card-thumb') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(0); flushSync();
  expect(document.querySelector('.album-offline-notice')).not.toBeNull();
});

it('does not recommend downloading an album already saved offline', async () => {
  mocks.albums.set('pending-private', { id: 'pending-private' });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Xóa'));
  expect(document.querySelector('.album-offline-notice')).toBeNull();
});

it.each([false, true])('keeps offline recommendation correct when filtering reveals an album (saved: %s)', async saved => {
  if (saved) mocks.albums.set('new-album', { id: 'new-album' });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.album-offline-notice')).not.toBeNull());
  component!.showAdditionalAlbum(); flushSync();
  await vi.waitFor(() => expect(document.querySelector('#album-title')?.textContent).toBe('Newly visible album'));
  if (saved) {
    expect(document.querySelector('.album-offline-notice')).toBeNull();
    expect(document.querySelector('.pt-as-btn-offline')?.textContent).toContain('Xóa');
  } else {
    expect(document.querySelector('.album-offline-notice')).not.toBeNull();
  }
});

async function beginTransfer() {
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-btn-offline')).not.toBeNull());
  (document.querySelector('.pt-as-btn-offline') as HTMLButtonElement).click();
  await vi.waitFor(() => expect((document.querySelector('.audio-offline-confirm-submit') as HTMLButtonElement | null)?.disabled).toBe(false));
  (document.querySelector('.audio-offline-confirm-submit') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(mocks.pendingSignal).toBeDefined());
  expect(document.querySelector('.audio-offline-modal-sub')?.textContent).toContain('Owner A private album');
  expect(mocks.tracks.size).toBe(1);
}

it.each(['logout', 'account', 'role'] as const)('aborts and closes private transfer UI immediately after session %s while retaining partial bytes', async mode => {
  await beginTransfer();
  component!.changeSession(mode); flushSync();
  await vi.waitFor(() => expect(mocks.pendingSignal?.aborted).toBe(true));
  expect(document.querySelector('.audio-offline-modal-backdrop')).toBeNull();
  expect(document.querySelector('.album-dialog')).toBeNull();
  expect(mocks.tracks.size).toBe(1);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('keeps a pending transfer during same-identity token refresh', async () => {
  await beginTransfer();
  component!.changeSession('token'); flushSync();
  expect(mocks.pendingSignal?.aborted).toBe(false);
  expect(document.querySelector('.audio-offline-modal-backdrop')).not.toBeNull();
  expect(document.querySelector('.album-dialog')).not.toBeNull();
  expect(mocks.tracks.size).toBe(1);
});

async function beginSingleTrackTransfer() {
  mocks.native = false;
  let finish!: () => void;
  mocks.singleTrackGate = new Promise<void>(resolve => { finish = resolve; });
  component = mount(Harness, { target: document.body });
  flushSync();
  await vi.waitFor(() => expect(document.querySelector('.pt-as-track-dl-btn')).not.toBeNull());
  (document.querySelector('.pt-as-track-dl-btn') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(mocks.singleTrack).toBeDefined());
  return finish;
}

it.each(['logout', 'account', 'role'] as const)('aborts a single MP3 transfer on session %s and ignores late progress and completion', async mode => {
  const finish = await beginSingleTrackTransfer();
  try {
    component!.changeSession(mode); flushSync();
    expect(mocks.singleTrack?.signal?.aborted).toBe(true);
    // Reopening exposes the same status owner, so stale callbacks cannot hide behind a closed dialog.
    (document.querySelector('.pt-card-thumb') as HTMLButtonElement).click(); flushSync();
    const status = document.querySelector('.album-status')?.textContent ?? '';
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    flushSync();
    expect(document.querySelector('.album-status')?.textContent ?? '').toBe(status);
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')?.textContent ?? '').toBe(status);
  } finally { finish(); }
});

it('aborts a single MP3 transfer when AudioCatalog unmounts and tolerates late callbacks', async () => {
  const finish = await beginSingleTrackTransfer();
  try {
    await unmount(component!); component = undefined;
    expect(mocks.singleTrack?.signal?.aborted).toBe(true);
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')).toBeNull();
  } finally { finish(); }
});

it('keeps a single MP3 transfer alive across same-principal token refresh', async () => {
  const finish = await beginSingleTrackTransfer();
  try {
    expect(mocks.singleTrack?.signal).toBeDefined();
    component!.changeSession('token'); flushSync();
    expect(mocks.singleTrack!.signal!.aborted).toBe(false);
    mocks.singleTrack!.onProgress?.({ completed: 0, total: 1, currentTitle: 'Saved first track', bytesDownloaded: 512, bytesTotal: 1024 });
    flushSync();
    expect(document.querySelector('.album-status')?.textContent).toContain('50%');
    finish(); await tick(); flushSync();
    expect(document.querySelector('.album-status')?.textContent).toContain('Đã tải Saved first track.');
  } finally { finish(); }
});

it('does not request login when a remembered member cannot currently verify download credentials', async () => {
  // Native keeps MP3 export hidden; this shared auth action is exposed on web.
  mocks.native = false;
  const loginRequired = vi.fn();
  window.addEventListener('quangtu:login-required', loginRequired);
  try {
    component = mount(Harness, { target: document.body });
    flushSync();
    await vi.waitFor(() => expect(document.querySelector('.pt-as-track-dl-btn')).not.toBeNull());
    component!.changeSession('remembered'); flushSync();
    vi.stubGlobal('fetch', vi.fn(async input => {
      if (String(input).endsWith('/api/session')) return new Response('unavailable', { status: 503 });
      throw new Error(`Unexpected download request: ${String(input)}`);
    }));
    (document.querySelector('.pt-as-track-dl-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Không thể tải Saved first track.'));
    expect(loginRequired).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('quangtu:login-required', loginRequired);
  }
});
