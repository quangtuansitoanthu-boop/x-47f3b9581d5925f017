export const WOODEN_FISH_TEMPO_PRESETS = {
  slow: { bpm: 45, maximumBpm: 50, minimumBpm: 40 },
  medium: { bpm: 65, maximumBpm: 70, minimumBpm: 60 },
  fast: { bpm: 99, maximumBpm: 108, minimumBpm: 90 },
} as const;

export type WoodenFishTempoPreset = keyof typeof WOODEN_FISH_TEMPO_PRESETS;
export type PracticeCueKind = 'bell' | 'bowl' | 'khánh' | 'wooden_fish';

export interface ScheduledPracticeCue {
  atElapsedMs: number;
  kind: PracticeCueKind;
  repeat?: number;
}

export interface DuePracticeCue {
  atElapsedMs: number;
  kind: PracticeCueKind;
}

export function resolveWoodenFishBpm(preset: WoodenFishTempoPreset, requestedBpm?: number): number {
  const range = WOODEN_FISH_TEMPO_PRESETS[preset];
  if (requestedBpm == null) return range.bpm;
  if (!Number.isFinite(requestedBpm)) throw new Error('invalid_wooden_fish_bpm');
  return Math.min(range.maximumBpm, Math.max(range.minimumBpm, Math.round(requestedBpm)));
}

/**
 * Returns beat timestamps derived from absolute elapsed time. Consumers schedule
 * the returned beats; they never increment an interval counter, so a delayed
 * browser callback cannot permanently shift the rhythm.
 */
export function woodenFishBeatsDue(
  previousElapsedMs: number,
  elapsedMs: number,
  bpm: number,
  maximumCatchUpBeats = 4,
): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('invalid_wooden_fish_bpm');
  const previous = Math.max(0, previousElapsedMs);
  const current = Math.max(previous, elapsedMs);
  const beatMs = 60_000 / bpm;
  const firstBeat = Math.floor(previous / beatMs) + 1;
  const finalBeat = Math.floor(current / beatMs);
  const firstReturnedBeat = Math.max(firstBeat, finalBeat - Math.max(1, maximumCatchUpBeats) + 1);
  const beats: number[] = [];
  for (let beat = firstReturnedBeat; beat <= finalBeat; beat += 1) {
    beats.push(Math.round(beat * beatMs));
  }
  return beats;
}

export function scheduledCuesDue(
  cues: readonly ScheduledPracticeCue[],
  previousElapsedMs: number,
  elapsedMs: number,
): DuePracticeCue[] {
  const previous = Math.max(0, previousElapsedMs);
  const current = Math.max(previous, elapsedMs);
  return cues
    .flatMap((cue) => Array.from({ length: Math.max(1, Math.floor(cue.repeat ?? 1)) }, () => ({
      atElapsedMs: Math.max(0, Math.floor(cue.atElapsedMs)),
      kind: cue.kind,
    })))
    .filter((cue) => cue.atElapsedMs > previous && cue.atElapsedMs <= current)
    .sort((left, right) => left.atElapsedMs - right.atElapsedMs);
}

export const MEDITATION_DURATION_PRESETS_MINUTES = [15, 30, 45, 60] as const;
export const MEDITATION_PREPARATION_SECONDS = 30;

export type MeditationPhase = 'preparing' | 'active' | 'paused' | 'completed' | 'cancelled';
export type MeditationCue = 'start_bell' | 'end_bell';

export interface MeditationSessionState {
  phase: MeditationPhase;
  targetSeconds: number;
  preparationSeconds: number;
  preparationElapsedMs: number;
  activeElapsedMs: number;
  hiddenElapsedMs: number;
  pausedElapsedMs: number;
  lastObservedAtMs: number;
  startedAtMs: number;
  hidden: boolean;
  backgroundEnabled?: boolean;
  backgroundActiveElapsedMs?: number;
}

export interface MeditationTransition {
  state: MeditationSessionState;
  cues: MeditationCue[];
}

export function meditationDurationSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
    throw new Error('invalid_meditation_duration');
  }
  return Math.round(minutes * 60);
}

export function createMeditationSession(
  targetSeconds: number,
  startedAtMs: number,
  preparationSeconds = MEDITATION_PREPARATION_SECONDS,
  backgroundEnabled = false,
): MeditationSessionState {
  if (!Number.isSafeInteger(targetSeconds) || targetSeconds <= 0) throw new Error('invalid_meditation_target');
  if (!Number.isSafeInteger(preparationSeconds) || preparationSeconds < 0) {
    throw new Error('invalid_meditation_preparation');
  }
  if (!Number.isFinite(startedAtMs)) throw new Error('invalid_meditation_clock');
  return {
    phase: preparationSeconds === 0 ? 'active' : 'preparing',
    targetSeconds,
    preparationSeconds,
    preparationElapsedMs: 0,
    activeElapsedMs: 0,
    hiddenElapsedMs: 0,
    pausedElapsedMs: 0,
    lastObservedAtMs: startedAtMs,
    startedAtMs,
    hidden: false,
    backgroundEnabled,
    backgroundActiveElapsedMs: 0,
  };
}

export function advanceMeditationSession(
  input: MeditationSessionState,
  observedAtMs: number,
): MeditationTransition {
  const state = { ...input };
  const delta = monotonicDelta(state.lastObservedAtMs, observedAtMs);
  state.lastObservedAtMs = Math.max(state.lastObservedAtMs, observedAtMs);
  const cues: MeditationCue[] = [];

  if (state.phase === 'completed' || state.phase === 'cancelled') return { state, cues };
  if (state.hidden) {
    state.hiddenElapsedMs += delta;
    if (!state.backgroundEnabled) return { state, cues };
  }
  if (state.phase === 'paused') {
    state.pausedElapsedMs += delta;
    return { state, cues };
  }

  let activeDelta = delta;
  if (state.phase === 'preparing') {
    const preparationTargetMs = state.preparationSeconds * 1_000;
    const remainingPreparation = Math.max(0, preparationTargetMs - state.preparationElapsedMs);
    const preparationDelta = Math.min(remainingPreparation, activeDelta);
    state.preparationElapsedMs += preparationDelta;
    activeDelta -= preparationDelta;
    if (state.preparationElapsedMs >= preparationTargetMs) {
      state.phase = 'active';
      cues.push('start_bell', 'start_bell', 'start_bell');
    }
  }

  if (state.phase === 'active' && activeDelta > 0) {
    const previousActive = state.activeElapsedMs;
    state.activeElapsedMs = Math.min(state.targetSeconds * 1_000, state.activeElapsedMs + activeDelta);
    if (state.hidden) state.backgroundActiveElapsedMs = (state.backgroundActiveElapsedMs ?? 0) + state.activeElapsedMs - previousActive;
    if (state.activeElapsedMs >= state.targetSeconds * 1_000) {
      state.phase = 'completed';
      cues.push('end_bell');
    }
  }
  return { state, cues };
}

/** Native sleep timer vẫn chạy khi WebView bị treo và ngừng tính lúc MediaSession bị pause. */
export function reconcileMeditationPlayback(
  input: MeditationSessionState, remainingMs: number, observedAtMs: number, playing: boolean,
): MeditationTransition {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(observedAtMs)) return { state: input, cues: [] };
  if (input.phase === 'completed' || input.phase === 'cancelled') return { state: input, cues: [] };
  const state = { ...input };
  const preparationMs = state.preparationSeconds * 1_000;
  const totalMs = preparationMs + state.targetSeconds * 1_000;
  const progressed = totalMs - Math.min(totalMs, Math.max(0, remainingMs));
  const active = Math.max(0, progressed - preparationMs);
  const delta = monotonicDelta(state.lastObservedAtMs, observedAtMs);
  const cues: MeditationCue[] = [];
  if (state.preparationElapsedMs < preparationMs && progressed >= preparationMs) cues.push('start_bell', 'start_bell', 'start_bell');
  if (state.hidden) {
    state.hiddenElapsedMs += delta;
    state.backgroundActiveElapsedMs = Math.min(active, (state.backgroundActiveElapsedMs ?? 0) + Math.max(0, active - state.activeElapsedMs));
  }
  state.preparationElapsedMs = Math.min(preparationMs, progressed);
  state.activeElapsedMs = active;
  state.backgroundActiveElapsedMs = Math.min(active, state.backgroundActiveElapsedMs ?? 0);
  state.lastObservedAtMs = Math.max(state.lastObservedAtMs, observedAtMs);
  if (progressed >= totalMs) { state.phase = 'completed'; cues.push('end_bell'); }
  else state.phase = !playing ? 'paused' : progressed < preparationMs ? 'preparing' : 'active';
  return { state, cues };
}

export function setMeditationVisibility(
  input: MeditationSessionState,
  hidden: boolean,
  observedAtMs: number,
): MeditationTransition {
  const advanced = advanceMeditationSession(input, observedAtMs);
  advanced.state.hidden = hidden;
  return advanced;
}

export function pauseMeditationSession(
  input: MeditationSessionState,
  observedAtMs: number,
): MeditationTransition {
  const advanced = advanceMeditationSession(input, observedAtMs);
  if (advanced.state.phase === 'preparing' || advanced.state.phase === 'active') {
    advanced.state.phase = 'paused';
  }
  return advanced;
}

export function resumeMeditationSession(
  input: MeditationSessionState,
  observedAtMs: number,
): MeditationTransition {
  const advanced = advanceMeditationSession(input, observedAtMs);
  if (advanced.state.phase === 'paused') {
    advanced.state.phase = advanced.state.preparationElapsedMs < advanced.state.preparationSeconds * 1_000
      ? 'preparing'
      : 'active';
  }
  return advanced;
}

export function cancelMeditationSession(
  input: MeditationSessionState,
  observedAtMs: number,
): MeditationTransition {
  const advanced = advanceMeditationSession(input, observedAtMs);
  if (advanced.state.phase !== 'completed') advanced.state.phase = 'cancelled';
  return advanced;
}

export function meditationEvidence(state: MeditationSessionState): {
  activeSeconds: number;
  clientElapsedSeconds: number;
  hiddenSeconds: number;
  backgroundActiveSeconds?: number;
} {
  return {
    activeSeconds: Math.max(0, Math.floor(state.activeElapsedMs / 1_000) - Math.floor((state.backgroundActiveElapsedMs ?? 0) / 1_000)),
    clientElapsedSeconds: Math.floor((state.lastObservedAtMs - state.startedAtMs) / 1_000),
    hiddenSeconds: Math.floor(state.hiddenElapsedMs / 1_000),
    ...(state.backgroundEnabled ? { backgroundActiveSeconds: Math.floor((state.backgroundActiveElapsedMs ?? 0) / 1_000) } : {}),
  };
}

export const ROSARY_SIZES = [18, 27, 54, 108] as const;
export const ROSARY_DAILY_GOALS = [1_000, 3_000, 10_000] as const;
export const ROSARY_MINIMUM_INTERACTION_MS = 400;
export const ROSARY_PHRASES = [
  'Nam mô A Di Đà Phật',
  'Nam mô Quán Thế Âm Bồ Tát',
  'Nam mô Bổn Sư Thích Ca Mâu Ni Phật',
  'Nam mô Địa Tạng Vương Bồ Tát',
  'Nam mô Dược Sư Lưu Ly Quang Vương Phật',
  'Nam mô Đại Trí Văn Thù Sư Lợi Bồ Tát',
  'Nam mô Đại Hạnh Phổ Hiền Bồ Tát',
  'Nam mô Đại Thế Chí Bồ Tát',
  'Nam mô Chuẩn Đề Vương Bồ Tát',
  'Án Ma Ni Bát Mê Hồng',
  'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
  'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
  'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
  'Tùy chọn',
] as const;

export type RosarySize = (typeof ROSARY_SIZES)[number];
export type RosaryDailyGoal = (typeof ROSARY_DAILY_GOALS)[number];
export type RosaryPhrase = (typeof ROSARY_PHRASES)[number] | string;

export interface CustomRosaryPhraseItem {
  id: string;
  text: string;
  type: 'Niệm danh hiệu' | 'Trì chú';
  createdAt?: string;
}

export const CUSTOM_ROSARY_PHRASES_STORAGE_KEY = 'tt_custom_rosary_phrases_v1';

export function getRosaryPracticeType(phrase: string): CustomRosaryPhraseItem['type'] {
  const text = phrase.toLocaleLowerCase('vi');
  return text.includes('chú') || text.includes('chân ngôn') || text.includes('hồng')
    ? 'Trì chú' : 'Niệm danh hiệu';
}

export function normalizeCustomRosaryPhrases(value: unknown): CustomRosaryPhraseItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const phrases: CustomRosaryPhraseItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !/^cp_\d{10,16}_[a-z0-9]{1,12}$/u.test(entry.id) || seen.has(entry.id)
      || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.trim().length > 120
      || /[\u0000-\u001f\u007f-\u009f]/u.test(entry.text)
      || (entry.type !== 'Niệm danh hiệu' && entry.type !== 'Trì chú')) continue;
    seen.add(entry.id);
    phrases.push({ id: entry.id, text: entry.text.trim(), type: entry.type,
      ...(typeof entry.createdAt === 'string' ? { createdAt: entry.createdAt } : {}) });
  }
  return phrases;
}

export function resolveRosarySelection(
  phrase: string,
  customPhrases: readonly CustomRosaryPhraseItem[],
): { phrase: string; type: CustomRosaryPhraseItem['type'] } | null {
  if (phrase.startsWith('custom:')) {
    const item = normalizeCustomRosaryPhrases(customPhrases).find(value => `custom:${value.id}` === phrase);
    return item ? { phrase: item.text, type: item.type } : null;
  }
  if (phrase === 'Tùy chọn' || !(ROSARY_PHRASES as readonly string[]).includes(phrase)) return null;
  return { phrase, type: getRosaryPracticeType(phrase) };
}

/**
 * Tên hiển thị tiếng Anh chuẩn cho từng danh hiệu (giữ nguyên giá trị Việt
 * làm canonical để không gãy dữ liệu/log đã lưu). Dùng khi locale EN.
 */
export const ROSARY_PHRASE_EN: Record<string, string> = {
  'Nam mô A Di Đà Phật': 'Namo Amitabha Buddha',
  'Nam mô Quán Thế Âm Bồ Tát': 'Namo Avalokiteshvara Bodhisattva',
  'Nam mô Bổn Sư Thích Ca Mâu Ni Phật': 'Namo Shakyamuni Buddha, the Original Teacher',
  'Nam mô Địa Tạng Vương Bồ Tát': 'Namo Ksitigarbha Bodhisattva',
  'Nam mô Dược Sư Lưu Ly Quang Vương Phật': 'Namo Bhaisajyaguru, Medicine Buddha of Lapis Light',
  'Nam mô Đại Trí Văn Thù Sư Lợi Bồ Tát': 'Namo Manjushri Bodhisattva of Great Wisdom',
  'Nam mô Đại Hạnh Phổ Hiền Bồ Tát': 'Namo Samantabhadra Bodhisattva of Great Conduct',
  'Nam mô Đại Thế Chí Bồ Tát': 'Namo Mahasthamaprapta Bodhisattva',
  'Nam mô Chuẩn Đề Vương Bồ Tát': 'Namo Cundi Bodhisattva',
  'Án Ma Ni Bát Mê Hồng': 'Om Mani Padme Hum',
  'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha': 'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
  'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.': 'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
  'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim': 'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
  'Tùy chọn': 'Custom',
};

/** Tên hiển thị của danh hiệu theo locale (EN dùng tên chuẩn, VI giữ nguyên). */
export function displayRosaryPhrase(
  phrase: RosaryPhrase,
  locale: string,
  customPhrases?: readonly CustomRosaryPhraseItem[]
): string {
  if (typeof phrase === 'string' && phrase.startsWith('custom:')) {
    const id = phrase.slice(7);
    const item = customPhrases?.find(cp => cp.id === id);
    if (item) return item.text;
  }
  if (locale === 'en') return ROSARY_PHRASE_EN[phrase] ?? phrase;
  return phrase;
}

export interface RosarySessionState {
  acceptedCount: number;
  dailyCountBeforeSession: number;
  dailyGoal: RosaryDailyGoal;
  lastAcceptedAtMs: number | null;
  minimumIntervalMs: number;
  phrase: RosaryPhrase;
  size: RosarySize;
  startedAtMs: number;
}

export function createRosarySession(input: {
  dailyCountBeforeSession?: number;
  dailyGoal: RosaryDailyGoal;
  phrase: RosaryPhrase;
  size: RosarySize;
  startedAtMs: number;
}): RosarySessionState {
  if (!ROSARY_SIZES.includes(input.size)) throw new Error('invalid_rosary_size');
  if (!ROSARY_DAILY_GOALS.includes(input.dailyGoal)) throw new Error('invalid_rosary_goal');
  if (!(ROSARY_PHRASES as readonly string[]).includes(input.phrase) && !String(input.phrase).trim()) throw new Error('invalid_rosary_phrase');
  if (!Number.isFinite(input.startedAtMs)) throw new Error('invalid_rosary_clock');
  return {
    acceptedCount: 0,
    dailyCountBeforeSession: Math.max(0, Math.floor(input.dailyCountBeforeSession ?? 0)),
    dailyGoal: input.dailyGoal,
    lastAcceptedAtMs: null,
    minimumIntervalMs: ROSARY_MINIMUM_INTERACTION_MS,
    phrase: input.phrase,
    size: input.size,
    startedAtMs: input.startedAtMs,
  };
}

export function acceptRosaryInteraction(
  input: RosarySessionState,
  observedAtMs: number,
): { accepted: boolean; completedCycle: boolean; reachedDailyGoal: boolean; state: RosarySessionState } {
  if (!Number.isFinite(observedAtMs) || observedAtMs < input.startedAtMs) {
    return { accepted: false, completedCycle: false, reachedDailyGoal: false, state: input };
  }
  const interval = input.lastAcceptedAtMs == null ? null : observedAtMs - input.lastAcceptedAtMs;
  if (interval != null && interval < ROSARY_MINIMUM_INTERACTION_MS) {
    return { accepted: false, completedCycle: false, reachedDailyGoal: false, state: input };
  }
  const acceptedCount = input.acceptedCount + 1;
  const totalBefore = input.dailyCountBeforeSession + input.acceptedCount;
  const totalAfter = input.dailyCountBeforeSession + acceptedCount;
  return {
    accepted: true,
    completedCycle: acceptedCount % input.size === 0,
    reachedDailyGoal: totalBefore < input.dailyGoal && totalAfter >= input.dailyGoal,
    state: {
      ...input,
      acceptedCount,
      lastAcceptedAtMs: observedAtMs,
      minimumIntervalMs: interval == null ? input.minimumIntervalMs : Math.min(input.minimumIntervalMs, interval),
    },
  };
}

export function rosaryGoalProgress(state: RosarySessionState): number {
  const total = state.dailyCountBeforeSession + state.acceptedCount;
  return Math.min(1, total / state.dailyGoal);
}

export function rosaryEvidence(state: RosarySessionState, observedAtMs: number): {
  acceptedCount: number;
  clientElapsedSeconds: number;
  minimumIntervalMs: number;
} {
  return {
    acceptedCount: state.acceptedCount,
    // Làm tròn lên phần giây lẻ để không mất hạt hợp lệ ở biên 400ms khi server kiểm tốc độ.
    clientElapsedSeconds: Math.max(0, Math.ceil((observedAtMs - state.startedAtMs) / 1_000)),
    minimumIntervalMs: state.minimumIntervalMs,
  };
}

function monotonicDelta(previousMs: number, observedMs: number): number {
  if (!Number.isFinite(observedMs)) throw new Error('invalid_meditation_clock');
  return Math.max(0, observedMs - previousMs);
}
