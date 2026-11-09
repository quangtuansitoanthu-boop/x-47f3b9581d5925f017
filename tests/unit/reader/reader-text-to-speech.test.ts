import { afterEach, describe, expect, it, vi } from 'vitest';

import { createReaderTextToSpeech, type ReaderSpeechState } from '../../../src/lib/components/reader/reader-text-to-speech';

class UtteranceMock {
  lang = '';
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onboundary: ((event: { name: string; charIndex: number; charLength?: number }) => void) | null = null;

  constructor(readonly text: string) {}
}

function installSpeechSynthesis() {
  const utterances: UtteranceMock[] = [];
  const synth = {
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => [{ lang: 'vi-VN' }]),
    pause: vi.fn(),
    removeEventListener: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: UtteranceMock) => { utterances.push(utterance); }),
  };
  vi.stubGlobal('SpeechSynthesisUtterance', UtteranceMock);
  vi.stubGlobal('window', { speechSynthesis: synth });
  return { synth, utterances };
}

afterEach(() => vi.unstubAllGlobals());

describe('reader text-to-speech orchestration', () => {
  it('ignores legacy gender preferences and uses the device language default at normal pitch', async () => {
    const { synth, utterances } = installSpeechSynthesis();
    const first = { lang: 'vi-VN', name: 'First voice', default: false };
    const preferred = { lang: 'vi-VN', name: 'Device default', default: true };
    synth.getVoices.mockReturnValue([first, preferred]);
    const controller = createReaderTextToSpeech({ getText: () => 'Nam mô A Di Đà Phật', initialVoice: 'female', getVoice: () => 'male', onState: vi.fn(), onNotify: vi.fn() });
    controller.play();
    await vi.waitFor(() => expect(utterances.some(row => row.text.length > 0)).toBe(true));
    const spoken = utterances.find(row => row.text.length > 0)!;
    expect(spoken.voice).toBe(preferred);
    expect((spoken as unknown as { pitch: number }).pitch).toBe(1);
    controller.destroy();
  });
  it('cancels a pending asynchronous PDF text source before it can speak', async () => {
    const { synth, utterances } = installSpeechSynthesis();
    let resolveText: (value: string) => void = () => undefined;
    const text = new Promise<string>((resolve) => { resolveText = resolve; });
    const states: ReaderSpeechState[] = [];
    const controller = createReaderTextToSpeech({
      getText: () => text,
      onNotify: vi.fn(),
      onState: (state) => states.push(state),
    });

    controller.play();
    controller.stop();
    resolveText('Nội dung trang cũ');
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['loading', 'idle']);
    expect(synth.cancel).toHaveBeenCalled();
    expect(utterances).toHaveLength(0);
  });

  it('supports explicit play, pause, resume, stop and error states', async () => {
    const { synth, utterances } = installSpeechSynthesis();
    const states: ReaderSpeechState[] = [];
    const notify = vi.fn();
    const controller = createReaderTextToSpeech({
      getText: async () => 'Gieo nhân lành.',
      onNotify: notify,
      onState: (state) => states.push(state),
    });

    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    const spoken = utterances.find((utterance) => utterance.text);
    expect(spoken?.lang).toBe('vi-VN');
    spoken?.onstart?.();
    controller.pause();
    controller.resume();
    spoken?.onerror?.({ error: 'synthesis-failed' });

    expect(synth.pause).toHaveBeenCalledOnce();
    expect(synth.resume).toHaveBeenCalledOnce();
    expect(states).toEqual(expect.arrayContaining(['loading', 'playing', 'paused', 'error']));
    expect(notify).toHaveBeenCalledWith('Không thể đọc nội dung bài viết');
  });
  it.each([
    ' Nam mô A Di Đà Phật.',
    '  HT. Trí Tịnh giảng [1] Nam mô A Di Đà Phật.',
    `Nam https://example.org/${'a'.repeat(2000)} mô A Di Đà Phật.`,
  ])('maps normalized speech boundaries back to source case %#', async (source) => {
    const { utterances } = installSpeechSynthesis();
    const boundary = vi.fn();
    const controller = createReaderTextToSpeech({
      getChunks: () => [source], onState: vi.fn(), onNotify: vi.fn(), onChunkBoundary: boundary,
    });
    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    const spoken = utterances.find(row => row.text)!;
    expect(spoken.text).toContain('mô A Di Đà Phật.');
    spoken.onboundary?.({ name: 'word', charIndex: spoken.text.indexOf('mô'), charLength: 2 });
    expect(boundary).toHaveBeenCalledWith({ chunkIndex: 0, charIndex: source.indexOf('mô'), charLength: 2, name: 'word' });
    controller.stop();
  });

  it('keeps source sentence indices when normalization removes an empty heading', async () => {
    const { utterances } = installSpeechSynthesis();
    const start = vi.fn();
    const controller = createReaderTextToSpeech({
      getChunks: () => ['II', ' Nam mô A Di Đà Phật.'], onState: vi.fn(), onNotify: vi.fn(), onChunkStart: start,
    });
    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    utterances.find(row => row.text)!.onstart?.();
    expect(start).toHaveBeenCalledWith(1, 'Nam mô A Di Đà Phật.');
    controller.stop();
  });

  it('can read Vietnamese source with English interface feedback', async () => {
    const { utterances, synth } = installSpeechSynthesis();
    synth.getVoices.mockReturnValue([{ lang: 'vi-VN', name: 'Vietnamese' }, { lang: 'en-US', name: 'English' }]);
    const notify = vi.fn();
    const controller = createReaderTextToSpeech({
      getChunks: () => ['HT. Trí Tịnh giảng.'], getLocale: () => 'en', getSpeechLocale: () => 'vi',
      onState: vi.fn(), onNotify: notify,
    });
    controller.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(utterances.find(row => row.text)!.lang).toBe('vi-VN');
    expect(utterances.find(row => row.text)!.text).toContain('Hòa thượng');
    utterances.find(row => row.text)!.onerror?.({ error: 'synthesis-failed' });
    expect(notify).toHaveBeenCalledWith('Unable to read this article');
    controller.stop();
  });


});
