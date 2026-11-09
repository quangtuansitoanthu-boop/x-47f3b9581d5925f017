export interface InteractionDevice {
  native: boolean;
  reducedMotion: boolean;
  memory?: number;
  cores?: number;
}

export function interactionProfile(device: InteractionDevice): 'efficient' | 'full' {
  return device.native || device.reducedMotion ||
    (typeof device.memory === 'number' && device.memory > 0 && device.memory <= 4) ||
    (typeof device.cores === 'number' && device.cores > 0 && device.cores <= 4)
    ? 'efficient' : 'full';
}

export function initializeInteractionPerformance(native: boolean): () => void {
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const update = () => {
    document.documentElement.dataset.performance = interactionProfile({
      native, reducedMotion: motion?.matches ?? false,
      memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      cores: navigator.hardwareConcurrency,
    });
  };
  update();
  motion?.addEventListener?.('change', update);
  return () => motion?.removeEventListener?.('change', update);
}
