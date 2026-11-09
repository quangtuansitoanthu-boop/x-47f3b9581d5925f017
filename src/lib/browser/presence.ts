import type { PageSessionDTO } from '$lib/server/auth/types';
import type { CommunityAuthor } from '$lib/contracts/community-moderation';

export interface PracticePresenceProjection {
  activity: 'meditation' | 'rosary' | 'scripture' | 'model_chant' | 'dharma_talk';
  startedAt: number;
  visible: boolean;
}
export interface PresenceSnapshot {
  enabled: boolean;
  activeCount: number;
  practicingCount?: number;
  practitioners?: Array<CommunityAuthor & { activity: string; displayName: string; startedAt: number | null }>;
}
export type PresenceListener = (snapshot: PresenceSnapshot | null) => void;
/** Presence and pageview collection have been removed on every platform.
 * Keep the public contract for existing practice callers without touching their logging.
 */
export const PRESENCE_ENABLED = false;
export function setPracticePresence(_projection: PracticePresenceProjection | null): void {}
export function notifyPresenceNavigation(_path: string): void {}
export function startPresence(
  listener: PresenceListener,
  _initialSession: Pick<PageSessionDTO, 'authenticated' | 'csrfToken' | 'user'> | string = 'public',
): () => void {
  listener(null);
  return () => {};
}
export function listenPresence(listener: PresenceListener): () => void {
  listener(null);
  return () => {};
}
