import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: 'ios', available: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => native.platform !== 'web', nativePlatform: () => native.platform }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isPluginAvailable: () => native.available }, registerPlugin: (name: string) => ({ name }) }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url }));
import { hasNativeTalkAudio, nativeTalkUrl } from '$lib/browser/native-talk-audio';
import { getNativeReaderSpeech } from '$lib/browser/native-reader-speech';
afterEach(() => { native.platform = 'ios'; native.available = true; vi.unstubAllGlobals(); });
it.each(['ios', 'android'])('uses the registered native playback and speech bridge on %s', platform => {
  native.platform = platform;
  expect(hasNativeTalkAudio()).toBe(true);
  expect(getNativeReaderSpeech()).not.toBeNull();
});
it('keeps web fallback and does not call a missing iOS plugin', () => {
  native.platform = 'web';
  expect(hasNativeTalkAudio()).toBe(false);
  expect(getNativeReaderSpeech()).toBeNull();
  native.platform = 'ios'; native.available = false;
  expect(hasNativeTalkAudio()).toBe(false);
  expect(getNativeReaderSpeech()).toBeNull();
});
it('maps iOS bundled audio to a local asset and preserves remote and Android URLs', () => {
  vi.stubGlobal('document', { baseURI: 'capacitor://localhost/' });
  expect(nativeTalkUrl('/assets/audio/nhac-thien-01.m4a')).toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
  expect(nativeTalkUrl('https://localhost/assets/audio/nhac-thien-01.m4a')).toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
  expect(nativeTalkUrl('https://media.quangtu.vn/talk.mp3')).toBe('https://media.quangtu.vn/talk.mp3');
});

it('reloads a failed iOS audio item at its retained position before attempting playback again', () => {
  const source = readFileSync('ios/App/App/DharmaAudioPlugin.swift', 'utf8');
  const playback = source.split('private func startPlayback() throws {')[1]?.split('private func pausePlayback()')[0] ?? '';
  const retry = /if player\.currentItem\?\.status == \.failed \{([\s\S]*?)\}/.exec(playback);
  expect(retry, 'the shared native play path must replace a failed AVPlayerItem').not.toBeNull();
  const branch = retry?.[1] ?? '';
  expect(branch).toMatch(/try loadTrack\(position: retainedPosition, autoplay: true\)\s+return/);
  expect(branch).not.toMatch(/queueID\s*=|tracks\s*=|index\s*=|sleepRemaining\s*=|sleepAtEnd\s*=|stopAndClearWidget/);
  expect(playback.indexOf(retry?.[0] ?? '')).toBeLessThan(playback.indexOf('player.playImmediately'));
});

it('keeps the small iOS sleep caption readable without changing the accented timer control', () => {
  const source = readFileSync('ios/App/CalendarWidget/DharmaAudioWidget.swift', 'utf8');
  const face = source.split('private func sleepFace(_ audio: DharmaAudioWidgetData) -> some View {')[1]
    ?.split('@ViewBuilder private func sleepControl')[0] ?? '';
  expect(face).toMatch(/Text\(WidgetLocaleStore\.text\("\\\(audio\.sleepRemainingMinutes\) phút", "\\\(audio\.sleepRemainingMinutes\) min"\)\)\.font\(\.system\(size: 9\)\)\.foregroundColor\(secondary\)/);
  expect(face).toContain('Image(systemName: "timer").font(.system(size: 20))');
  expect(face).toContain('.frame(minWidth: 44, minHeight: 44).foregroundColor(audio.sleepRemainingMinutes > 0 ? accent : secondary)');
});

it('neutralizes both paused and playing iOS audio snapshots when their freshness window expires', () => {
  const source = readFileSync('ios/App/CalendarWidget/DharmaAudioWidget.swift', 'utf8');
  const timeline = source.split('func getTimeline(in context: Context, completion: @escaping (Timeline<DharmaAudioWidgetEntry>) -> Void) {')[1]
    ?.split('struct DharmaAudioWidgetView')[0] ?? '';
  expect(timeline).toContain('if let audio = audio {');
  expect(timeline).not.toContain('audio.isPlaying');
  expect(timeline).toContain('let staleAt = audio.updatedAt.addingTimeInterval(91)');
  expect(timeline).toContain('if staleAt > now { entries.append(DharmaAudioWidgetEntry(date: staleAt, audio: audio)) }');
  expect(timeline).toContain('policy: .after(now.addingTimeInterval(900))');
});

it('connects the Android audio widget using the application context instead of the restricted broadcast context', () => {
  const source = readFileSync('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioWidgetProvider.java', 'utf8');
  const command = source.split('if (ACTION.equals(intent.getAction())) {')[1]
    ?.split('if (Intent.ACTION_CONFIGURATION_CHANGED')[0] ?? '';
  expect(command).toContain('Context applicationContext = context.getApplicationContext();');
  expect(command).toContain('new androidx.media3.session.MediaController.Builder(applicationContext,');
  expect(command).toContain('new androidx.media3.session.SessionToken(applicationContext, new ComponentName(applicationContext, DharmaPlaybackService.class))');
  expect(command).toContain('androidx.core.content.ContextCompat.getMainExecutor(applicationContext)');
  expect(command).not.toContain('MediaController.Builder(context,');
  expect(command).not.toContain('SessionToken(context,');
});

it('finishes the Android widget broadcast when controller creation throws synchronously', () => {
  const source = readFileSync('android/app/src/main/java/vn/quangtu/tutam/audio/DharmaAudioWidgetProvider.java', 'utf8');
  const command = source.split('if (ACTION.equals(intent.getAction())) {')[1]
    ?.split('if (Intent.ACTION_CONFIGURATION_CHANGED')[0] ?? '';
  const guard = /try\s*\{\s*connection\s*=\s*new[\s\S]*?\.buildAsync\(\);\s*\}\s*catch\s*\(RuntimeException\s+\w+\)\s*\{([\s\S]*?)\}/u.exec(command);
  expect(guard, 'goAsync must not leak its PendingResult if bind/controller creation fails before returning a future').not.toBeNull();
  expect(guard?.[1]).toContain('pending.finish();');
  expect(guard?.[1]).toContain('android.util.Log.w(');
  expect(guard?.[1]).toContain('updateAll(applicationContext);');
  expect(guard?.[1]).toContain('return;');
});
