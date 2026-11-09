export interface TalkMediaClock extends EventTarget {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  ended: boolean;
}

export interface TalkVideoSurface extends TalkMediaClock {
  readyState: number;
  muted: boolean;
  play(): Promise<void>;
  pause(): void;
}

// Âm thanh gốc giữ quyền điều khiển; video chỉ phản chiếu hình khi đang mở.
export function attachTalkVideoMirror(
  audio: TalkMediaClock,
  video: TalkVideoSurface,
  visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  onBlocked: () => void,
): () => void {
  let disposed = false;
  let pendingPlay = false;
  let playInterrupted = false;
  let blocked = false;
  video.muted = true;
  const play = async () => {
    pendingPlay = true;
    playInterrupted = false;
    try { await video.play(); }
    catch (cause) {
      // Pause/ẩn app có thể hủy play đang chờ; đây không phải lỗi cấm phát.
      if (cause instanceof Error && cause.name === 'AbortError'
        && (playInterrupted || disposed || visibility.hidden || audio.paused || audio.ended)) return;
      blocked = true;
      if (!disposed) onBlocked();
    }
    finally {
      pendingPlay = false;
      if (disposed || visibility.hidden || audio.paused || audio.ended) video.pause();
    }
  };
  const sync = () => {
    if (disposed) return;
    if (video.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.35) {
      video.currentTime = audio.currentTime;
    }
    video.playbackRate = audio.playbackRate;
    if (visibility.hidden || audio.paused || audio.ended) {
      if (pendingPlay) playInterrupted = true;
      video.pause();
    } else if (video.paused && !pendingPlay && !blocked && video.readyState >= 1) {
      void play();
    }
  };
  const events = ['play', 'pause', 'ended', 'seeking', 'seeked', 'timeupdate', 'ratechange'];
  for (const event of events) audio.addEventListener(event, sync);
  video.addEventListener('loadedmetadata', sync);
  visibility.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    disposed = true;
    for (const event of events) audio.removeEventListener(event, sync);
    video.removeEventListener('loadedmetadata', sync);
    visibility.removeEventListener('visibilitychange', sync);
    video.pause();
  };
}
