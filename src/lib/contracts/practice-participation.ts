export const PARTICIPATION_MODULES = ['five', 'ten', 'eight', 'sutra', 'mantra', 'ritual', 'meditation', 'rosary', 'bowing', 'sutra-copy', 'name-copy', 'talk', 'purity', 'reflection', 'routine'] as const;
export type ParticipationModule = typeof PARTICIPATION_MODULES[number];
export const CLIENT_PARTICIPATION_MODULES: readonly ParticipationModule[] = ['five', 'ten', 'eight', 'purity', 'reflection', 'routine'];
export const PARTICIPATION_EVENTS = ['started', 'recorded', 'completed'] as const;
export type ParticipationEvent = typeof PARTICIPATION_EVENTS[number];
export interface ParticipationItem { module: ParticipationModule; event: ParticipationEvent; at: string }
export interface ParticipationRow extends ParticipationItem {
  ownerId: string; name: string; email: string | null; syncedAt: string;
}
export interface ParticipationPage { rows: ParticipationRow[]; next: string | null }
export function isParticipationModule(value: unknown): value is ParticipationModule {
  return typeof value === 'string' && PARTICIPATION_MODULES.includes(value as ParticipationModule);
}
