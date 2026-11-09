import { describe, expect, it, vi } from 'vitest';
import { attachTalkVideoMirror } from '../../../src/lib/browser/talk-video-mirror';

class Media extends EventTarget {
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  ended = false;
  readyState = 1;
  muted = false;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
}
class Visibility extends EventTarget { hidden = false; }

describe('silent talk video follows the persistent audio owner', () => {
  it.each(['pause', 'hidden'])('recovers from an interrupted pending video play after %s', async (reason) => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    let rejectPlay!: (error: Error) => void;
    video.play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectPlay = reject; }));
    const onBlocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, visibility, onBlocked);
    audio.paused = false;
    audio.dispatchEvent(new Event('play'));
    if (reason === 'pause') {
      audio.paused = true;
      audio.dispatchEvent(new Event('pause'));
      audio.paused = false;
      audio.dispatchEvent(new Event('play'));
    } else {
      visibility.hidden = true;
      visibility.dispatchEvent(new Event('visibilitychange'));
      visibility.hidden = false;
      visibility.dispatchEvent(new Event('visibilitychange'));
    }
    rejectPlay(new DOMException('Playback interrupted by pause', 'AbortError'));
    await Promise.resolve();
    await Promise.resolve();
    audio.dispatchEvent(new Event('timeupdate'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.paused).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
    dispose();
  });

  it('follows playback, seek and speed, and only pauses the image when hidden', async () => {
    const audio = new Media();
    const video = new Media();
    const visibility = new Visibility();
    const dispose = attachTalkVideoMirror(audio, video, visibility, vi.fn());
    audio.paused = false;
    audio.currentTime = 30;
    audio.playbackRate = 1.5;
    audio.dispatchEvent(new Event('play'));
    await Promise.resolve();
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1.5);
    expect(video.paused).toBe(false);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(video.paused).toBe(true);
    expect(audio.paused).toBe(false);
    expect(audio.pause).not.toHaveBeenCalled();
    audio.currentTime = 45;
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(video.currentTime).toBe(45);
    expect(video.paused).toBe(false);
    dispose();
    audio.currentTime = 70;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(45);
    expect(video.paused).toBe(true);
    expect(audio.paused).toBe(false);
  });

  it('does not repeatedly retry a blocked video or interrupt audio', async () => {
    const audio = new Media();
    audio.paused = false;
    const video = new Media();
    video.play.mockRejectedValue(new Error('blocked'));
    const onBlocked = vi.fn();
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), onBlocked);
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 5; i++) audio.dispatchEvent(new Event('timeupdate'));
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(audio.pause).not.toHaveBeenCalled();
    dispose();
  });

  it('keeps a late play resolution paused after the viewer closes', async () => {
    const audio = new Media();
    audio.paused = false;
    const video = new Media();
    let finish: (() => void) | undefined;
    video.play.mockImplementation(() => new Promise<void>((resolve) => {
      finish = () => { video.paused = false; resolve(); };
    }));
    const dispose = attachTalkVideoMirror(audio, video, new Visibility(), vi.fn());
    dispose();
    finish?.();
    await Promise.resolve();
    expect(video.paused).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
  });
});
