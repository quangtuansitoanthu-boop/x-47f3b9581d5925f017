import { describe, expect, it } from 'vitest';
import { createRosaryWave, planRosaryAudioChunks, rosaryChunkProgress, rosaryCountAtPosition, validateRosaryRhythm, ROSARY_SAMPLE_RATE, ROSARY_MAX_AUDIO_BYTES, ROSARY_TARGET_COUNTS } from '../../../src/lib/domain/practice/rosary-rhythm';

describe('finite rosary audio cadence', () => {
  it('counts only played media positions, clamps completion and rejects unavailable timings', () => {
    expect(rosaryCountAtPosition(.999, 108, 1000)).toBe(0);
    expect(rosaryCountAtPosition(1, 108, 1000)).toBe(1);
    expect(rosaryCountAtPosition(80, 108, 750)).toBe(106);
    expect(rosaryCountAtPosition(500, 108, 1000)).toBe(108);
    expect(rosaryCountAtPosition(NaN, 108, 1000)).toBe(0);
    expect(() => validateRosaryRhythm(100000, 2000)).toThrow('rosary_session_too_long');
    expect(() => validateRosaryRhythm(108, 10)).toThrow('invalid_rosary_rhythm');
  });
  it('supports all target presets to10800 using at most3bounded audio chunks without changing108 timing', () => {
    for (const target of ROSARY_TARGET_COUNTS) {
      validateRosaryRhythm(target, 2000);
      const chunks = planRosaryAudioChunks(target, 2000);
      expect(chunks.reduce((sum, chunk) => sum + chunk.beats, 0)).toBe(target);
      expect(chunks.filter(chunk => chunk.bells)).toHaveLength(1);
      expect(chunks.filter(chunk => chunk.leadingInterval)).toHaveLength(1);
      expect(new Set(chunks.map(chunk => chunk.slot)).size).toBeLessThanOrEqual(3);
      for (const chunk of chunks) {
        const wave = createRosaryWave(new Int16Array([1234]), chunk.beats, 2000, chunk);
        expect(wave.size).toBeLessThan(ROSARY_MAX_AUDIO_BYTES);
      }
    }
    expect(planRosaryAudioChunks(108, 1000)).toEqual([{ slot: 'last', beats: 108, previousBeats: 0, leadingInterval: true, bells: true, offsetSeconds: 0, durationSeconds: 117 }]);
  });
  it('does not count the following chunk pulse at the old chunk end', () => {
    const chunks = planRosaryAudioChunks(1080, 1000);
    expect(rosaryChunkProgress(chunks[0], 541, 1000, false).count).toBe(540);
    expect(rosaryChunkProgress(chunks[1], 0, 1000, false).count).toBe(540);
    expect(rosaryChunkProgress(chunks[1], 0, 1000, true).count).toBe(541);
    expect(rosaryChunkProgress(chunks[1], 540, 1000, false).count).toBe(1080);
  });
  it('encodes exactly target pulses after a silent lead, followed by three finite bells', async () => {
    const wave = createRosaryWave(new Int16Array([1234, -1234]), 3, 1000);
    const data = new DataView(await wave.arrayBuffer());
    expect(data.getUint32(4, true)).toBe(wave.size - 8);
    expect(data.getUint32(24, true)).toBe(ROSARY_SAMPLE_RATE);
    const sample = (at: number) => data.getInt16(44 + at * 2, true);
    expect(sample(0)).toBe(0);
    for (const tick of [1, 2, 3]) expect(sample(tick * ROSARY_SAMPLE_RATE)).toBe(1234);
    for (const bell of [4, 6.5, 9]) expect(Math.abs(sample(Math.round((bell + .01) * ROSARY_SAMPLE_RATE)))).toBeGreaterThan(0);
    expect(wave.size).toBe(44 + 12 * ROSARY_SAMPLE_RATE * 2);
  });
});
