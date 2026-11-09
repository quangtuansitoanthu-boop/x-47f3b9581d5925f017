import { readable } from 'svelte/store';
import { selectAudioSyncPrincipal } from '$lib/browser/audio-sync';
import {
  clearNativeAudioForPrincipalChange,
  nativeAudioPrincipalKey,
  selectNativeAudioPrincipal,
} from '$lib/browser/native-audio-principal';
import type {
  AudioPlayerController,
  AudioPlayerSession,
  AudioPlayerSnapshot,
} from '$lib/browser/audio-player-controller';

const EMPTY: AudioPlayerSnapshot = {
  album: null,
  trackIndex: 0,
  playing: false,
  currentTime: 0,
  duration: 0,
  speed: 1,
  repeat: 0,
  volume: 1,
  muted: false,
  retry: 0,
  error: null,
  recentAlbumIds: [],
  sleepTimerRemainingMs: 0,
  sleepTimerEndOfTrack: false
};

let controller: AudioPlayerController | undefined;
let controllerPromise: Promise<AudioPlayerController> | undefined;
type AudioPlayerSelectionSession = AudioPlayerSession & { user: { id: string; role?: string } | null };
let selectedSession: AudioPlayerSelectionSession = { authenticated: false, csrfToken: null, user: null };
let sessionSelected = false;

function normalizeSession(session: AudioPlayerSelectionSession): AudioPlayerSelectionSession {
  const id = session.authenticated ? String(session.user?.id ?? '').trim() : '';
  return id ? {
    authenticated: true,
    csrfToken: typeof session.csrfToken === 'string' && session.csrfToken ? session.csrfToken : null,
    user: { id, role: session.user?.role?.trim() || 'user' },
  } : { authenticated: false, csrfToken: null, user: null };
}

export function selectAudioPlayerSession(session: AudioPlayerSelectionSession): void {
  const nextSession = normalizeSession(session);
  const nextPrincipal = nativeAudioPrincipalKey(nextSession.user);
  const principalChanged = sessionSelected && nativeAudioPrincipalKey(selectedSession.user) !== nextPrincipal;
  if (principalChanged && !controller) clearNativeAudioForPrincipalChange();
  selectNativeAudioPrincipal(nextPrincipal);
  selectedSession = nextSession;
  sessionSelected = true;
  if (controller) {
    controller.setSession(selectedSession);
    return;
  }
  selectAudioSyncPrincipal(selectedSession.user?.id ?? null);
}

export function getAudioPlayer(): Promise<AudioPlayerController> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Audio player chỉ có trong trình duyệt.'));
  }
  if (controller) return Promise.resolve(controller);
  if (!controllerPromise) {
    controllerPromise = import('$lib/browser/audio-player-controller').then((module) => {
      controller ??= new module.AudioPlayerController(selectedSession);
      return controller;
    });
    void controllerPromise.catch(() => {
      controllerPromise = undefined;
    });
  }
  return controllerPromise;
}

/** Không tạo/hydrate player mới chỉ vì nhận deep link. */
export async function refreshPracticePlayback(): Promise<void> {
  await controller?.refreshPracticePlayback();
}

export const audioPlayer = readable<AudioPlayerSnapshot>(EMPTY, (set) => {
  if (typeof window === 'undefined') return () => {};
  let disposed = false;
  let unsubscribe = () => {};
  void getAudioPlayer().then((player) => {
    if (disposed) return;
    unsubscribe = player.subscribe(set);
  }).catch(() => {
    if (!disposed) set({ ...EMPTY, error: 'Không thể khởi tạo trình phát. Vui lòng thử lại.' });
  });
  return () => { disposed = true; unsubscribe(); };
});
