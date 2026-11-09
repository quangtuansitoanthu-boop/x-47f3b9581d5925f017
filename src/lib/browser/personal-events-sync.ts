import { createBrowserId } from '$lib/browser/random-id';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import type { PersonalLunarEvent } from './personal-lunar-events';

const LEGACY_KEY = 'tutam_personal_lunar_events';
const CHANGED = 'quangtu:personal-events-changed';
export type PersonalEventsSyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict';
interface Snapshot { events: PersonalLunarEvent[]; revision: number }
interface StoredEvents {
  version: 2;
  events: PersonalLunarEvent[];
  base: PersonalLunarEvent[];
  revision: number | null;
  pending: boolean;
  remote?: Snapshot;
  recovery?: PersonalLunarEvent[];
  remoteRecovery?: Snapshot;
  status?: PersonalEventsSyncStatus;
  lastHttpError?: { status: number; code: string };
  guestTransfer?: { id: string; owner: string; events: PersonalLunarEvent[] };
  guestTransferReceipts?: string[];
}
let selectedOwner = '';
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const inFlight = new Map<string, { generation: number; promise: Promise<void> }>();
const operations = new Map<string, Promise<unknown>>();

function enqueue<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const previous = operations.get(owner);
  const operation = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(action);
  operations.set(owner, operation);
  void operation.finally(() => { if (operations.get(owner) === operation) operations.delete(owner); }).catch(() => undefined);
  return operation;
}

function ownerId(): string {
  const session = getBrowserSessionSnapshot();
  return session.authenticated && session.user?.id ? session.user.id : '';
}
function key(owner: string): string { return `${LEGACY_KEY}:v2:${owner ? `user:${encodeURIComponent(owner)}` : 'guest'}`; }
function online(): boolean { return typeof navigator === 'undefined' || navigator.onLine !== false; }
function current(owner: string, token: number): boolean { return ownerId() === owner && generation === token; }
function selectOwner(): string {
  const owner = ownerId();
  if (owner !== selectedOwner) {
    selectedOwner = owner;
    generation++;
    clearTimeout(timer);
  }
  return owner;
}
function read(owner: string): StoredEvents {
  const raw = localStorage.getItem(key(owner));
  if (raw) {
    const parsed = JSON.parse(raw) as StoredEvents;
    if (parsed.version !== 2 || !Array.isArray(parsed.events) || !Array.isArray(parsed.base)) throw new Error('Invalid personal event storage');
    return parsed;
  }
  // Keep legacy bytes intact. A login transfers the guest copy through the
  // durable import below, rather than exposing it to every account that loads.
  const legacy = !owner ? localStorage.getItem(LEGACY_KEY) : null;
  const events = legacy ? JSON.parse(legacy) : [];
  if (!Array.isArray(events)) throw new Error('Invalid legacy event storage');
  return { version: 2, events, base: [], revision: null, pending: false, status: 'local' };
}
function write(owner: string, record: StoredEvents): void {
  localStorage.setItem(key(owner), JSON.stringify(record));
}
function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED));
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const eventFingerprint = (event: PersonalLunarEvent) => JSON.stringify(Object.entries(event).sort(([a], [b]) => a.localeCompare(b)));
const sameEvent = (a: PersonalLunarEvent, b: PersonalLunarEvent) => eventFingerprint(a) === eventFingerprint(b);

function transferGuestEvents(owner: string): boolean {
  const guest = read('');
  let transfer = guest.guestTransfer;
  if (transfer && (typeof transfer.id !== 'string' || !transfer.id || typeof transfer.owner !== 'string' || !Array.isArray(transfer.events) || transfer.events.some(event => !event || typeof event.id !== 'string' || !event.id))) {
    throw new Error('Invalid guest transfer');
  }
  // Claim first: a failed write must not assign this calendar to another user.
  if (transfer && transfer.owner !== owner) return false;
  if (!transfer) {
    if (!guest.events.length) return false;
    if (guest.events.some(event => !event || typeof event.id !== 'string' || !event.id)) throw new Error('Invalid guest events');
    transfer = { id: createBrowserId(), owner, events: guest.events };
    write('', { ...guest, guestTransfer: transfer });
  }
  const account = read(owner);
  const receipts = account.guestTransferReceipts ?? [];
  if (!Array.isArray(receipts) || receipts.some(id => typeof id !== 'string')) throw new Error('Invalid guest transfer receipts');
  if (!receipts.includes(transfer.id)) {
    const events = [...account.events];
    const byId = new Map(events.map(event => [event.id, event]));
    let added = false;
    transfer.events.forEach((source, index) => {
      let event = source;
      let suffix = 0;
      while (byId.has(event.id) && !sameEvent(byId.get(event.id)!, event)) {
        event = { ...source, id: `guest_${transfer!.id}_${index}_${suffix++}` };
      }
      if (!byId.has(event.id)) { events.push(event); byId.set(event.id, event); added = true; }
    });
    // The receipt and imported records share one atomic localStorage write.
    write(owner, { ...account, events, guestTransferReceipts: [...receipts, transfer.id],
      pending: account.pending || added,
      status: account.remote ? 'conflict' : added ? 'pending' : account.status });
  }
  const latest = read('');
  // Only remove the frozen source copy. New guest edits must survive recovery.
  const transferred = new Set(transfer.events.map(eventFingerprint));
  const remaining = latest.events.filter(event => !transferred.has(eventFingerprint(event)));
  write('', { ...latest, events: remaining, base: [], revision: null, pending: remaining.length > 0,
    status: 'local', recovery: [...(latest.recovery ?? []), ...transfer.events], guestTransfer: undefined });
  return true;
}

// Store only bounded diagnostic codes, never cookies, tokens or event contents.
async function requestError(owner: string, response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const rawCode = payload?.error?.code;
  const code = typeof rawCode === 'string' && /^[a-z0-9_]{1,80}$/u.test(rawCode) ? rawCode : 'request_failed';
  const record = read(owner);
  write(owner, { ...record, lastHttpError: { status: response.status, code } });
  return new Error(`Personal event request failed (${response.status}, ${code})`);
}

export function getPersonalEventsSyncError(): { status: number; code: string } | null {
  if (typeof localStorage === 'undefined') return null;
  try { return read(selectOwner()).lastHttpError || null; } catch { return null; }
}

export function loadPersonalEventData(strict = false): PersonalLunarEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try { return read(selectOwner()).events; } catch (error) { if (strict) throw error; return []; }
}
export function getPersonalEventsSyncStatus(): PersonalEventsSyncStatus {
  if (typeof localStorage === 'undefined') return 'local';
  try { const owner = selectOwner(); return owner ? read(owner).status || 'local' : 'local'; } catch { return 'error'; }
}
export function getPersonalEventsConflict(): { local: PersonalLunarEvent[]; remote: PersonalLunarEvent[] } | null {
  if (typeof localStorage === 'undefined') return null;
  try { const record = read(selectOwner()); return record.remote ? { local: record.events, remote: record.remote.events } : null; } catch { return null; }
}
export function savePersonalEventData(events: PersonalLunarEvent[], sync = true): void {
  if (typeof localStorage === 'undefined') return;
  const owner = selectOwner();
  const record = read(owner);
  if (same(record.events, events)) return;
  write(owner, { ...record, events, ...(sync ? { pending: true, status: owner ? 'pending' : 'local' } : { base: events, pending: false, status: 'local' }) });
  announce();
  if (sync && owner && online()) schedule();
}
function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => { void syncPersonalEventData(); }, 650);
}

// Three-way merge preserves independent additions/edits/deletions. Conflicting
// edits remain durable on this device until the user explicitly chooses a copy.
function merge(base: PersonalLunarEvent[], local: PersonalLunarEvent[], remote: PersonalLunarEvent[]): PersonalLunarEvent[] | null {
  const before = new Map(base.map((event) => [event.id, event]));
  const ours = new Map(local.map((event) => [event.id, event]));
  const theirs = new Map(remote.map((event) => [event.id, event]));
  const result: PersonalLunarEvent[] = [];
  for (const id of new Set([...ours.keys(), ...theirs.keys(), ...before.keys()])) {
    const b = before.get(id), l = ours.get(id), r = theirs.get(id);
    let chosen: PersonalLunarEvent | undefined;
    if (same(l, r)) chosen = l;
    else if (same(l, b)) chosen = r;
    else if (same(r, b)) chosen = l;
    else return null;
    if (chosen) result.push(chosen);
  }
  return result;
}
function applyRemote(owner: string, snapshot: Snapshot): boolean {
  const record = read(owner);
  if (!record.pending) {
    write(owner, { ...record, events: snapshot.events, base: snapshot.events, revision: snapshot.revision, pending: false, remote: undefined, status: 'synced' });
    return true;
  }
  const merged = merge(record.base, record.events, snapshot.events);
  if (!merged) {
    write(owner, { ...record, remote: snapshot, status: 'conflict' });
    return false;
  }
  const pending = !same(merged, snapshot.events);
  write(owner, { ...record, events: merged, base: snapshot.events, revision: snapshot.revision, pending, remote: undefined, status: pending ? 'pending' : 'synced' });
  return true;
}
async function fetchRemote(owner: string, token: number): Promise<Snapshot | null> {
  const response = await fetchWithSessionRefresh('/api/personal-events', { credentials: 'include', cache: 'no-store' });
  if (!current(owner, token)) return null;
  if (!response.ok) throw await requestError(owner, response);
  const payload = await response.json();
  if (!current(owner, token)) return null;
  if (!Array.isArray(payload?.events) || payload.events.some((event: unknown) => !event || typeof event !== 'object' || typeof (event as PersonalLunarEvent).id !== 'string')) throw new Error('Invalid personal event response');
  return { events: payload.events, revision: Number.isSafeInteger(payload.revision) && payload.revision >= 0 ? payload.revision : 0 };
}
export async function pullPersonalEventData(): Promise<PersonalLunarEvent[] | null> {
  const owner = selectOwner(), token = generation;
  if (!owner || !online()) return null;
  return enqueue(owner, async () => {
    if (!current(owner, token)) return null;
    try {
      const snapshot = await fetchRemote(owner, token);
      if (!snapshot || !current(owner, token)) return null;
      applyRemote(owner, snapshot);
      announce();
      return read(owner).events;
    } catch { if (current(owner, token)) markError(owner); return null; }
  });
}
function markError(owner: string): void {
  try { const record = read(owner); write(owner, { ...record, status: record.remote ? 'conflict' : 'error' }); } catch { /* Keep existing bytes when storage is full or corrupt. */ }
  announce();
}
export async function syncPersonalEventData(events?: PersonalLunarEvent[]): Promise<void> {
  if (events) savePersonalEventData(events);
  const owner = selectOwner(), token = generation;
  if (!owner || typeof localStorage === 'undefined') return;
  try { if (transferGuestEvents(owner)) announce(); } catch { markError(owner); return; }
  if (!online()) return;
  clearTimeout(timer);
  const existing = inFlight.get(owner);
  if (existing?.generation === token) return existing.promise;
  const promise = enqueue(owner, () => current(owner, token) ? flush(owner, token) : Promise.resolve());
  inFlight.set(owner, { generation: token, promise });
  try { await promise; }
  finally {
    if (inFlight.get(owner)?.promise === promise) inFlight.delete(owner);
  }
}
async function flush(owner: string, token: number): Promise<void> {
  try {
    let record = read(owner);
    if (!record.pending || record.remote) return;
    if (record.revision === null) {
      const snapshot = await fetchRemote(owner, token);
      if (!snapshot || !current(owner, token) || !applyRemote(owner, snapshot)) { announce(); return; }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!current(owner, token) || !online()) return;
      record = read(owner);
      if (!record.pending || record.remote) return;
      const csrf = await requireBrowserCsrf();
      if (!current(owner, token)) return;
      // Session refresh is asynchronous: a new edit or conflict resolution may
      // have replaced the durable outbox while we were waiting for its token.
      record = read(owner);
      if (!record.pending || record.remote) return;
      const init: RequestInit = { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ events: record.events, revision: record.revision, ownerId: owner }) };
      write(owner, { ...record, status: 'syncing' });
      announce();
      const response = await fetchWithSessionRefresh('/api/personal-events', init);
      if (!current(owner, token)) return;
      if (response.status === 409) {
        const remote = await fetchRemote(owner, token);
        if (!remote || !current(owner, token) || !applyRemote(owner, remote)) { announce(); return; }
        continue;
      }
      if (!response.ok) throw await requestError(owner, response);
      const payload = await response.json();
      if (!current(owner, token)) return;
      if (payload.ok !== true || !Number.isSafeInteger(payload.revision)) throw new Error('Invalid sync acknowledgement');
      const latest = read(owner);
      const pending = !same(latest.events, record.events);
      write(owner, { ...latest, lastHttpError: undefined, base: record.events, revision: payload.revision, pending, status: pending ? 'pending' : 'synced' });
      announce();
      if (pending) schedule();
      return;
    }
    throw new Error('Personal event sync conflict');
  } catch { if (current(owner, token)) markError(owner); }
}
export async function resolvePersonalEventsConflict(copy: 'local' | 'server'): Promise<void> {
  const owner = selectOwner();
  if (!owner) return;
  const record = read(owner);
  if (!record.remote) return;
  const remote = record.remote;
  // Retain the pre-resolution local copy for recovery; never discard it.
  write(owner, { ...record, recovery: record.events, remoteRecovery: remote, events: copy === 'server' ? remote.events : record.events, base: remote.events, revision: remote.revision, remote: undefined, pending: copy === 'local', status: copy === 'local' ? 'pending' : 'synced' });
  announce();
  if (copy === 'local') await syncPersonalEventData();
}

export function startPersonalEventsSync(): () => void {
  let previousOwner: string | undefined;
  const transfer = (): boolean => {
    const owner = selectOwner();
    if (!owner) return true;
    try { transferGuestEvents(owner); return true; }
    catch { markError(owner); return false; }
  };
  const onSession = () => {
    const owner = selectOwner();
    if (owner === previousOwner) return;
    previousOwner = owner;
    if (!transfer()) return;
    announce();
    void pullPersonalEventData().then(() => syncPersonalEventData());
  };
  const onOnline = () => { if (transfer()) { announce(); void pullPersonalEventData().then(() => syncPersonalEventData()); } };
  window.addEventListener(SESSION_CHANGE_EVENT, onSession);
  window.addEventListener('online', onOnline);
  onSession();
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, onSession);
    window.removeEventListener('online', onOnline);
    clearTimeout(timer);
    generation++;
  };
}
