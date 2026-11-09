export const ROSARY_INTERVALS = [2000, 1500, 1000, 750] as const;
export type RosaryInterval = (typeof ROSARY_INTERVALS)[number];
export const ROSARY_SAMPLE_RATE = 8000;
export const ROSARY_MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const ROSARY_BELL_TAIL_SECONDS = 8;
export const ROSARY_TARGET_COUNTS = [108, 216, 324, 540, 1080, 2160, 3240, 5400, 10800] as const;
export const ROSARY_CHUNK_BEATS = 540;

export function validateRosaryRhythm(target: number, intervalMs: number): void {
  if (!Number.isSafeInteger(target) || target < 1 || !ROSARY_INTERVALS.includes(intervalMs as RosaryInterval)) throw new Error('invalid_rosary_rhythm');
  if (target > 10800) throw new Error('rosary_session_too_long');
}

export interface RosaryAudioChunk {
  slot: 'first' | 'body' | 'last'; beats: number; previousBeats: number;
  leadingInterval: boolean; bells: boolean; offsetSeconds: number; durationSeconds: number;
}

export function planRosaryAudioChunks(target: number, intervalMs: number): RosaryAudioChunk[] {
  validateRosaryRhythm(target, intervalMs);
  const chunks: RosaryAudioChunk[] = [];
  let previousBeats = 0, offsetSeconds = 0;
  while (previousBeats < target) {
    const beats = Math.min(ROSARY_CHUNK_BEATS, target - previousBeats);
    const leadingInterval = previousBeats === 0, bells = previousBeats + beats === target;
    const durationSeconds = (beats + (leadingInterval ? 1 : 0)) * intervalMs / 1000 + (bells ? ROSARY_BELL_TAIL_SECONDS : 0);
    chunks.push({ slot: bells ? 'last' : leadingInterval ? 'first' : 'body', beats, previousBeats, leadingInterval, bells, offsetSeconds, durationSeconds });
    previousBeats += beats; offsetSeconds += durationSeconds;
  }
  return chunks;
}

/** Clamp old-track end observations before the following chunk's first audible pulse. */
export function rosaryChunkProgress(chunk: RosaryAudioChunk, positionSeconds: number, intervalMs: number, hasStarted: boolean): { count: number; positionSeconds: number } {
  const position = Number.isFinite(positionSeconds) ? Math.max(0, Math.min(positionSeconds, chunk.durationSeconds)) : 0;
  const localCount = chunk.leadingInterval ? Math.floor((position * 1000 + .01) / intervalMs)
    : hasStarted || position > 0 ? Math.floor((position * 1000 + .01) / intervalMs) + 1 : 0;
  return { count: chunk.previousBeats + Math.min(chunk.beats, Math.max(0, localCount)), positionSeconds: chunk.offsetSeconds + position };
}

/** Ticks are encoded at the END of each interval; no wall-clock catch-up after pause. */
export function rosaryCountAtPosition(positionSeconds: number, target: number, intervalMs: number): number {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return 0;
  return Math.min(target, Math.max(0, Math.floor((positionSeconds * 1000 + 0.01) / intervalMs)));
}

/** Shared immutable PCM blocks avoid allocating a full session-sized JS array. */
export function createRosaryWave(pulse: Int16Array, target: number, intervalMs: number, options: { leadingInterval?: boolean; bells?: boolean } = {}): Blob {
  validateRosaryRhythm(target, intervalMs);
  const period = new Int16Array(ROSARY_SAMPLE_RATE * intervalMs / 1000);
  // A pulse begins at each interval boundary. Its short attack fits even the fastest cadence.
  period.set(pulse.subarray(0, Math.min(pulse.length, period.length)));
  const lead = new Int16Array(period.length);
  const tail = new Int16Array(options.bells === false ? 0 : ROSARY_BELL_TAIL_SECONDS * ROSARY_SAMPLE_RATE);
  for (const start of options.bells === false ? [] : [0, 2.5, 5]) {
    for (let i = 0; i < 1.8 * ROSARY_SAMPLE_RATE; i++) {
      const t = i / ROSARY_SAMPLE_RATE;
      const envelope = t < .02 ? t / .02 : Math.exp(-5 * t);
      const value = envelope * (.18 * Math.sin(2 * Math.PI * 660 * t) + .05 * Math.sin(2 * Math.PI * 1326.6 * t));
      const index = Math.round(start * ROSARY_SAMPLE_RATE) + i;
      tail[index] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
  }
  // Final pulse starts when target is reached; bells follow after that pulse's interval.
  const samples = (target + (options.leadingInterval === false ? 0 : 1)) * period.length + tail.length;
  if (44 + samples * 2 > ROSARY_MAX_AUDIO_BYTES) throw new Error('rosary_session_too_long');
  const header = new ArrayBuffer(44), view = new DataView(header);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, ROSARY_SAMPLE_RATE, true); view.setUint32(28, ROSARY_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples * 2, true);
  const parts: BlobPart[] = [header];
  if (options.leadingInterval !== false) parts.push(lead.buffer);
  for (let index = 0; index < target; index++) parts.push(period.buffer);
  parts.push(tail.buffer);
  return new Blob(parts, { type: 'audio/wav' });
}
