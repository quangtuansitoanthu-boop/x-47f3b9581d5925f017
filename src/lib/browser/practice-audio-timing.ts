export function createPracticeAudioCountdown(onRemaining: (seconds: number) => void, onComplete: () => void) {
  let interval: ReturnType<typeof setInterval> | null = null;
  let deadline: number | null = null;
  const stop = () => {
    if (interval !== null) clearInterval(interval);
    interval = null;
    deadline = null;
  };
  const refresh = () => {
    if (deadline === null) return;
    // Callback nền có thể bị hoãn; thời gian thực mới là mốc kết thúc phiên nghe.
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    onRemaining(remaining);
    if (remaining === 0) { stop(); onComplete(); }
  };
  return {
    start(seconds: number) {
      stop();
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      deadline = Date.now() + seconds * 1000;
      onRemaining(Math.ceil(seconds));
      interval = setInterval(refresh, 1000);
    },
    stop, refresh,
  };
}

export function createAudioTapStop() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    schedule(audio: Pick<HTMLAudioElement, 'pause' | 'currentTime'>, milliseconds: number) {
      // Lần gõ mới sở hữu thời điểm dừng; timer cũ không được cắt âm thanh mới.
      cancel();
      timer = setTimeout(() => { timer = null; audio.pause(); audio.currentTime = 0; }, milliseconds);
    },
    cancel,
  };
}
