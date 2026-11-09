export interface AudioLibraryRequestToken {
  readonly controller: AbortController;
  readonly generation: number;
  readonly principalId: string;
}

export type AudioLibraryRequestResult = 'applied' | 'rolled_back' | 'stale';

export function createAudioLibraryRequestLifecycle(initialPrincipalId: string | null) {
  let activePrincipalId = normalizePrincipalId(initialPrincipalId);
  let generation = 0;
  let destroyed = false;
  const pending = new Set<AbortController>();
  let mutationTail: Promise<void> = Promise.resolve();

  const isCurrent = (token: AudioLibraryRequestToken) => (
    !destroyed
    && token.generation === generation
    && token.principalId === activePrincipalId
    && !token.controller.signal.aborted
  );

  const abortPending = () => {
    for (const controller of pending) controller.abort();
    pending.clear();
  };

  return {
    captureGeneration(): number {
      return generation;
    },

    isGenerationCurrent(capturedGeneration: number): boolean {
      return !destroyed && capturedGeneration === generation;
    },

    begin(principalId: string): AudioLibraryRequestToken | null {
      const normalized = normalizePrincipalId(principalId);
      if (destroyed || !normalized || normalized !== activePrincipalId) return null;
      const controller = new AbortController();
      pending.add(controller);
      return { controller, generation, principalId: normalized };
    },

    destroy(): void {
      destroyed = true;
      generation += 1;
      abortPending();
    },

    isCurrent,

    schedule<T>(mutation: () => Promise<T>): Promise<T> {
      const scheduled = mutationTail.then(mutation, mutation);
      mutationTail = scheduled.then(() => undefined, () => undefined);
      return scheduled;
    },

    async run<T>(
      token: AudioLibraryRequestToken,
      request: (signal: AbortSignal) => Promise<T>,
      apply: (value: T) => void | Promise<void>,
      rollback: () => void | Promise<void>,
    ): Promise<AudioLibraryRequestResult> {
      try {
        const value = await request(token.controller.signal);
        if (!isCurrent(token)) return 'stale';
        await apply(value);
        return isCurrent(token) ? 'applied' : 'stale';
      } catch {
        if (!isCurrent(token)) return 'stale';
        await rollback();
        return isCurrent(token) ? 'rolled_back' : 'stale';
      } finally {
        pending.delete(token.controller);
      }
    },

    transition(nextPrincipalId: string | null): boolean {
      if (destroyed) return false;
      const normalized = normalizePrincipalId(nextPrincipalId);
      if (normalized === activePrincipalId) return false;
      activePrincipalId = normalized;
      generation += 1;
      abortPending();
      return true;
    },
  };
}

function normalizePrincipalId(principalId: string | null | undefined): string | null {
  return String(principalId ?? '').trim() || null;
}
