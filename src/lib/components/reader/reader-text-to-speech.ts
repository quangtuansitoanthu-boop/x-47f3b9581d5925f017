import { uiScrollBehavior } from '$lib/browser/ui-motion';
import { cleanVietnameseTextForSpeech } from './vietnamese-speech-normalizer';
import { getNativeReaderSpeech, type NativeReaderSpeech } from '$lib/browser/native-reader-speech';
import { nativePlatform } from '$lib/browser/native-platform';
import { nativeSpeechErrorMessage } from '$lib/i18n/native-speech';

export type ReaderSpeechState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface SpeechWord {
  element: HTMLSpanElement | null;
  text: string;
}

interface SpeechChunk {
  text: string;
  words: SpeechWord[];
  sourceIndex?: number;
  sourceOffsets?: number[];
}

interface ReaderTextToSpeechOptions {
  getContent?: () => HTMLElement | null;
  getText?: () => string | null | Promise<string | null>;
  getScrollArea?: () => HTMLElement | null;
  onState: (state: ReaderSpeechState) => void;
  onNotify: (message: string) => void;
  onFinish?: (completed: boolean) => void;
  emptyTextMessage?: string;
  initialRate?: number;
  minimumRate?: number;
  initialVoice?: string;
  getVoice?: () => string;
  getLocale?: () => string;
  getSpeechLocale?: () => string;
  getChunks?: () => string[] | Promise<string[]>;
  onChunkStart?: (chunkIndex: number, text: string) => void;
  onChunkBoundary?: (info: { chunkIndex: number; charIndex: number; charLength?: number; name?: string }) => void;
  onChunkEnd?: (chunkIndex: number, text: string) => void;
  onAdvance?: () => Promise<boolean> | boolean;
}

const EMPTY_TEXT_MESSAGE = 'Không có nội dung để đọc';
/** Ánh xạ ký tự sau chuẩn hóa về nguồn, kể cả khi bỏ chú thích hoặc mở rộng viết tắt. */
function speechSourceOffsets(source: string, spoken: string): number[] {
  const offsets = new Array<number>(spoken.length + 1);
  // Chỉ giữ hai hàng LCS, tránh ma trận bộ nhớ bậc hai khi nguồn có URL/chú thích dài.
  function lengths(left: string, right: string): Uint32Array {
    let previous = new Uint32Array(right.length + 1);
    let current = new Uint32Array(right.length + 1);
    for (let i = 0; i < left.length; i++) {
      for (let j = 0; j < right.length; j++) {
        current[j + 1] = left[i] === right[j] ? previous[j] + 1 : Math.max(previous[j + 1], current[j]);
      }
      [previous, current] = [current, previous];
    }
    return previous;
  }
  function align(left: string, right: string, sourceStart: number, spokenStart: number): void {
    while (left && right && left[0] === right[0]) {
      offsets[spokenStart++] = sourceStart++;
      left = left.slice(1); right = right.slice(1);
    }
    while (left && right && left[left.length - 1] === right[right.length - 1]) {
      offsets[spokenStart + right.length - 1] = sourceStart + left.length - 1;
      left = left.slice(0, -1); right = right.slice(0, -1);
    }
    if (!left || !right) return;
    if (left.length === 1) {
      const index = right.indexOf(left);
      if (index >= 0) offsets[spokenStart + index] = sourceStart;
      return;
    }
    const middle = Math.floor(left.length / 2);
    const forward = lengths(left.slice(0, middle), right);
    const backward = lengths(left.slice(middle).split('').reverse().join(''), right.split('').reverse().join(''));
    let split = 0, best = -1;
    for (let index = 0; index <= right.length; index++) {
      const score = forward[index] + backward[right.length - index];
      if (score > best) { best = score; split = index; }
    }
    align(left.slice(0, middle), right.slice(0, split), sourceStart, spokenStart);
    align(left.slice(middle), right.slice(split), sourceStart + middle, spokenStart + split);
  }
  align(source, spoken, 0, 0);
  offsets[spoken.length] = source.length;
  for (let index = spoken.length - 1; index >= 0; index--) offsets[index] ??= offsets[index + 1];
  return offsets;
}


let speechRequestId = 0;

export function createReaderTextToSpeech(options: ReaderTextToSpeechOptions) {
  const speechIsEnglish = () => (options.getSpeechLocale?.() ?? options.getLocale?.() ?? 'vi').toLowerCase().startsWith('en');
  let generation = 0;
  let state: ReaderSpeechState = 'idle';
  let currentRate = options.initialRate ?? 1;
  let selectedVoiceName = 'auto';
  let voiceTimer: ReturnType<typeof setTimeout> | null = null;
  let voiceHandler: (() => void) | null = null;
  let currentSynth: SpeechSynthesis | null = null;
  let activeChunks: SpeechChunk[] = [];
  let activeVoices: SpeechSynthesisVoice[] = [];
  let currentChunkIndex = 0;
  let activeSpeakNext: (() => void) | null = null;
  let currentUtterance: SpeechSynthesisUtterance | null = null;
  let browserRun = 0;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeSpeech: NativeReaderSpeech | null = null;
  let nativeRun = 0;
  let nativeActiveId: string | null = null;
  let nativeTimer: ReturnType<typeof setTimeout> | null = null;

  function stopNative(): void {
    nativeRun++;
    if (nativeTimer) clearTimeout(nativeTimer);
    nativeTimer = null;
    const id = nativeActiveId;
    nativeActiveId = null;
    if (nativeSpeech && id) void nativeSpeech.stop({ id }).catch(() => {});
  }

  async function speakNativeChunks(activeGeneration: number): Promise<void> {
    const engine = nativeSpeech;
    if (!engine) return;
    const run = ++nativeRun;
    let listener: Awaited<ReturnType<NativeReaderSpeech['addListener']>> | null = null;
    let activeId = '';
    let markChunkStarted: (() => void) | null = null;
    const isCurrent = () => activeGeneration === generation && run === nativeRun;
    try {
      await engine.prepare();
      if (!isCurrent()) return;
      listener = await engine.addListener('speechStart', ({ id }) => {
        if (!isCurrent() || id !== activeId) return;
        markChunkStarted?.();
        markChunkStarted = null;
        setState('playing');
        clearHighlights();
        const chunk = activeChunks[currentChunkIndex];
        chunk?.words.forEach(word => word.element?.classList.add('active'));
        if (chunk) {
          scrollToChunk(chunk);
          // Bridge Android chỉ có speechStart/completion: tô cả câu, không giả lập vị trí từ.
          options.onChunkStart?.(chunk.sourceIndex ?? currentChunkIndex, chunk.text);
        }
      });
      while (isCurrent()) {
        if (currentChunkIndex >= activeChunks.length) {
          if (!options.onAdvance) break;
          setState('loading');
          const hasNext = await options.onAdvance();
          if (!isCurrent()) return;
          if (!hasNext) break;
          const next = await resolveChunks(activeGeneration);
          if (!isCurrent()) return;
          if (!next.length) break;
          activeChunks = next;
          currentChunkIndex = 0;
        }
        activeId = `reader-${++speechRequestId}`;
        nativeActiveId = activeId;
        const chunk = activeChunks[currentChunkIndex];
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const deadline = new Promise<never>((_, reject) => {
          const arm = (milliseconds: number) => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => reject(new Error('speech_timeout')), milliseconds);
            nativeTimer = timeout;
          };
          // Tách chờ khởi động khỏi thời gian đọc: giọng chậm không bị cắt ở 30s.
          // Ngân sách bảo thủ 5 ký tự/giây ở 1x, cộng 10s và vẫn có giới hạn hoàn tất.
          const completionMs = Math.max(30_000, Math.ceil(chunk.text.length * 1_000 / (5 * currentRate)) + 10_000);
          markChunkStarted = () => arm(completionMs);
          arm(30_000);
        });
        let result: { canceled?: boolean } | void;
        try {
          result = await Promise.race([engine.speak({ id: activeId, text: chunk.text,
            language: speechIsEnglish() ? 'en-US' : 'vi-VN',
            rate: currentRate, voice: 'auto' }), deadline]);
        } finally {
          markChunkStarted = null;
          if (timeout) clearTimeout(timeout);
          if (nativeTimer === timeout) nativeTimer = null;
        }
        if (!isCurrent()) return;
        if (nativeActiveId === activeId) nativeActiveId = null;
        if (result?.canceled) { clearHighlights(); setState('idle'); options.onFinish?.(false); return; }
        clearHighlights();
        options.onChunkEnd?.(chunk.sourceIndex ?? currentChunkIndex, chunk.text);
        currentChunkIndex++;
      }
      if (isCurrent()) { setState('idle'); options.onFinish?.(true); }
    } catch (error) {
      if (!isCurrent()) return;
      stopNative();
      clearHighlights();
      setState('error');
      const code = (error as { code?: string })?.code;
      options.onNotify(nativeSpeechErrorMessage(code, nativePlatform(), options.getLocale?.()));
    } finally { await listener?.remove().catch(() => {}); }
  }

  function setState(next: ReaderSpeechState): void {
    state = next;
    options.onState(next);
  }

  function clearHighlights(): void {
    options.getContent?.()?.querySelectorAll('.tts-word.active').forEach((element) => element.classList.remove('active'));
  }

  function clearVoiceWait(synth?: SpeechSynthesis): void {
    if (voiceTimer) clearTimeout(voiceTimer);
    voiceTimer = null;
    if (voiceHandler && synth) synth.removeEventListener('voiceschanged', voiceHandler);
    voiceHandler = null;
  }

  function cancelSynthesis(nextState: ReaderSpeechState): void {
    generation += 1;
    browserRun++;
    currentUtterance = null;
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    stopNative();
    nativeSpeech = null;
    currentSynth = null;
    activeChunks = [];
    activeVoices = [];
    currentChunkIndex = 0;
    activeSpeakNext = null;
    if (typeof window !== 'undefined') {
      clearVoiceWait(window.speechSynthesis);
      window.speechSynthesis?.cancel();
    }
    clearHighlights();
    options.onChunkEnd?.(-1, '');
    setState(nextState);
  }

  function stop(): void {
    cancelSynthesis('idle');
  }

  function prepareWords(content: HTMLElement): SpeechWord[] {
    const existingWords = content.querySelectorAll('span.tts-word');
    if (existingWords.length > 0) {
      existingWords.forEach((span) => span.replaceWith(document.createTextNode(span.textContent || '')));
      content.normalize();
    }
    const words: SpeechWord[] = [];
    const wrap = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        if (!text.trim()) return;
        const fragment = document.createDocumentFragment();
        for (const token of text.split(/(\s+)/u)) {
          if (!token) continue;
          if (/^\s+$/u.test(token)) fragment.appendChild(document.createTextNode(token));
          else {
            const element = document.createElement('span');
            element.className = 'tts-word';
            element.textContent = token;
            fragment.appendChild(element);
            words.push({ element, text: token });
          }
        }
        node.parentNode?.replaceChild(fragment, node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE'].includes((node as Element).tagName)) return;
      [...node.childNodes].forEach(wrap);
    };
    wrap(content);
    return words;
  }

  function wordsFromText(text: string): SpeechWord[] {
    return text.trim().split(/\s+/u).filter(Boolean).map((token) => ({ element: null, text: token }));
  }

  function buildChunks(words: SpeechWord[]): SpeechChunk[] {
    const chunks: SpeechChunk[] = [];
    let text = '';
    let chunkWords: SpeechWord[] = [];
    for (const word of words) {
      const next = text ? `${text} ${word.text}` : word.text;
      if (next.length > 180 && chunkWords.length) {
        chunks.push({ text, words: chunkWords });
        text = word.text;
        chunkWords = [word];
      } else {
        text = next;
        chunkWords.push(word);
      }
    }
    if (chunkWords.length) chunks.push({ text, words: chunkWords });
    return chunks;
  }

  function scrollToChunk(chunk: SpeechChunk): void {
    const first = chunk.words.find((word) => word.element)?.element;
    const area = options.getScrollArea?.();
    if (!first || !area) return;
    const wordRect = first.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    if (wordRect.top >= areaRect.top && wordRect.bottom <= areaRect.bottom) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ behavior: reduced ? 'auto' : uiScrollBehavior(), block: 'center' });
  }

  function speakChunks(synth: SpeechSynthesis, chunks: SpeechChunk[], voices: SpeechSynthesisVoice[], activeGeneration: number): void {
    if (activeGeneration !== generation) return;
    currentSynth = synth;
    activeChunks = chunks;
    activeVoices = voices;

    let index = 0;
    const speakNext = (): void => {
      if (activeGeneration !== generation) return;
      if (index >= chunks.length) {
        if (options.onAdvance) {
          setState('loading');
          void Promise.resolve().then(() => options.onAdvance!()).then(async hasNext => {
            if (activeGeneration !== generation) return;
            if (hasNext) {
              const next = await resolveChunks(activeGeneration);
              if (activeGeneration !== generation) return;
              if (next.length) { speakChunks(synth, next, voices, activeGeneration); return; }
            }
            clearHighlights(); setState('idle'); options.onFinish?.(true);
          }).catch(() => {
            if (activeGeneration === generation) { clearHighlights(); setState('idle'); options.onFinish?.(false); }
          });
        } else { clearHighlights(); setState('idle'); options.onFinish?.(true); }
        return;
      }
      currentChunkIndex = index;

      const allVoices = synth.getVoices().length ? synth.getVoices() : activeVoices;
      const isEnglish = speechIsEnglish();
      const langVoices = allVoices.filter(
        (item) => isEnglish
          ? item.lang.toLowerCase().startsWith('en')
          : (item.lang.toLowerCase().startsWith('vi') || item.lang.toLowerCase().includes('vn'))
      );

      const voice = langVoices.find(item => item.default) ?? langVoices[0] ?? null;
      const pitch = 1;

      const chunk = chunks[index];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      currentUtterance = utterance; // Retain until completion; some Web Speech engines otherwise lose callbacks.
      const run = ++browserRun;
      const isCurrent = () => activeGeneration === generation && run === browserRun;
      const clearStartTimer = () => { if (startTimer) clearTimeout(startTimer); startTimer = null; };
      utterance.lang = isEnglish ? 'en-US' : 'vi-VN';
      utterance.rate = currentRate;
      utterance.pitch = pitch;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (!isCurrent()) return;
        clearStartTimer();
        setState('playing');
        clearHighlights();
        chunk.words.forEach((word) => word.element?.classList.add('active'));
        scrollToChunk(chunk);
        options.onChunkStart?.(chunk.sourceIndex ?? index, chunk.text);
      };
      utterance.onboundary = event => {
        if (!isCurrent()) return;
        const charIndex = chunk.sourceOffsets?.[event.charIndex] ?? event.charIndex;
        const length = event.charLength;
        const end = length === undefined ? undefined : chunk.sourceOffsets?.[event.charIndex + length];
        options.onChunkBoundary?.({ chunkIndex: chunk.sourceIndex ?? index, charIndex,
          charLength: end === undefined ? length : Math.max(0, end - charIndex), name: event.name });
      };
      utterance.onend = () => {
        if (!isCurrent()) return;
        clearStartTimer();
        currentUtterance = null;
        clearHighlights();
        options.onChunkEnd?.(chunk.sourceIndex ?? index, chunk.text);
        index += 1;
        speakNext();
      };
      utterance.onerror = (event) => {
        if (!isCurrent() || event.error === 'interrupted' || event.error === 'canceled') return;
        clearStartTimer();
        browserRun++;
        currentUtterance = null;
        synth.cancel();
        clearHighlights();
        setState('error');
        options.onNotify((options.getLocale?.() ?? 'vi').toLowerCase().startsWith('en') ? 'Unable to read this article' : 'Không thể đọc nội dung bài viết');
      };
      clearStartTimer();
      startTimer = setTimeout(() => {
        if (isCurrent()) utterance.onerror?.({error:'synthesis-unavailable'} as SpeechSynthesisErrorEvent);
      }, 10000);
      try { synth.speak(currentUtterance); }
      catch { utterance.onerror?.({error:'synthesis-failed'} as SpeechSynthesisErrorEvent); }
    };

    activeSpeakNext = speakNext;
    try { synth.cancel(); } catch {}
    speakNext();
  }

  async function resolveChunks(activeGeneration: number, overrideText?: string): Promise<SpeechChunk[]> {
    if (overrideText !== undefined) return buildChunks(wordsFromText(overrideText));
    if (options.getChunks) {
      const raw = await options.getChunks();
      if (activeGeneration !== generation) return [];
      return raw.flatMap((original, sourceIndex) => {
        const text = speechIsEnglish() ? original.trim() : cleanVietnameseTextForSpeech(original).trim();
        return text ? [{ text, words: wordsFromText(text), sourceIndex,
          sourceOffsets: options.onChunkBoundary ? speechSourceOffsets(original, text) : undefined }] : [];
      });
    }
    if (options.getText) {
      const text = await options.getText();
      if (activeGeneration !== generation) return [];
      return text?.trim() ? buildChunks(wordsFromText(text)) : [];
    }
    const content = options.getContent?.();
    return content ? buildChunks(prepareWords(content)) : [];
  }

  async function start(overrideText?: string): Promise<void> {
    nativeSpeech = getNativeReaderSpeech();
    if (typeof window === 'undefined' || (!nativeSpeech && (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined'))) {
      setState('error');
      options.onNotify((options.getLocale?.() ?? 'vi').toLowerCase().startsWith('en') ? 'This browser does not support automatic reading' : 'Trình duyệt không hỗ trợ đọc tự động');
      return;
    }
    const synth = window.speechSynthesis;
    const activeGeneration = ++generation;
    setState('loading');
    let chunks: SpeechChunk[];
    try {
      chunks = await resolveChunks(activeGeneration, overrideText);
    } catch (cause) {
      if (activeGeneration !== generation || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      setState('error');
      options.onNotify((options.getLocale?.() ?? 'vi').toLowerCase().startsWith('en') ? 'Unable to prepare content for reading' : 'Không thể chuẩn bị nội dung để đọc');
      return;
    }
    if (activeGeneration !== generation) return;
    if (!chunks.length) {
      setState('idle');
      options.onNotify(options.emptyTextMessage || ((options.getLocale?.() ?? 'vi').toLowerCase().startsWith('en') ? 'No content to read' : EMPTY_TEXT_MESSAGE));
      return;
    }
    if (nativeSpeech) {
      activeChunks = chunks;
      currentChunkIndex = 0;
      await speakNativeChunks(activeGeneration);
      return;
    }
    try {
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      synth.speak(unlock);
    } catch {
      // Some engines do not require an audio-policy unlock.
    }
    let started = false;
    const startOnce = (voices: SpeechSynthesisVoice[]): void => {
      if (started || activeGeneration !== generation) return;
      started = true;
      clearVoiceWait(synth);
      speakChunks(synth, chunks, voices, activeGeneration);
    };
    const voices = synth.getVoices();
    if (voices.length) startOnce(voices);
    else {
      voiceHandler = () => startOnce(synth.getVoices());
      synth.addEventListener('voiceschanged', voiceHandler);
      voiceTimer = setTimeout(() => startOnce(synth.getVoices()), 2_000);
    }
  }

  function pause(): void {
    if (state !== 'playing' || typeof window === 'undefined') return;
    if (nativeSpeech) {
      stopNative();
      setState('paused');
      return;
    }
    window.speechSynthesis.pause();
    setState('paused');
  }

  function resume(): void {
    if (state !== 'paused' || typeof window === 'undefined') return;
    if (nativeSpeech) {
      setState('loading');
      void speakNativeChunks(generation);
      return;
    }
    window.speechSynthesis.resume();
    setState('playing');
  }

  return {
    toggle: () => state === 'idle' || state === 'error' ? void start() : stop(),
    play: () => state === 'paused' ? resume() : state === 'idle' || state === 'error' ? void start() : undefined,
    speakSnippet: (text: string) => { void start(text); },
    pause,
    resume,
    stop,
    destroy: stop,
    getState: () => state,
    setRate: (rate: number) => {
      currentRate = Math.min(2, Math.max(options.minimumRate ?? 0.5, rate));
      if (nativeSpeech && state === 'playing') {
        stopNative(); setState('loading'); void speakNativeChunks(generation);
      }
      if (state === 'playing' && currentSynth && activeSpeakNext) {
        browserRun++;
        currentSynth.cancel();
        activeSpeakNext();
      }
    },
    setVoice: (name: string) => {
      selectedVoiceName = 'auto';
      if (nativeSpeech && state === 'playing') {
        stopNative(); setState('loading'); void speakNativeChunks(generation);
      }
      if (state === 'playing' && currentSynth && activeSpeakNext) {
        browserRun++;
        currentSynth.cancel();
        activeSpeakNext();
      }
    },
    getVoice: () => selectedVoiceName,
    getRate: () => currentRate,
  };
}
