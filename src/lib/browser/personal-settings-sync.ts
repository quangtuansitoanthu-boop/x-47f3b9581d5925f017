import { createPrincipalStorage } from './principal-storage';
import type { StorageLike } from './storage-contract';
import { EMPTY_PERSONAL_SETTINGS, normalizePersonalSettings, type PersonalSettingsResponse, type PersonalSettingsSnapshot } from '$lib/domain/practice/personal-settings';
import { acknowledgePersonalSync, changePersonalSyncState, failPersonalSync, initialPersonalSyncState, personalSyncTicket, type PersonalSyncState, type PersonalSyncTicket } from '$lib/domain/practice/personal-sync-policy';

const KEY = 'tt_personal_settings_sync_v1';
export type PersonalSettingsSyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
interface SavedSync { policy: PersonalSyncState; remoteRevision: number; conflict: boolean; remote: PersonalSettingsResponse | null; attempt?: { ticket: PersonalSyncTicket; revision: number } | null }
export interface PersonalSettingsSyncSession { authenticated: boolean; user: { id: string } | null; csrfToken?: string | null }
export interface PersonalSettingsTransport {
  read(signal: AbortSignal): Promise<Response>;
  write(input: { snapshot: PersonalSettingsSnapshot; revision: number }, csrf: string, signal: AbortSignal): Promise<Response>;
}

/** Invoked by existing session/app lifecycle owners. No timers or automatic GET. */
export function createPersonalSettingsSync(options: {
  storage: StorageLike;
  getSession: () => PersonalSettingsSyncSession;
  transport: PersonalSettingsTransport;
  now?: () => number;
  onStatus?: (status: PersonalSettingsSyncStatus) => void;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let disposed = false;
  let principal = owner();
  let inFlight: AbortController | null = null;
  function owner() { const session = options.getSession(); return session.authenticated ? session.user?.id ?? null : null; }
  function scoped(id: string | null) { return createPrincipalStorage(options.storage, id); }
  function read(id: string | null): SavedSync {
    const raw = scoped(id).getItem(KEY);
    if (!raw) return { policy: initialPersonalSyncState(JSON.stringify(EMPTY_PERSONAL_SETTINGS)), remoteRevision: 0, conflict: false, remote: null };
    let data: SavedSync;
    try { data = JSON.parse(raw); } catch { throw new Error('personal_settings_sync_invalid_storage'); }
    const p = data?.policy;
    if (!p || !Number.isSafeInteger(p.revision) || p.revision < 0 || !Number.isSafeInteger(p.acknowledgedRevision)
      || p.acknowledgedRevision < 0 || p.acknowledgedRevision > p.revision || typeof p.current !== 'string' || typeof p.acknowledged !== 'string'
      || !Number.isSafeInteger(data.remoteRevision) || data.remoteRevision < 0 || typeof data.conflict !== 'boolean'
      || !Number.isInteger(p.failures) || p.failures < 0 || p.failures > 10
      || [p.firstDirtyAt, p.lastSuccessAt, p.retryAfter].some(value => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error('personal_settings_sync_invalid_storage');
    normalizePersonalSettings(JSON.parse(p.current)); normalizePersonalSettings(JSON.parse(p.acknowledged));
    if (data.attempt) {
      const { ticket, revision } = data.attempt;
      if (!ticket || ticket.principal !== id || !Number.isSafeInteger(ticket.revision) || ticket.revision < 1 || ticket.revision > p.revision
        || !Number.isSafeInteger(revision) || revision < 0 || typeof ticket.payload !== 'string') throw new Error('personal_settings_sync_invalid_storage');
      normalizePersonalSettings(JSON.parse(ticket.payload));
    }
    return data;
  }
  function save(id: string | null, state: SavedSync) { scoped(id).setItem(KEY, JSON.stringify(state)); }
  function status(value: PersonalSettingsSyncStatus) { options.onStatus?.(value); }
  function sessionChanged() {
    const next = owner();
    if (next !== principal) { principal = next; generation++; inFlight?.abort(); inFlight = null; }
  }
  function current(id: string | null, epoch: number) { return !disposed && owner() === id && generation === epoch; }
  async function decode(response: Response): Promise<PersonalSettingsResponse> {
    const body = await response.json();
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0
      || (body.updatedAt !== null && (typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))))) throw new Error('personal_settings_invalid_response');
    return { snapshot: normalizePersonalSettings(body.snapshot), revision: body.revision, updatedAt: body.updatedAt };
  }
  return {
    sessionChanged,
    changed(snapshot: PersonalSettingsSnapshot) {
      if (disposed) return;
      sessionChanged();
      const state = read(principal);
      state.policy = changePersonalSyncState(state.policy, JSON.stringify(normalizePersonalSettings(snapshot)), now());
      save(principal, state);
      status(state.conflict ? 'conflict' : state.policy.current === state.policy.acknowledged && !state.attempt ? 'synced' : principal ? 'pending' : 'local');
    },
    async active(): Promise<void> {
      if (disposed) return;
      sessionChanged();
      if (inFlight) return;
      const id = principal; const epoch = generation; const session = options.getSession();
      let controller: AbortController | null = null;
      try {
        const state = read(id);
        if (state.conflict || !session.csrfToken) return;
        if (now() < (state.policy.retryAfter ?? 0)) return;
        const ticket = state.attempt?.ticket ?? personalSyncTicket(state.policy, id, now());
        if (!ticket) return;
        // Preserve the exact attempt before I/O: a lost receipt may conceal a commit,
        // even when the user has since reverted local content to the old baseline.
        if (!state.attempt) { state.attempt = { ticket, revision: state.remoteRevision }; save(id, state); }
        controller = new AbortController(); inFlight = controller; status('syncing');
        const response = await options.transport.write({ snapshot: normalizePersonalSettings(JSON.parse(ticket.payload)), revision: state.attempt.revision }, session.csrfToken, controller.signal);
        if (!current(id, epoch)) return;
        const latest = read(id);
        if (response.status === 409) { latest.conflict = true; save(id, latest); status('conflict'); return; }
        if (!response.ok) throw new Error('personal_settings_sync_failed');
        const receipt = await decode(response);
        if (!current(id, epoch)) return;
        if (JSON.stringify(receipt.snapshot) !== ticket.payload) throw new Error('personal_settings_receipt_mismatch');
        const updated = read(id);
        updated.policy = acknowledgePersonalSync(updated.policy, ticket, owner(), now());
        updated.remoteRevision = receipt.revision; updated.remote = null; updated.attempt = null;
        save(id, updated); status(updated.policy.current === updated.policy.acknowledged ? 'synced' : 'pending');
      } catch {
        if (!current(id, epoch)) return;
        // Failure never changes the successful-upload timestamp or local content.
        try {
          const latest = read(id); const ticket = latest.attempt?.ticket ?? personalSyncTicket(latest.policy, id, now());
          if (ticket) { latest.policy = failPersonalSync(latest.policy, ticket, id, now()); save(id, latest); }
        } catch { /* Keep the original corrupt/quota-limited storage untouched. */ }
        status('error');
      } finally { if (inFlight === controller) inFlight = null; }
    },
    async restore(): Promise<PersonalSettingsResponse> {
      if (disposed) throw new Error('personal_settings_sync_disposed');
      sessionChanged();
      const id = principal; const epoch = generation;
      if (!id) throw new Error('authentication_required');
      if (inFlight) throw new Error('personal_settings_sync_busy');
      const controller = new AbortController(); inFlight = controller;
      try {
        const response = await options.transport.read(controller.signal);
        if (!response.ok) throw new Error('personal_settings_restore_failed');
        const remote = await decode(response);
        if (!current(id, epoch)) throw new Error('personal_settings_principal_changed');
        const latest = read(id); latest.remote = remote; latest.conflict = true;
        save(id, latest); status('conflict');
        return remote;
      } finally { if (inFlight === controller) inFlight = null; }
    },
    reconcile(snapshot: PersonalSettingsSnapshot) {
      if (disposed) return;
      sessionChanged();
      const state = read(principal);
      if (!state.remote) throw new Error('personal_settings_restore_required');
      const baseline = JSON.stringify(normalizePersonalSettings(state.remote.snapshot));
      const policy = initialPersonalSyncState(baseline);
      policy.lastSuccessAt = state.policy.lastSuccessAt;
      state.policy = changePersonalSyncState(policy, JSON.stringify(normalizePersonalSettings(snapshot)), now());
      state.remoteRevision = state.remote.revision; state.conflict = false; state.remote = null; state.attempt = null;
      save(principal, state); status(state.policy.current === state.policy.acknowledged ? 'synced' : 'pending');
    },
    dispose() { disposed = true; generation++; inFlight?.abort(); inFlight = null; },
  };
}
