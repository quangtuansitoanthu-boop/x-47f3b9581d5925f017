/**
 * ambient-sound.ts
 * Bộ quản lý âm thanh phụ trợ thiền định thực tế (tiếng mưa rơi, tiếng ồn trắng, tiếng nước chảy...)
 * và âm chuông bát Tây Tạng tổng hợp bằng Web Audio API.
 * Hỗ trợ 100% offline, không tốn thêm băng thông mạng khi đã tải.
 */

import { hasNativePracticeSounds, playNativePracticeSound } from './practice-sound-native';
import { getPlayablePracticeAudioUrl } from './practice-audio-cache';

export type AmbientSoundType =
  | 'none'
  | 'rain'
  | 'white_noise'
  | 'stream'
  | 'heavy_rain'
  | 'light_rain'
  | 'thunder_rain'
  | 'bowl';

export interface AmbientSoundOption {
  id: AmbientSoundType;
  label: string;
  icon: string;
  description: string;
}

export const AMBIENT_SOUND_TRACKS: Partial<Record<AmbientSoundType, string>> = {
  rain: '/assets/audio/ambient/tieng-mua-roi.mp3',
  white_noise: '/assets/audio/ambient/tieng-on-trang.mp3',
  stream: '/assets/audio/ambient/tieng-nuoc-chay.mp3',
  heavy_rain: '/assets/audio/ambient/tieng-troi-mua-lon.mp3',
  light_rain: '/assets/audio/ambient/tieng-troi-mua-nhe.mp3',
  thunder_rain: '/assets/audio/ambient/am-thanh-mua-gio-va-sam-set.mp3'
};

export const AMBIENT_SOUND_OPTIONS: readonly AmbientSoundOption[] = [
  { id: 'none', label: 'Không phát', icon: '🔇', description: 'Không dùng âm thanh nền' },
  { id: 'rain', label: 'Tiếng Mưa Rơi', icon: '🌧️', description: 'Tiếng mưa rơi tĩnh lặng, lắng dịu phiền não' },
  { id: 'white_noise', label: 'Tiếng Ồn Trắng', icon: '📻', description: 'Tiếng ồn trắng nhẹ nhàng, xoa dịu tâm trí' },
  { id: 'stream', label: 'Tiếng nước Chảy', icon: '🌊', description: 'Tiếng nước chảy róc rách, tâm an định' },
  { id: 'heavy_rain', label: 'Tiếng Trời Mưa Lớn', icon: '⛈️', description: 'Tiếng trời mưa lớn rào rạt, ngăn tạp âm bên ngoài' },
  { id: 'light_rain', label: 'Âm thanh tiếng trời Mưa nhẹ', icon: '🌦️', description: 'Tiếng mưa rơi tí tách nhẹ nhàng, thanh tịnh' },
  { id: 'thunder_rain', label: 'Âm thanh Mưa Gió và Sấm Sét', icon: '🌩️', description: 'Tiếng mưa gió và sấm sét tự nhiên trầm hùng' },
  { id: 'bowl', label: 'Chuông bát Tây Tạng', icon: '🧘', description: 'Âm chuông bát ngân vang định kỳ, nuôi dưỡng chánh niệm' }
];

export const AMBIENT_SOUND_LABELS_EN: Record<AmbientSoundType, string> = {
  none: 'None',
  rain: 'Rainfall',
  white_noise: 'White Noise',
  stream: 'Flowing Stream',
  heavy_rain: 'Heavy Rain',
  light_rain: 'Light Rain',
  thunder_rain: 'Thunderstorm',
  bowl: 'Tibetan Singing Bowl'
};

export function getAmbientSoundOption(type?: AmbientSoundType | null): AmbientSoundOption | undefined {
  return AMBIENT_SOUND_OPTIONS.find((opt) => opt.id === type);
}

export function getAmbientSoundLabel(type?: AmbientSoundType | null, isEn = false): string {
  const opt = getAmbientSoundOption(type);
  if (!opt || opt.id === 'none') return '';
  const label = isEn ? (AMBIENT_SOUND_LABELS_EN[opt.id] ?? opt.label) : opt.label;
  return `${opt.icon} ${label}`;
}

export interface AmbientSoundController {
  start(type: AmbientSoundType): void;
  stop(): void;
  setVolume(volume: number): void;
  destroy(): void;
}

export function createAmbientSoundController(nativeMixing: () => boolean = () => false): AmbientSoundController {
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let currentType: AmbientSoundType = 'none';
  let activeNodes: Array<{ stop?: () => void; disconnect: () => void }> = [];
  let bowlTimer: ReturnType<typeof setInterval> | null = null;
  let currentVolume = 0.5;
  let audioElement: HTMLAudioElement | null = null;
  let nativeActive = false;

  function initContext(): AudioContext | null {
    if (context && context.state !== 'closed') return context;
    const AudioContextClass = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      context = new AudioContextClass();
      masterGain = context.createGain();
      masterGain.gain.setValueAtTime(currentVolume, context.currentTime);
      masterGain.connect(context.destination);
      return context;
    } catch {
      return null;
    }
  }

  function cleanupNodes(): void {
    if (bowlTimer) {
      clearInterval(bowlTimer);
      bowlTimer = null;
    }
    for (const node of activeNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
        node.disconnect();
      } catch {
        // ignore
      }
    }
    activeNodes = [];
  }

  function stopAudio(): void {
    if (audioElement) {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
      } catch {
        // ignore
      }
      audioElement = null;
    }
  }

  function startAudioTrack(src: string): void {
    stopAudio();
    const AudioClass = globalThis.Audio;
    if (!AudioClass) return;
    try {
      const audio = new AudioClass(src);
      audio.loop = true;
      audio.volume = currentVolume;
      audio.preload = 'auto';
      audioElement = audio;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }

  // Tiếng chuông bát Tây Tạng (Singing Bowl Gong with sacred harmonics)
  function strikeSingingBowl(ctx: AudioContext, destination: GainNode): void {
    if (ctx.state === 'closed') return;
    const now = ctx.currentTime;
    const baseFreq = 216; // Sacred sound frequency
    const harmonics = [
      { freq: baseFreq, gain: 0.45, decay: 10 },
      { freq: baseFreq * 2.76, gain: 0.22, decay: 7 },
      { freq: baseFreq * 5.4, gain: 0.12, decay: 5 },
      { freq: baseFreq * 8.9, gain: 0.05, decay: 3.5 }
    ];

    const strikeMaster = ctx.createGain();
    strikeMaster.connect(destination);

    // Slow pulsation (theta-wave beat at 3.5Hz)
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(3.5, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.08, now);
    lfo.connect(lfoGain.gain);

    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(h.freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(h.gain, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + h.decay);

      osc.connect(gain);
      gain.connect(strikeMaster);

      osc.start(now);
      osc.stop(now + h.decay);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    }
  }

  function startBowl(ctx: AudioContext, destination: GainNode): void {
    strikeSingingBowl(ctx, destination);
    bowlTimer = setInterval(() => {
      if (currentType === 'bowl' && context && masterGain) {
        strikeSingingBowl(context, masterGain);
      }
    }, 90_000);
  }

  function start(type: AmbientSoundType): void {
    if (type === currentType && (nativeActive || audioElement || activeNodes.length > 0)) return;
    stop();
    currentType = type;
    if (type === 'none') return;

    const track = AMBIENT_SOUND_TRACKS[type];
    if (nativeMixing() && hasNativePracticeSounds() && (track || type === 'bowl')) {
      nativeActive = true;
      if (track) {
        // Android bridge reads bundled assets only, not WebView blob URLs.
        playNativePracticeSound({ channel: 'ambient', source: track, volume: currentVolume });
      } else {
        playNativePracticeSound({ channel: 'cue', cue: 'bowl' });
        bowlTimer = setInterval(() => playNativePracticeSound({ channel: 'cue', cue: 'bowl' }), 90_000);
      }
      return;
    }
    if (track) {
      const playable = getPlayablePracticeAudioUrl(track);
      startAudioTrack(playable);
      return;
    }

    if (type === 'bowl') {
      const ctx = initContext();
      if (!ctx || !masterGain) return;

      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      startBowl(ctx, masterGain);
    }
  }

  function stop(): void {
    if (nativeActive) {
      playNativePracticeSound({ channel: 'ambient', stop: true });
      nativeActive = false;
    }
    stopAudio();
    cleanupNodes();
    currentType = 'none';
  }

  function setVolume(volume: number): void {
    currentVolume = Math.max(0, Math.min(1, volume));
    if (nativeActive && currentType !== 'bowl') playNativePracticeSound({ channel: 'ambient', volume: currentVolume });
    if (audioElement) {
      try {
        audioElement.volume = currentVolume;
      } catch {
        // ignore
      }
    }
    if (masterGain && context && context.state !== 'closed') {
      try {
        masterGain.gain.setValueAtTime(currentVolume, context.currentTime);
      } catch {
        // ignore
      }
    }
  }

  function destroy(): void {
    stop();
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
      context = null;
    }
  }

  return {
    start,
    stop,
    setVolume,
    destroy
  };
}
