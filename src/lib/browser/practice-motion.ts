export type MeditationMotionStatus =
  | 'disabled'
  | 'requesting'
  | 'sampling'
  | 'unsupported'
  | 'denied'
  | 'error';

export interface MeditationMotionSnapshot {
  sampleCount: number;
  sampleLimitReached: boolean;
  status: MeditationMotionStatus;
  stillnessPercent: number | null;
  stillSampleCount: number;
}

export interface MeditationMotionEvidence {
  motionSampleCount?: number;
  motionSampleLimitReached?: true;
  motionStatus: MeditationMotionStatus;
  motionStillnessPercent?: number;
}

interface DeviceMotionPermissionConstructor {
  requestPermission?: () => Promise<'denied' | 'granted'>;
}

interface PracticeMotionTarget {
  DeviceMotionEvent?: DeviceMotionPermissionConstructor;
  addEventListener(type: 'devicemotion', listener: (event: DeviceMotionEvent) => void): void;
  removeEventListener(type: 'devicemotion', listener: (event: DeviceMotionEvent) => void): void;
}

interface PracticeMotionDependencies {
  maximumSamples?: number;
  minimumSampleIntervalMs?: number;
  now?: () => number;
  stillnessThreshold?: number;
  target?: PracticeMotionTarget | null;
}

const DEFAULT_MAXIMUM_SAMPLES = 20_000;
const DEFAULT_MINIMUM_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_STILLNESS_THRESHOLD = 0.35;

export function createPracticeMotionController(dependencies: PracticeMotionDependencies = {}) {
  const target = dependencies.target === undefined
    ? (typeof window === 'undefined' ? null : window as unknown as PracticeMotionTarget)
    : dependencies.target;
  const maximumSamples = positiveInteger(dependencies.maximumSamples, DEFAULT_MAXIMUM_SAMPLES);
  const minimumSampleIntervalMs = nonNegativeNumber(
    dependencies.minimumSampleIntervalMs,
    DEFAULT_MINIMUM_SAMPLE_INTERVAL_MS,
  );
  const stillnessThreshold = nonNegativeNumber(
    dependencies.stillnessThreshold,
    DEFAULT_STILLNESS_THRESHOLD,
  );
  const now = dependencies.now ?? (() => performance.now());
  const subscribers = new Set<(snapshot: MeditationMotionSnapshot) => void>();
  let requestVersion = 0;
  let listening = false;
  let lastSampleAtMs: number | null = null;
  let snapshot = initialSnapshot();

  const publish = (next: MeditationMotionSnapshot): MeditationMotionSnapshot => {
    snapshot = next;
    for (const subscriber of subscribers) subscriber({ ...snapshot });
    return { ...snapshot };
  };

  const detach = (): void => {
    if (!listening || !target) return;
    target.removeEventListener('devicemotion', sampleMotion);
    listening = false;
  };

  const sampleMotion = (event: DeviceMotionEvent): void => {
    if (snapshot.status !== 'sampling' || snapshot.sampleLimitReached) return;
    const observedAtMs = now();
    if (lastSampleAtMs !== null && observedAtMs - lastSampleAtMs < minimumSampleIntervalMs) return;
    const acceleration = event.acceleration;
    const components = acceleration
      ? [acceleration.x, acceleration.y, acceleration.z]
      : [];
    if (components.length !== 3 || components.some((component) => !Number.isFinite(component))) return;

    lastSampleAtMs = observedAtMs;
    const magnitude = Math.hypot(...components as number[]);
    const sampleCount = snapshot.sampleCount + 1;
    const stillSampleCount = snapshot.stillSampleCount + (magnitude <= stillnessThreshold ? 1 : 0);
    const sampleLimitReached = sampleCount >= maximumSamples;
    publish({
      sampleCount,
      sampleLimitReached,
      status: 'sampling',
      stillnessPercent: Math.round((stillSampleCount / sampleCount) * 100),
      stillSampleCount,
    });
    if (sampleLimitReached) detach();
  };

  const reset = (status: MeditationMotionStatus): MeditationMotionSnapshot => {
    requestVersion += 1;
    detach();
    lastSampleAtMs = null;
    return publish({ ...initialSnapshot(), status });
  };

  return {
    /** Call only from a user gesture when the optional sensor toggle is enabled. */
    async requestAndStart(): Promise<MeditationMotionSnapshot> {
      const version = requestVersion + 1;
      reset('requesting');
      requestVersion = version;
      const constructor = target?.DeviceMotionEvent;
      if (!target || !constructor) return publish({ ...initialSnapshot(), status: 'unsupported' });

      try {
        if (typeof constructor.requestPermission === 'function') {
          const permission = await constructor.requestPermission.call(constructor);
          if (requestVersion !== version) return { ...snapshot };
          if (permission !== 'granted') return publish({ ...initialSnapshot(), status: 'denied' });
        }
        if (requestVersion !== version) return { ...snapshot };
        target.addEventListener('devicemotion', sampleMotion);
        listening = true;
        return publish({ ...initialSnapshot(), status: 'sampling' });
      } catch {
        if (requestVersion !== version) return { ...snapshot };
        detach();
        return publish({ ...initialSnapshot(), status: 'error' });
      }
    },

    disable(): MeditationMotionSnapshot {
      return reset('disabled');
    },

    destroy(): void {
      reset('disabled');
      subscribers.clear();
    },

    getEvidence(): MeditationMotionEvidence {
      const evidence: MeditationMotionEvidence = { motionStatus: snapshot.status };
      if (snapshot.sampleCount < 1) return evidence;
      evidence.motionSampleCount = snapshot.sampleCount;
      evidence.motionStillnessPercent = snapshot.stillnessPercent ?? undefined;
      if (snapshot.sampleLimitReached) evidence.motionSampleLimitReached = true;
      return evidence;
    },

    getSnapshot(): MeditationMotionSnapshot {
      return { ...snapshot };
    },

    stop(): MeditationMotionSnapshot {
      requestVersion += 1;
      detach();
      if (snapshot.status === 'requesting') return publish({ ...initialSnapshot(), status: 'disabled' });
      return { ...snapshot };
    },

    subscribe(subscriber: (snapshot: MeditationMotionSnapshot) => void): () => void {
      subscribers.add(subscriber);
      subscriber({ ...snapshot });
      return () => subscribers.delete(subscriber);
    },
  };
}

function initialSnapshot(): MeditationMotionSnapshot {
  return {
    sampleCount: 0,
    sampleLimitReached: false,
    status: 'disabled',
    stillnessPercent: null,
    stillSampleCount: 0,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}
