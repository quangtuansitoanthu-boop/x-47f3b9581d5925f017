import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderTextToSpeech } from '../../../src/lib/components/reader/reader-text-to-speech';

const mock = vi.hoisted(() => ({ engine: null as any }));
vi.mock('$lib/browser/native-reader-speech', () => ({ getNativeReaderSpeech: () => mock.engine }));

let onStart: (event: { id: string }) => void;
let finish: (result: { canceled?: boolean }) => void;
let engine: any;
beforeEach(() => {
  vi.stubGlobal('window', {}); // Actual Android WebView: no speechSynthesis/utterance.
  engine = {
    prepare: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(async (_: string, callback: typeof onStart) => {
      onStart = callback;
      return { remove: vi.fn().mockResolvedValue(undefined) };
    }),
    speak: vi.fn((options: { id: string }) => {
      onStart({ id: options.id });
      return new Promise(resolve => { finish = resolve; });
    }),
    stop: vi.fn(async () => { finish?.({ canceled: true }); }),
  };
  mock.engine = engine;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); mock.engine = null; });

function create(text = 'Nam mô A Di Đà Phật.') {
  const onNotify = vi.fn();
  const onState = vi.fn();
  return { controller: createReaderTextToSpeech({getText:async()=>text,onNotify,onState}), onNotify, onState };
}

describe('Android reader speech', () => {
  it('lets a started 0.3x chunk finish after thirty seconds', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const onNotify = vi.fn();
    const controller = createReaderTextToSpeech({
      getText: () => 'Nam mô A Di Đà Phật. '.repeat(8), initialRate: 0.3, minimumRate: 0.3,
      onState: vi.fn(), onNotify, onFinish,
    });
    controller.play();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toBe('playing');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(controller.getState()).toBe('playing');
    expect(engine.stop).not.toHaveBeenCalled();
    finish({});
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toBe('idle');
    expect(onFinish).toHaveBeenLastCalledWith(true);
    expect(onNotify).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('still stops an engine that never starts or never completes a chunk', async () => {
    vi.useFakeTimers();
    engine.speak.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = create();
    first.controller.play();
    await vi.advanceTimersByTimeAsync(30_001);
    expect(first.controller.getState()).toBe('error');
    expect(engine.stop).toHaveBeenCalled();
    first.controller.destroy();
    engine.stop.mockClear();
    const second = create('Nam mô A Di Đà Phật. '.repeat(8));
    second.controller.play();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.controller.getState()).toBe('playing');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(second.controller.getState()).toBe('error');
    expect(engine.stop).toHaveBeenCalled();
    second.controller.destroy();
  });

  it('cancels the slow-chunk deadline while paused and gives resume a fresh run', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const controller = createReaderTextToSpeech({
      getText: () => 'Nam mô A Di Đà Phật. '.repeat(8), initialRate: 0.3, minimumRate: 0.3,
      onState: vi.fn(), onNotify: vi.fn(), onFinish,
    });
    controller.play();
    await vi.advanceTimersByTimeAsync(31_000);
    controller.pause();
    expect(controller.getState()).toBe('paused');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(controller.getState()).toBe('paused');
    expect(onFinish).not.toHaveBeenCalled();
    controller.resume();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(controller.getState()).toBe('playing');
    finish({});
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toBe('idle');
    expect(onFinish).toHaveBeenLastCalledWith(true);
    controller.destroy();
  });

  it('allows copying to request 0.3x while keeping the default reader minimum', async () => {
    for (const minimumRate of [undefined, 0.3]) {
      const controller = createReaderTextToSpeech({ getText: () => 'Nam mô A Di Đà Phật.', onNotify: vi.fn(), onState: vi.fn(), minimumRate });
      controller.setRate(0.3);
      controller.play();
      await vi.waitFor(() => expect(controller.getState()).toBe('playing'));
      expect(engine.speak).toHaveBeenLastCalledWith(expect.objectContaining({ rate: minimumRate ?? 0.5 }));
      controller.destroy();
    }
  });
  it('explains network voice failures and how to install an offline voice', async () => {
    engine.speak.mockRejectedValue({ code: 'NETWORK_ERROR' });
    const { controller, onNotify } = create();
    controller.play();
    await vi.waitFor(() => expect(controller.getState()).toBe('error'));
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('ngoại tuyến'));
    controller.destroy();
  });
  it('distinguishes natural completion from engine cancellation for practice evidence', async () => {
    const onFinish = vi.fn();
    const controller = createReaderTextToSpeech({ getText: () => 'Nam mô A Di Đà Phật.', onState: vi.fn(), onNotify: vi.fn(), onFinish });
    controller.play();
    await vi.waitFor(() => expect(controller.getState()).toBe('playing'));
    expect(onFinish).not.toHaveBeenCalled();
    finish({ canceled: true });
    await vi.waitFor(() => expect(controller.getState()).toBe('idle'));
    expect(onFinish).toHaveBeenLastCalledWith(false);
    controller.play();
    await vi.waitFor(() => expect(controller.getState()).toBe('playing'));
    finish({});
    await vi.waitFor(() => expect(controller.getState()).toBe('idle'));
    expect(onFinish.mock.calls).toEqual([[false], [true]]);
    controller.destroy();
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it('plays PDF text without browser SpeechSynthesis and completes only on native completion', async () => {
    const {controller,onNotify} = create();
    controller.play();
    await vi.waitFor(()=>expect(controller.getState()).toBe('playing'));
    expect(engine.speak).toHaveBeenCalledWith(expect.objectContaining({language:'vi-VN',text:'Nam mô A Di Đà Phật.',rate:1}));
    finish({});
    await vi.waitFor(()=>expect(controller.getState()).toBe('idle'));
    expect(onNotify).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('reads long chapters in bounded chunks and ignores events after stop', async () => {
    const {controller} = create('Đây là nội dung kinh sách. '.repeat(30));
    controller.play();
    await vi.waitFor(()=>expect(engine.speak).toHaveBeenCalledTimes(1));
    finish({});
    await vi.waitFor(()=>expect(engine.speak).toHaveBeenCalledTimes(2));
    for(const [options] of engine.speak.mock.calls) expect(options.text.length).toBeLessThanOrEqual(180);
    const oldId = engine.speak.mock.calls[1][0].id;
    controller.stop();
    onStart({id:oldId});
    await Promise.resolve();
    expect(controller.getState()).toBe('idle');
    expect(engine.speak).toHaveBeenCalledTimes(2);
  });

  it('shows actionable instructions if the device has no Vietnamese voice', async () => {
    engine.prepare.mockRejectedValue({code:'MISSING_ENGINE'});
    const {controller,onNotify} = create();
    controller.play();
    await vi.waitFor(()=>expect(controller.getState()).toBe('error'));
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('Cài đặt Android'));
    expect(engine.speak).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('does not start after closing while Android initializes', async () => {
    let ready!: () => void;
    engine.prepare.mockReturnValue(new Promise<void>(resolve=>ready=resolve));
    const {controller} = create();
    controller.play();
    await vi.waitFor(()=>expect(engine.prepare).toHaveBeenCalled());
    controller.destroy(); ready();
    await Promise.resolve(); await Promise.resolve();
    expect(engine.speak).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });

  it('pauses and resumes the current short chunk with the selected rate and voice', async () => {
    const {controller} = create();
    controller.play();
    await vi.waitFor(()=>expect(controller.getState()).toBe('playing'));
    controller.pause();
    expect(controller.getState()).toBe('paused');
    controller.setRate(1.2);controller.setVoice('male');controller.resume();
    await vi.waitFor(()=>expect(engine.speak).toHaveBeenCalledTimes(2));
    expect(engine.speak.mock.calls[1][0]).toMatchObject({rate:1.2,voice:'auto'});
    controller.destroy();
  });
  it('highlights native source sentences and advances blocks without inventing word events', async () => {
    let block = 0;
    const onChunkStart = vi.fn(), onChunkEnd = vi.fn(), onChunkBoundary = vi.fn(), onFinish = vi.fn();
    const controller = createReaderTextToSpeech({
      getChunks: () => block ? [' Đoạn hai.'] : ['II', ' Nam mô A Di Đà Phật.'],
      getLocale: () => 'en', getSpeechLocale: () => 'vi',
      onAdvance: () => ++block === 1,
      onChunkStart, onChunkEnd, onChunkBoundary, onFinish, onState: vi.fn(), onNotify: vi.fn(),
    });
    controller.play();
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledTimes(1));
    expect(engine.speak).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'vi-VN' }));
    expect(onChunkStart).toHaveBeenCalledWith(1, 'Nam mô A Di Đà Phật.');
    finish({});
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledTimes(2));
    expect(onChunkEnd).toHaveBeenCalledWith(1, 'Nam mô A Di Đà Phật.');
    expect(onChunkStart).toHaveBeenLastCalledWith(0, 'Đoạn hai.');
    expect(onChunkBoundary).not.toHaveBeenCalled();
    finish({});
    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledWith(true));
    controller.destroy();
  });

  it('ignores a late native block advance after stop', async () => {
    let resolveAdvance!: (value: boolean) => void;
    const onFinish = vi.fn(), onChunkStart = vi.fn();
    const controller = createReaderTextToSpeech({
      getChunks: () => ['Nam mô A Di Đà Phật.'],
      onAdvance: () => new Promise<boolean>(resolve => { resolveAdvance = resolve; }),
      onState: vi.fn(), onNotify: vi.fn(), onFinish, onChunkStart,
    });
    controller.play();
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledTimes(1));
    finish({});
    await vi.waitFor(() => expect(resolveAdvance).toBeTypeOf('function'));
    controller.stop();
    resolveAdvance(true);
    await Promise.resolve(); await Promise.resolve();
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });
});
