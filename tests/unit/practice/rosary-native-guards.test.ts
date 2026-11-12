import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('rosary native command boundaries (source evidence only)', () => {
  it('stores generated iOS rosary rhythms as WAV without renaming existing lecture downloads', () => {
    const swift = read('ios/App/App/DharmaAudioPlugin.swift');
    expect(swift).toMatch(/key\.hasPrefix\("asset:\/\/\/public\/assets\/audio\/rosary-rhythm-v2-"\) && key\.hasSuffix\("\.wav"\)/);
    expect(swift).toContain('isRosaryWave ? ".wav" : ".audio"');
  });

  it('excludes rosary from dharma recovery/widgets on both native owners', () => {
    const swift = read('ios/App/App/DharmaAudioPlugin.swift');
    expect(swift).toContain('["practice:meditation", "practice:rosary"].contains');
    const java = read('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioRecoveryPolicy.java');
    expect(java).toContain('"practice:meditation".equals(albumId) || isRosary(albumId, queueId)');
    expect(java).toContain('queueId.startsWith("practice:rosary:")');
  });
  it('blocks native seeking and remote skip commands without altering dharma paths', () => {
    const swift = read('ios/App/App/DharmaAudioPlugin.swift');
    expect(swift).toContain('!self.queueID.isEmpty, !self.isRosaryPlayback');
    expect(swift).toMatch(/private func skip\(_ delta: Double\) \{\s*guard !isRosaryPlayback else/);
    expect(swift).toContain('ROSARY_SEEK_DISABLED');
    const service = read('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaPlaybackService.java');
    expect(service).toContain('command >= Player.COMMAND_SEEK_TO_DEFAULT_POSITION && command <= Player.COMMAND_SEEK_FORWARD');
    expect(service).toContain('SessionResult.RESULT_ERROR_NOT_SUPPORTED');
    const plugin = read('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioPlugin.java');
    expect(plugin).toContain('isRosaryPlayback()) throw new IllegalStateException("Rosary seeking is unavailable")');
  });
});
