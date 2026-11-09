export interface MediaSessionTrack {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
}

export interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  stop?: () => void;
  next?: () => void;
  previous?: () => void;
  seekTo?: (seconds: number) => void;
  seekBackward?: (seconds: number) => void;
  seekForward?: (seconds: number) => void;
}

export function configureMediaSession(actions: MediaSessionActions): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => {};
  const session = navigator.mediaSession;
  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
    ['play', actions.play],
    ['pause', actions.pause],
    ['stop', actions.stop ?? null],
    ['nexttrack', actions.next ?? null],
    ['previoustrack', actions.previous ?? null],
    ['seekto', actions.seekTo ? (details) => {
      if (typeof details.seekTime === 'number') actions.seekTo!(details.seekTime);
    } : null],
    ['seekbackward', actions.seekBackward ? (details) => actions.seekBackward!(details.seekOffset ?? 10) : null],
    ['seekforward', actions.seekForward ? (details) => actions.seekForward!(details.seekOffset ?? 30) : null]
  ];

  for (const [name, handler] of handlers) {
    try {
      session.setActionHandler(name, handler);
    } catch {
      // Some browsers expose Media Session but not every action.
    }
  }

  return () => {
    for (const [name] of handlers) {
      try {
        session.setActionHandler(name, null);
      } catch {
        // Ignore partially implemented Media Session APIs.
      }
    }
  };
}

export function updateMediaSessionPositionState(
  duration: number,
  position: number,
  playbackRate: number,
): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const session = navigator.mediaSession;
  if (typeof session.setPositionState !== 'function') return;

  try {
    if (!Number.isFinite(duration) || duration <= 0) {
      session.setPositionState();
      return;
    }
    session.setPositionState({
      duration,
      position: Math.max(0, Math.min(Number.isFinite(position) ? position : 0, duration)),
      playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
    });
  } catch {
    // Ignore partially implemented Media Session position APIs.
  }
}

export function updateMediaSessionPlaybackState(state: 'none' | 'paused' | 'playing'): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // Unsupported or partially implemented in browser
  }
}

export function updateMediaSessionMetadata(track: MediaSessionTrack | null): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  if (!track || typeof MediaMetadata === 'undefined') {
    navigator.mediaSession.metadata = null;
    return;
  }

  let artworkList: MediaImage[] = [];
  if (track.artwork) {
    try {
      const fullUrl = new URL(track.artwork.split('#pos=')[0], document.baseURI).href;
      artworkList = [
        { src: fullUrl, sizes: '96x96' },
        { src: fullUrl, sizes: '128x128' },
        { src: fullUrl, sizes: '192x192' },
        { src: fullUrl, sizes: '256x256' },
        { src: fullUrl, sizes: '512x512' },
      ];
    } catch {
      artworkList = [];
    }
  }

  if (artworkList.length === 0) {
    try {
      const defaultUrl = new URL('/assets/branding/tu-tap-logo.png', document.baseURI).href;
      artworkList = [
        { src: defaultUrl, sizes: '96x96', type: 'image/png' },
        { src: defaultUrl, sizes: '128x128', type: 'image/png' },
        { src: defaultUrl, sizes: '192x192', type: 'image/png' },
        { src: defaultUrl, sizes: '256x256', type: 'image/png' },
        { src: defaultUrl, sizes: '512x512', type: 'image/png' },
      ];
    } catch {
      artworkList = [];
    }
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: artworkList
  });
}
