export const PERSONAL_SYNC_INTERVAL_MS = 48 * 60 * 60 * 1000;

export interface PersonalSyncState {
  revision: number;
  acknowledgedRevision: number;
  current: string;
  acknowledged: string;
  firstDirtyAt: number | null;
  lastSuccessAt: number | null;
  retryAfter: number | null;
  failures: number;
}

export interface PersonalSyncTicket {
  principal: string;
  revision: number;
  payload: string;
}

export function initialPersonalSyncState(acknowledged = ''): PersonalSyncState {
  return { revision: 0, acknowledgedRevision: 0, current: acknowledged, acknowledged, firstDirtyAt: null, lastSuccessAt: null, retryAfter: null, failures: 0 };
}

export function changePersonalSyncState(state: PersonalSyncState, payload: string, now: number): PersonalSyncState {
  if (payload === state.current) return state;
  return { ...state, revision: state.revision + 1, current: payload,
    firstDirtyAt: payload === state.acknowledged ? null : state.firstDirtyAt ?? now };
}

export function personalSyncTicket(state: PersonalSyncState, principal: string | null, now: number): PersonalSyncTicket | null {
  if (!principal?.trim() || principal === 'anonymous' || state.current === state.acknowledged || state.firstDirtyAt === null) return null;
  if (now < (state.lastSuccessAt ?? state.firstDirtyAt) + PERSONAL_SYNC_INTERVAL_MS || now < (state.retryAfter ?? 0)) return null;
  return { principal, revision: state.revision, payload: state.current };
}

/** ACK applies only to the captured payload: edits made during a request remain dirty. */
export function acknowledgePersonalSync(state: PersonalSyncState, ticket: PersonalSyncTicket, currentPrincipal: string | null, now: number): PersonalSyncState {
  if (ticket.principal !== currentPrincipal || ticket.revision > state.revision || ticket.revision <= state.acknowledgedRevision) return state;
  return { ...state, acknowledgedRevision: ticket.revision, acknowledged: ticket.payload, lastSuccessAt: now,
    firstDirtyAt: state.current === ticket.payload ? null : state.firstDirtyAt ?? now, retryAfter: null, failures: 0 };
}

export function failPersonalSync(state: PersonalSyncState, ticket: PersonalSyncTicket, currentPrincipal: string | null, now: number): PersonalSyncState {
  if (ticket.principal !== currentPrincipal || ticket.revision <= state.acknowledgedRevision) return state;
  const failures = Math.min(state.failures + 1, 10);
  return { ...state, failures, retryAfter: now + Math.min(60 * 60 * 1000, 30_000 * 2 ** (failures - 1)) };
}
