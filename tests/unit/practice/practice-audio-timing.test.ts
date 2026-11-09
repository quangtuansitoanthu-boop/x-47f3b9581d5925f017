import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPracticeAudioCountdown, createAudioTapStop } from '$lib/browser/practice-audio-timing';

describe('practice audio elapsed-time countdown', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('expires once after suspended callbacks and foreground refresh without replaying every missed second', () => {
    const remaining = vi.fn(), complete = vi.fn();
    const timer = createPracticeAudioCountdown(remaining, complete);
    timer.start(15 * 60);
    expect(remaining).toHaveBeenLastCalledWith(900);
    vi.setSystemTime(new Date('2026-11-01T10:16:00Z'));
    timer.refresh();
    expect(remaining).toHaveBeenLastCalledWith(0);
    expect(complete).toHaveBeenCalledOnce();
    timer.refresh();
    vi.advanceTimersByTime(10_000);
    expect(complete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses elapsed wall time, restarts cleanly, and never completes after stop', () => {
    const remaining = vi.fn(), complete = vi.fn();
    const timer = createPracticeAudioCountdown(remaining, complete);
    timer.start(60);
    vi.setSystemTime(new Date('2026-11-01T10:00:42.100Z'));
    timer.refresh();
    expect(remaining).toHaveBeenLastCalledWith(18);
    timer.start(30);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(remaining).toHaveBeenLastCalledWith(29);
    timer.stop();
    vi.advanceTimersByTime(60_000);
    timer.refresh();
    expect(complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('wooden fish tap audio timeout ownership', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the latest tap playing for its full duration instead of stopping at the previous tap deadline', () => {
    const audio = { pause: vi.fn(), currentTime: 1 };
    const stop = createAudioTapStop();
    stop.schedule(audio, 400);
    vi.advanceTimersByTime(250);
    stop.schedule(audio, 400);
    vi.advanceTimersByTime(150);
    expect(audio.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(0);
  });

  it('cancels a scheduled stop when leaving the practice screen', () => {
    const audio = { pause: vi.fn(), currentTime: 1 };
    const stop = createAudioTapStop();
    stop.schedule(audio, 400);
    stop.cancel();
    vi.advanceTimersByTime(1000);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
