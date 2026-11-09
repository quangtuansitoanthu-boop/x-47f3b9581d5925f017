export interface ActivePracticeSettlement {
  cleanupResources: () => void;
  closeGuidedMeditation: () => void;
  finishBowing?: () => void;
  finishRosaryEvidence: () => void;
  finishScriptureEvidence: () => void;
  onError?: (cause: unknown, step: PracticeSettlementStep) => void;
  saveReaderPosition: () => void;
  stopModelChant: () => void;
}

export type PracticeSettlementStep = Exclude<keyof ActivePracticeSettlement, 'onError'>;

export function settleActivePracticeProducers(settlement: ActivePracticeSettlement): void {
  const steps: PracticeSettlementStep[] = [
    'saveReaderPosition',
    'finishScriptureEvidence',
    'stopModelChant',
    'closeGuidedMeditation',
    'finishBowing',
    'finishRosaryEvidence',
    'cleanupResources',
  ];
  for (const step of steps) {
    try {
      settlement[step]?.();
    } catch (cause) {
      try {
        settlement.onError?.(cause, step);
      } catch {
        // Principal changes must finish even if optional user feedback fails.
      }
    }
  }
}

export async function runPracticePrincipalPull<T>(input: {
  apply: (value: T) => void;
  isCurrent: () => boolean;
  pull: () => Promise<T | null | undefined>;
}): Promise<boolean> {
  const value = await input.pull();
  if (value === null || value === undefined || !input.isCurrent()) return false;
  input.apply(value);
  return input.isCurrent();
}

export function practiceContentIdentity(session: {
  authenticated: boolean;
  user: null | { id: string; role?: unknown };
}): string {
  const principalId = session.authenticated && session.user?.id ? session.user.id : 'anonymous';
  const role = session.user?.role === 'admin' || session.user?.role === 'ctv' || session.user?.role === 'user'
    ? session.user.role
    : 'guest';
  return `${encodeURIComponent(principalId)}:${role}`;
}

export function advancePracticeContentGeneration(
  currentGeneration: number,
  previousSession: Parameters<typeof practiceContentIdentity>[0],
  nextSession: Parameters<typeof practiceContentIdentity>[0],
): number {
  return practiceContentIdentity(previousSession) === practiceContentIdentity(nextSession)
    ? currentGeneration
    : currentGeneration + 1;
}

export function publishCurrentPracticeContent(
  isCurrent: () => boolean,
  publish: () => void,
): boolean {
  if (!isCurrent()) return false;
  publish();
  return isCurrent();
}
