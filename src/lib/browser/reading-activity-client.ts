import { createBrowserId } from './random-id';
import type {
  ReadingAnnotationPatch,
  ReadingAnnotationWrite,
  ReadingProgressDelete,
  ReadingProgressWrite,
} from '$lib/domain/reading/activity';
import { fetchNativeJsonMutation } from './native-api';
import {
  ANONYMOUS_STORAGE_PRINCIPAL,
  copyLegacyKeysToAnonymousNamespace,
  createPrincipalStorage,
} from './principal-storage';
import {
  applyBookmarkSyncSnapshot,
  LEGACY_LOCAL_STORAGE_KEYS,
  type StorageLike,
  type SyncDeletion,
} from './storage-contract';

export const READING_ACTIVITY_OUTBOX_KEY = 'quangtu_reading_activity_outbox_v1';
export const READING_ACTIVITY_DEVICE_KEY = 'quangtu_reading_device_v1';
export const READING_ACTIVITY_SEQUENCE_KEY = 'quangtu_reading_sequence_v1';
export const READING_PROGRESS_CACHE_KEY = 'quangtu_reading_progress_v1';
export const READING_ANNOTATIONS_CACHE_KEY = 'quangtu_reading_annotations_v1';
export const READING_ANONYMOUS_ADOPTION_DECISION_KEY = 'quangtu_reading_anonymous_adoption_v1';
export const READING_ACTIVITY_OUTBOX_CAPACITY_ERROR = 'reading_activity_outbox_capacity_exceeded';
const MAX_READING_ACTIVITY_OUTBOX_OPERATIONS = 1_000;
const READING_MUTATION_VERSION_KEY = 'quangtu_reading_mutation_version_v1';

const READING_PRINCIPAL_KEYS = [
  READING_ACTIVITY_OUTBOX_KEY,
  READING_ACTIVITY_DEVICE_KEY,
  READING_ACTIVITY_SEQUENCE_KEY,
  READING_PROGRESS_CACHE_KEY,
  READING_ANNOTATIONS_CACHE_KEY,
  LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
  LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks,
] as const;

export interface ReadingProgressRecord {
  contentKind: ReadingProgressWrite['contentKind'];
  contentId: string;
  revision: number;
  epoch: number;
  deviceId: string;
  deviceSequence: number;
  position: ReadingProgressWrite['position'];
  total: number | null;
  percent: number;
  contentVersion: string | null;
  clientUpdatedAt: string | null;
  serverUpdatedAt: string | null;
}

export interface ReadingProgressTombstone {
  contentKind: ReadingProgressWrite['contentKind'];
  contentId: string;
  revision: number;
  epoch: number;
  serverUpdatedAt: string;
  deletedAt: string;
}

export interface ReadingAnnotationRecord extends Omit<ReadingAnnotationWrite, 'idempotencyKey'> {
  createdAt: string;
  updatedAt: string;
}

export interface ReadingAnnotationTombstone {
  id: string;
  updatedAt: string;
  deletedAt: string;
}

type ReadingCommand =
  | { id: string; kind: 'progress'; payload: ReadingProgressWrite; queuedAt: string }
  | { id: string; kind: 'progress-delete'; payload: ReadingProgressDelete; queuedAt: string }
  | { id: string; kind: 'annotation-create'; annotationId: string; payload: ReadingAnnotationWrite; queuedAt: string }
  | { id: string; kind: 'annotation-update'; annotationId: string; payload: ReadingAnnotationPatch; queuedAt: string }
  | { id: string; kind: 'annotation-delete'; annotationId: string; payload: null; queuedAt: string };

type ReadingOperation = ReadingCommand & {
  dispatched?: boolean;
  // Persist the exact possibly committed write before a newer intent replaces it.
  predecessor?: ReadingCommand;
};

export interface ReadingActivitySession {
  authenticated: boolean;
  csrfToken: string | null;
  user: null | { id: string };
}

export interface ReadingProgressDraft extends Omit<
  ReadingProgressWrite,
  'baseRevision' | 'deviceId' | 'deviceSequence'
> {
  baseRevision?: number;
}

export function createReadingActivityClient(
  fetcher: typeof fetch,
  storage: StorageLike = window.localStorage,
  dependencies: { createId?: () => string; now?: () => Date } = {},
) {
  const createId = dependencies.createId ?? (() => createBrowserId());
  const now = dependencies.now ?? (() => new Date());
  copyLegacyKeysToAnonymousNamespace(storage, [
    LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
    LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks,
  ]);
  let session: ReadingActivitySession = { authenticated: false, csrfToken: null, user: null };
  let generation = 0;
  let inFlight: AbortController | null = null;
  let activeDrain: { generation: number; done: Promise<void> } | null = null;
  let adoptionInFlight: AbortController | null = null;
  let preparedAdoption: {
    annotationTombstoneIds: Set<string>;
    bookmarkKeys: Set<string>;
    generation: number;
    progressTombstones: Map<string, ReadingProgressTombstone>;
    userId: string;
  } | null = null;
  const progressTombstones = new Map<string, ReadingProgressTombstone>();

  const principalId = () => session.authenticated && session.user?.id
    ? session.user.id
    : ANONYMOUS_STORAGE_PRINCIPAL;
  const scopedStorage = (principal = principalId()) => createPrincipalStorage(storage, principal);
  const mutationVersion = (principal = principalId()) => scopedStorage(principal).getItem(READING_MUTATION_VERSION_KEY);
  const progressTombstoneKey = (
    contentKind: ReadingProgressWrite['contentKind'],
    contentId: string,
    principal = principalId(),
  ) => `${principal}\u0000${contentKind}\u0000${contentId}`;

  const readRecords = <T>(key: string, principal = principalId()): T[] => {
    try {
      const parsed = JSON.parse(scopedStorage(principal).getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  };
  const writeRecords = <T>(key: string, records: T[], principal = principalId()) => {
    scopedStorage(principal).setItem(key, JSON.stringify(records));
  };
  const readObject = (key: string, principal = principalId()): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(scopedStorage(principal).getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const upsertProgress = (record: ReadingProgressRecord, principal = principalId()) => {
    const rows = readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, principal)
      .filter((row) => !(row.contentKind === record.contentKind && row.contentId === record.contentId));
    rows.push(record);
    writeRecords(READING_PROGRESS_CACHE_KEY, rows, principal);
    progressTombstones.delete(progressTombstoneKey(record.contentKind, record.contentId, principal));
  };
  const removeProgress = (contentKind: ReadingProgressWrite['contentKind'], contentId: string, principal = principalId()) => {
    writeRecords(READING_PROGRESS_CACHE_KEY,
      readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, principal)
        .filter((row) => !(row.contentKind === contentKind && row.contentId === contentId)), principal);
  };
  const rememberProgressTombstone = (value: unknown, principal = principalId()) => {
    if (!isProgressTombstone(value)) return null;
    progressTombstones.set(progressTombstoneKey(value.contentKind, value.contentId, principal), value);
    return value;
  };
  const upsertAnnotation = (record: ReadingAnnotationRecord, principal = principalId()) => {
    const rows = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, principal)
      .filter((row) => row.id !== record.id);
    rows.push(record);
    writeRecords(READING_ANNOTATIONS_CACHE_KEY, rows, principal);
  };
  const removeAnnotation = (annotationId: string, principal = principalId()) => {
    writeRecords(READING_ANNOTATIONS_CACHE_KEY,
      readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, principal)
        .filter((row) => row.id !== annotationId), principal);
  };

  const read = (principal = principalId()): ReadingOperation[] => {
    try {
      const parsed = JSON.parse(scopedStorage(principal).getItem(READING_ACTIVITY_OUTBOX_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(isReadingOperation) : [];
    } catch {
      return [];
    }
  };
  const write = (operations: ReadingOperation[], principal = principalId()) => {
    if (operations.length > MAX_READING_ACTIVITY_OUTBOX_OPERATIONS) {
      throw new Error(READING_ACTIVITY_OUTBOX_CAPACITY_ERROR);
    }
    // Shared across client instances/tabs, including after an acknowledged delete
    // removes the last outbox entry. In-flight reads must not overwrite newer intent.
    scopedStorage(principal).setItem(READING_MUTATION_VERSION_KEY, createBrowserId());
    scopedStorage(principal).setItem(READING_ACTIVITY_OUTBOX_KEY, JSON.stringify(operations));
  };
  const enqueue = (operation: ReadingOperation) => {
    const pending = read();
    const previous = pending.find((item) => item.id === operation.id);
    if (previous?.predecessor) operation.predecessor = previous.predecessor;
    else if (previous?.dispatched) {
      const { dispatched: _dispatched, predecessor: _predecessor, ...command } = previous;
      operation.predecessor = command;
    }
    const operations = pending.filter((item) => item.id !== operation.id);
    operations.push(operation);
    write(operations);
    return operation;
  };
  const nextSequence = () => {
    const scoped = scopedStorage();
    const current = Number(scoped.getItem(READING_ACTIVITY_SEQUENCE_KEY) || 0);
    const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    scoped.setItem(READING_ACTIVITY_SEQUENCE_KEY, String(next));
    return next;
  };
  const deviceId = () => {
    const scoped = scopedStorage();
    const current = scoped.getItem(READING_ACTIVITY_DEVICE_KEY);
    if (current && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(current)) return current;
    const created = `browser:${createId()}`;
    scoped.setItem(READING_ACTIVITY_DEVICE_KEY, created);
    return created;
  };

  type OperationResponse = { annotation?: unknown; progress?: unknown; tombstone?: unknown };
  const acknowledge = (operation: ReadingCommand, body: OperationResponse | null, principal: string) => {
    const pending = read(principal);
    const index = pending.findIndex((item) => item.id === operation.id);
    const current = pending[index];
    if (!current) return;
    if (current.predecessor && sameOperation(current.predecessor, operation)) {
      delete current.predecessor;
      if (current.kind === 'progress' || current.kind === 'progress-delete') {
        const state = isProgressRecord(body?.progress) ? body.progress
          : isProgressTombstone(body?.tombstone) ? body.tombstone : null;
        if (state) {
          current.payload.baseRevision = state.revision;
          current.payload.epoch = Math.max(current.payload.epoch,
            state.epoch + (current.kind === 'progress' && isProgressTombstone(state) ? 1 : 0));
        }
      }
      if (current.kind === 'annotation-update' && isAnnotationRecord(body?.annotation)) {
        current.payload.baseUpdatedAt = body.annotation.updatedAt;
      }
      write(pending, principal);
      return;
    }
    // Another tab may already have acknowledged this operation and its delete.
    // An absent or superseded operation must never repopulate a private cache.
    if (!sameOperation(current, operation)) return;
    write(pending.filter((_, itemIndex) => itemIndex !== index), principal);
    if (isProgressRecord(body?.progress)) upsertProgress(body.progress, principal);
    if (isAnnotationRecord(body?.annotation)) upsertAnnotation(body.annotation, principal);
    if (operation.kind === 'progress-delete') {
      rememberProgressTombstone(body?.tombstone, principal);
      removeProgress(operation.payload.contentKind, operation.payload.contentId, principal);
    }
    if (operation.kind === 'annotation-delete') removeAnnotation(operation.annotationId, principal);
  };

  return {
    adoptAnonymousQueue(userId: string): number {
      const anonymousStorage = scopedStorage(ANONYMOUS_STORAGE_PRINCIPAL);
      const accountStorage = scopedStorage(userId);
      const adoptedKeyCount = READING_PRINCIPAL_KEYS.filter((key) => anonymousStorage.getItem(key) !== null).length;
      const accountOperations = read(userId);
      const prepared = preparedAdoption?.userId === userId
        && preparedAdoption.generation === generation
        ? preparedAdoption
        : null;
      const accountProgressKeys = new Set([
        ...readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, userId)
          .map((record) => progressIdentityKey(record.contentKind, record.contentId)),
        ...accountOperations
          .filter((operation) => operation.kind === 'progress' || operation.kind === 'progress-delete')
          .map((operation) => progressIdentityKey(operation.payload.contentKind, operation.payload.contentId)),
        ...(prepared ? prepared.progressTombstones.keys() : []),
      ]);
      const accountAnnotationIds = new Set([
        ...readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, userId)
          .map((record) => record.id),
        ...accountOperations
          .filter((operation) => 'annotationId' in operation)
          .map((operation) => operation.annotationId),
        ...(prepared?.annotationTombstoneIds ?? []),
      ]);
      const adoptableOperations = read(ANONYMOUS_STORAGE_PRINCIPAL).filter((operation) => {
        if (operation.kind === 'progress' || operation.kind === 'progress-delete') {
          return !accountProgressKeys.has(progressIdentityKey(operation.payload.contentKind, operation.payload.contentId));
        }
        return !accountAnnotationIds.has(operation.annotationId);
      });

      write(
        mergeByKey(adoptableOperations, read(userId), (operation) => operation.id),
        userId,
      );
      writeRecords(
        READING_PROGRESS_CACHE_KEY,
        mergeByKey(
          readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, ANONYMOUS_STORAGE_PRINCIPAL)
            .filter((record) => !accountProgressKeys.has(progressIdentityKey(record.contentKind, record.contentId))),
          readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, userId),
          (record) => progressIdentityKey(record.contentKind, record.contentId),
        ),
        userId,
      );
      writeRecords(
        READING_ANNOTATIONS_CACHE_KEY,
        mergeByKey(
          readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, ANONYMOUS_STORAGE_PRINCIPAL)
            .filter((record) => !accountAnnotationIds.has(record.id)),
          readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, userId),
          (record) => record.id,
        ),
        userId,
      );
      writeRecords(
        LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
        mergeByKey(
          readRecords<unknown>(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, ANONYMOUS_STORAGE_PRINCIPAL)
            .filter((bookmark) => !(
              prepared?.bookmarkKeys.has(readingBookmarkMergeKey(bookmark))
            )),
          readRecords<unknown>(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, userId),
          readingBookmarkMergeKey,
        ),
        userId,
      );
      accountStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks, JSON.stringify({
        ...readObject(LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks, ANONYMOUS_STORAGE_PRINCIPAL),
        ...readObject(LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks, userId),
      }));

      if (accountStorage.getItem(READING_ACTIVITY_DEVICE_KEY) === null) {
        const anonymousDevice = anonymousStorage.getItem(READING_ACTIVITY_DEVICE_KEY);
        if (anonymousDevice !== null) accountStorage.setItem(READING_ACTIVITY_DEVICE_KEY, anonymousDevice);
      }
      const anonymousSequence = Number(anonymousStorage.getItem(READING_ACTIVITY_SEQUENCE_KEY) || 0);
      const accountSequence = Number(accountStorage.getItem(READING_ACTIVITY_SEQUENCE_KEY) || 0);
      const mergedSequence = Math.max(
        Number.isSafeInteger(anonymousSequence) ? anonymousSequence : 0,
        Number.isSafeInteger(accountSequence) ? accountSequence : 0,
      );
      if (mergedSequence > 0) accountStorage.setItem(READING_ACTIVITY_SEQUENCE_KEY, String(mergedSequence));

      for (const key of READING_PRINCIPAL_KEYS) anonymousStorage.removeItem?.(key);
      accountStorage.setItem(READING_ANONYMOUS_ADOPTION_DECISION_KEY, 'adopted');
      preparedAdoption = null;
      return adoptedKeyCount;
    },

    async prepareAnonymousAdoption(userId: string): Promise<void> {
      if (!session.authenticated || session.user?.id !== userId) {
        throw new Error('reading_adoption_session_changed');
      }
      const capturedGeneration = generation;
      preparedAdoption = null;
      const preparedBookmarkKeys = new Set<string>();
      const preparedProgressTombstones = new Map<string, ReadingProgressTombstone>();
      const preparedAnnotationTombstoneIds = new Set<string>();
      const anonymousOperations = read(ANONYMOUS_STORAGE_PRINCIPAL);
      const progressIdentities = new Map<string, {
        contentKind: ReadingProgressWrite['contentKind'];
        contentId: string;
      }>();
      for (const record of readRecords<ReadingProgressRecord>(
        READING_PROGRESS_CACHE_KEY,
        ANONYMOUS_STORAGE_PRINCIPAL,
      )) {
        progressIdentities.set(`${record.contentKind}\u0000${record.contentId}`, record);
      }
      for (const operation of anonymousOperations) {
        if (operation.kind === 'progress' || operation.kind === 'progress-delete') {
          progressIdentities.set(`${operation.payload.contentKind}\u0000${operation.payload.contentId}`, operation.payload);
        }
      }
      const annotationIds = new Set([
        ...readRecords<ReadingAnnotationRecord>(
          READING_ANNOTATIONS_CACHE_KEY,
          ANONYMOUS_STORAGE_PRINCIPAL,
        ).map((record) => record.id),
        ...anonymousOperations
          .filter((operation) => 'annotationId' in operation)
          .map((operation) => operation.annotationId),
      ]);
      const accountOperations = read(userId);
      const pendingProgressKeys = new Set(accountOperations
        .filter((operation) => operation.kind === 'progress' || operation.kind === 'progress-delete')
        .map((operation) => `${operation.payload.contentKind}\u0000${operation.payload.contentId}`));
      const pendingAnnotationIds = new Set(accountOperations
        .filter((operation) => 'annotationId' in operation)
        .map((operation) => operation.annotationId));
      const controller = new AbortController();
      adoptionInFlight?.abort();
      adoptionInFlight = controller;
      const assertCurrentPrincipal = () => {
        if (generation !== capturedGeneration || principalId() !== userId) {
          throw new Error('reading_adoption_session_changed');
        }
      };
      const tasks: Array<() => Promise<void>> = [];
      if (readRecords<unknown>(
        LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
        ANONYMOUS_STORAGE_PRINCIPAL,
      ).length > 0) {
        tasks.push(async () => {
          const response = await fetcher('/api/sync', {
            headers: { accept: 'application/json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`reading_account_sync_${response.status}`);
          const payload = await response.json() as Record<string, unknown>;
          assertCurrentPrincipal();
          const tombstones = payload.sync_tombstones as Record<string, unknown> | undefined;
          const bookmarkDeletions = normalizeBookmarkDeletions(tombstones?.bookmarks);
          const hydrated = applyBookmarkSyncSnapshot(
            scopedStorage(userId),
            Array.isArray(payload.bookmarks) ? payload.bookmarks : [],
            bookmarkDeletions,
          );
          for (const key of [
            ...hydrated.map(readingBookmarkMergeKey),
            ...bookmarkDeletions.map((entry) => bookmarkMergeKeyFromSyncDeletion(entry.key)),
          ]) preparedBookmarkKeys.add(key);
        });
      }
      for (const [key, identity] of progressIdentities) {
        if (pendingProgressKeys.has(key)) continue;
        tasks.push(async () => {
          const response = await fetcher(
            `/api/reading/progress/${encodeURIComponent(identity.contentKind)}/${encodeURIComponent(identity.contentId)}`,
            { headers: { accept: 'application/json' }, signal: controller.signal },
          );
          if (!response.ok && response.status !== 404) throw new Error(`reading_progress_${response.status}`);
          const payload = response.status === 404
            ? null
            : await response.json() as { progress?: unknown; tombstone?: unknown };
          assertCurrentPrincipal();
          const remote = payload && isProgressRecord(payload.progress) ? payload.progress : null;
          if (remote) {
            upsertProgress(remote, userId);
            return;
          }
          removeProgress(identity.contentKind, identity.contentId, userId);
          const tombstone = payload && isProgressTombstone(payload.tombstone)
            && payload.tombstone.contentKind === identity.contentKind
            && payload.tombstone.contentId === identity.contentId
            ? payload.tombstone
            : null;
          if (tombstone) {
            rememberProgressTombstone(tombstone, userId);
            preparedProgressTombstones.set(key, tombstone);
          }
        });
      }
      for (const annotationId of annotationIds) {
        if (pendingAnnotationIds.has(annotationId)) continue;
        tasks.push(async () => {
          const response = await fetcher(`/api/reading/annotations/${encodeURIComponent(annotationId)}`, {
            headers: { accept: 'application/json' }, signal: controller.signal,
          });
          if (!response.ok && response.status !== 404) throw new Error(`reading_annotation_${response.status}`);
          const payload = response.status === 404
            ? null
            : await response.json() as { annotation?: unknown; tombstone?: unknown };
          assertCurrentPrincipal();
          const remote = payload && isAnnotationRecord(payload.annotation) ? payload.annotation : null;
          if (remote) upsertAnnotation(remote, userId);
          else {
            removeAnnotation(annotationId, userId);
            if (payload && isAnnotationTombstone(payload.tombstone)
              && payload.tombstone.id === annotationId) {
              preparedAnnotationTombstoneIds.add(annotationId);
            }
          }
        });
      }
      try {
        for (let index = 0; index < tasks.length; index += 8) {
          await Promise.all(tasks.slice(index, index + 8).map((task) => task()));
          assertCurrentPrincipal();
        }
        preparedAdoption = {
          annotationTombstoneIds: preparedAnnotationTombstoneIds,
          bookmarkKeys: preparedBookmarkKeys,
          generation: capturedGeneration,
          progressTombstones: preparedProgressTombstones,
          userId,
        };
      } finally {
        if (adoptionInFlight === controller) adoptionInFlight = null;
      }
    },

    keepAnonymousQueueSeparate(userId: string): void {
      scopedStorage(userId).setItem(READING_ANONYMOUS_ADOPTION_DECISION_KEY, 'kept_separate');
    },

    shouldOfferAnonymousAdoption(userId: string): boolean {
      if (scopedStorage(userId).getItem(READING_ANONYMOUS_ADOPTION_DECISION_KEY) !== null) return false;
      return read(ANONYMOUS_STORAGE_PRINCIPAL).length > 0
        || readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, ANONYMOUS_STORAGE_PRINCIPAL).length > 0
        || readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, ANONYMOUS_STORAGE_PRINCIPAL).length > 0
        || readRecords<unknown>(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, ANONYMOUS_STORAGE_PRINCIPAL).length > 0
        || Object.keys(readObject(LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks, ANONYMOUS_STORAGE_PRINCIPAL)).length > 0;
    },

    enqueueProgress(draft: ReadingProgressDraft): ReadingProgressWrite {
      const tombstone = progressTombstones.get(progressTombstoneKey(draft.contentKind, draft.contentId));
      const payload: ReadingProgressWrite = {
        ...draft,
        baseRevision: Math.max(0, Math.floor(draft.baseRevision ?? 0), tombstone?.revision ?? 0),
        deviceId: deviceId(),
        deviceSequence: nextSequence(),
        epoch: Math.max(draft.epoch, tombstone ? tombstone.epoch + 1 : draft.epoch),
      };
      enqueue({
        id: `progress:${payload.contentKind}:${payload.contentId}`,
        kind: 'progress',
        payload,
        queuedAt: now().toISOString(),
      });
      upsertProgress({
        ...payload,
        revision: payload.baseRevision,
        serverUpdatedAt: null,
      });
      return payload;
    },

    enqueueProgressDelete(input: Omit<ReadingProgressDelete, 'deviceId' | 'deviceSequence'>): ReadingProgressDelete {
      const operationId = `progress:${input.contentKind}:${input.contentId}`;
      const pending = read();
      const unsyncedCreate = pending.find((operation) => (
        operation.id === operationId
        && operation.kind === 'progress'
        && operation.payload.baseRevision === 0
        && !operation.dispatched && !operation.predecessor
      ));
      if (unsyncedCreate?.kind === 'progress') {
        write(pending.filter((operation) => operation.id !== operationId));
        removeProgress(input.contentKind, input.contentId);
        return {
          ...input,
          deviceId: unsyncedCreate.payload.deviceId,
          deviceSequence: unsyncedCreate.payload.deviceSequence,
        };
      }
      const payload: ReadingProgressDelete = { ...input, deviceId: deviceId(), deviceSequence: nextSequence() };
      enqueue({
        id: operationId,
        kind: 'progress-delete',
        payload,
        queuedAt: now().toISOString(),
      });
      removeProgress(payload.contentKind, payload.contentId);
      return payload;
    },

    enqueueAnnotationCreate(input: ReadingAnnotationWrite): ReadingAnnotationWrite {
      enqueue({
        id: `annotation:${input.id}`,
        annotationId: input.id,
        kind: 'annotation-create',
        payload: input,
        queuedAt: now().toISOString(),
      });
      const timestamp = now().toISOString();
      upsertAnnotation({ ...input, createdAt: timestamp, updatedAt: timestamp });
      return input;
    },

    enqueueAnnotationUpdate(annotationId: string, input: ReadingAnnotationPatch): void {
      const operations = read();
      const pendingCreate = operations.find((item) => item.kind === 'annotation-create' && item.annotationId === annotationId);
      if (pendingCreate?.kind === 'annotation-create' && !pendingCreate.dispatched && !pendingCreate.predecessor) {
        pendingCreate.payload = {
          ...pendingCreate.payload,
          anchorStatus: input.anchorStatus,
          color: input.color,
          contentVersion: input.contentVersion,
          locator: input.locator,
          note: input.note,
        };
        write(operations);
        const cached = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
          .find((row) => row.id === annotationId);
        if (cached) upsertAnnotation({ ...cached, ...input, updatedAt: now().toISOString() });
        return;
      }
      enqueue({
        id: `annotation:${annotationId}`,
        annotationId,
        kind: 'annotation-update',
        payload: input,
        queuedAt: now().toISOString(),
      });
      const cached = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
        .find((row) => row.id === annotationId);
      if (cached) upsertAnnotation({ ...cached, ...input, updatedAt: now().toISOString() });
    },

    enqueueAnnotationDelete(annotationId: string): void {
      const operations = read();
      const withoutAnnotation = operations.filter((item) => !('annotationId' in item) || item.annotationId !== annotationId);
      if (withoutAnnotation.length < operations.length
        && operations.some((item) => item.kind === 'annotation-create' && item.annotationId === annotationId
          && !item.dispatched && !item.predecessor)) {
        write(withoutAnnotation);
        removeAnnotation(annotationId);
        return;
      }
      enqueue({
        id: `annotation:${annotationId}`,
        annotationId,
        kind: 'annotation-delete',
        payload: null,
        queuedAt: now().toISOString(),
      });
      removeAnnotation(annotationId);
    },

    cachedProgress(): ReadingProgressRecord[] {
      return readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY)
        .filter(isProgressRecord)
        .sort(compareProgressRecency);
    },

    cachedProgressTombstone(contentKind: ReadingProgressWrite['contentKind'], contentId: string): ReadingProgressTombstone | null {
      return progressTombstones.get(progressTombstoneKey(contentKind, contentId)) ?? null;
    },

    cachedAnnotations(): ReadingAnnotationRecord[] {
      return readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
        .filter(isAnnotationRecord)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    },

    async getProgress(contentKind: ReadingProgressWrite['contentKind'], contentId: string): Promise<ReadingProgressRecord | null> {
      const capturedMutation = mutationVersion();
      let cached = readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY)
        .find((row) => row.contentKind === contentKind && row.contentId === contentId) ?? null;
      if (!session.authenticated || !session.user?.id) return cached && isProgressRecord(cached) ? cached : null;
      const capturedPrincipal = session.user.id;
      const capturedGeneration = generation;
      const response = await fetcher(`/api/reading/progress/${encodeURIComponent(contentKind)}/${encodeURIComponent(contentId)}`, {
        headers: { accept: 'application/json' }, signal: undefined,
      });
      if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return null;
      cached = readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY)
        .find((row) => row.contentKind === contentKind && row.contentId === contentId) ?? null;
      if (mutationVersion() !== capturedMutation) return cached && isProgressRecord(cached) ? cached : null;
      const operationId = `progress:${contentKind}:${contentId}`;
      const hasPending = read(capturedPrincipal).some((operation) => operation.id === operationId);
      if (response.status === 404) {
        if (principalId() === capturedPrincipal && !hasPending) removeProgress(contentKind, contentId, capturedPrincipal);
        return hasPending && cached && isProgressRecord(cached) ? cached : null;
      }
      if (!response.ok) throw new Error(`reading_progress_${response.status}`);
      const payload = await response.json() as { progress?: unknown; tombstone?: unknown };
      if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return null;
      cached = readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY)
        .find((row) => row.contentKind === contentKind && row.contentId === contentId) ?? null;
      if (mutationVersion() !== capturedMutation) return cached && isProgressRecord(cached) ? cached : null;
      if (read(capturedPrincipal).some((operation) => operation.id === operationId)) {
        return cached && isProgressRecord(cached) ? cached : null;
      }
      if (isProgressRecord(payload.progress)) {
        upsertProgress(payload.progress, capturedPrincipal);
        return payload.progress;
      }
      rememberProgressTombstone(payload.tombstone, capturedPrincipal);
      removeProgress(contentKind, contentId, capturedPrincipal);
      return null;
    },

    async listProgress(limit = 50): Promise<ReadingProgressRecord[]> {
      const capturedMutation = mutationVersion();
      const capturedGeneration = generation;
      const cached = this.cachedProgress();
      if (!session.authenticated || !session.user?.id) return cached;
      const capturedPrincipal = session.user.id;
      const pageLimit = Math.min(200, Math.max(1, Math.floor(limit)));
      const response = await fetcher(`/api/reading/progress?limit=${pageLimit}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`reading_progress_${response.status}`);
      const payload = await response.json() as { progress?: unknown };
      if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return [];
      if (mutationVersion() !== capturedMutation || !Array.isArray(payload.progress)) return this.cachedProgress();
      const pendingKeys = new Set(read(capturedPrincipal)
        .filter((operation) => operation.kind === 'progress' || operation.kind === 'progress-delete')
        .map((operation) => `${operation.payload.contentKind}:${operation.payload.contentId}`));
      const pendingDeletes = new Set(read(capturedPrincipal)
        .filter((operation) => operation.kind === 'progress-delete')
        .map((operation) => `${operation.payload.contentKind}:${operation.payload.contentId}`));
      const remote = payload.progress.filter(isProgressRecord)
        .filter((row) => !pendingDeletes.has(`${row.contentKind}:${row.contentId}`));
      const pendingLocal = this.cachedProgress().filter((row) => pendingKeys.has(`${row.contentKind}:${row.contentId}`)
        && !pendingDeletes.has(`${row.contentKind}:${row.contentId}`));
      const merged = mergeByKey(remote, pendingLocal, (row) => `${row.contentKind}:${row.contentId}`);
      const oldestRemoteTime = Math.min(...remote.map((row) => Date.parse(row.serverUpdatedAt || row.clientUpdatedAt || '')));
      // Trang gần đây đầy không chứng minh lịch sử cũ đã bị xóa trên server.
      const outsidePage = payload.progress.length >= pageLimit
        ? cached.filter((row) => !pendingDeletes.has(`${row.contentKind}:${row.contentId}`)
          && (!Number.isFinite(oldestRemoteTime)
            || Date.parse(row.serverUpdatedAt || row.clientUpdatedAt || '') <= oldestRemoteTime))
        : [];
      writeRecords(READING_PROGRESS_CACHE_KEY,
        mergeByKey(outsidePage, merged, (row) => `${row.contentKind}:${row.contentId}`), capturedPrincipal);
      return [...merged].sort(compareProgressRecency).slice(0, pageLimit);
    },

    async listAnnotations(filters: { contentKind?: ReadingAnnotationWrite['contentKind']; contentId?: string; limit?: number } = {}): Promise<ReadingAnnotationRecord[]> {
      const capturedMutation = mutationVersion();
      const capturedGeneration = generation;
      const matchesFilters = (row: ReadingAnnotationRecord) => (
        (!filters.contentKind || row.contentKind === filters.contentKind)
        && (!filters.contentId || row.contentId === filters.contentId)
      );
      const local = this.cachedAnnotations().filter(matchesFilters);
      if (!session.authenticated || !session.user?.id) return local;
      const capturedPrincipal = session.user.id;
      const pageLimit = Math.min(200, Math.max(1, Math.floor(filters.limit ?? 200)));
      const remote: ReadingAnnotationRecord[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const search = new URLSearchParams({ limit: String(pageLimit) });
        if (filters.contentKind) search.set('contentKind', filters.contentKind);
        if (filters.contentId) search.set('contentId', filters.contentId);
        if (cursor) search.set('cursor', cursor);
        const response = await fetcher(`/api/reading/annotations?${search}`, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`reading_annotations_${response.status}`);
        const payload = await response.json() as { annotations?: unknown; nextCursor?: unknown };
        if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return [];
        if (mutationVersion() !== capturedMutation || !Array.isArray(payload.annotations)) return this.cachedAnnotations().filter(matchesFilters);
        remote.push(...payload.annotations.filter(isAnnotationRecord));
        const nextCursor = typeof payload.nextCursor === 'string' && payload.nextCursor ? payload.nextCursor : null;
        if (nextCursor && seenCursors.has(nextCursor)) throw new Error('reading_annotations_repeated_cursor');
        if (nextCursor) seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);
      const pendingIds = new Set(read(capturedPrincipal)
        .filter((operation) => 'annotationId' in operation)
        .map((operation) => operation.annotationId));
      const pendingDeletes = new Set(read(capturedPrincipal)
        .filter((operation) => operation.kind === 'annotation-delete')
        .map((operation) => operation.annotationId));
      const cachedAccount = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, capturedPrincipal);
      const pendingLocal = cachedAccount.filter((row) => matchesFilters(row) && pendingIds.has(row.id));
      const merged = mergeByKey(remote.filter((row) => !pendingDeletes.has(row.id)), pendingLocal, (row) => row.id);
      writeRecords(
        READING_ANNOTATIONS_CACHE_KEY,
        mergeByKey(cachedAccount.filter((row) => !matchesFilters(row)), merged, (row) => row.id),
        capturedPrincipal,
      );
      return merged
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    },

    async getAnnotation(annotationId: string): Promise<ReadingAnnotationRecord | null> {
      const capturedMutation = mutationVersion();
      let cached = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
        .find((row) => row.id === annotationId) ?? null;
      if (!session.authenticated || !session.user?.id) return cached && isAnnotationRecord(cached) ? cached : null;
      const capturedPrincipal = session.user.id;
      const capturedGeneration = generation;
      const response = await fetcher(`/api/reading/annotations/${encodeURIComponent(annotationId)}`, {
        headers: { accept: 'application/json' },
      });
      if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return null;
      cached = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
        .find((row) => row.id === annotationId) ?? null;
      if (mutationVersion() !== capturedMutation) return cached && isAnnotationRecord(cached) ? cached : null;
      const hasPending = read(capturedPrincipal).some((operation) => (
        'annotationId' in operation && operation.annotationId === annotationId
      ));
      if (response.status === 404) {
        if (principalId() === capturedPrincipal && !hasPending) removeAnnotation(annotationId, capturedPrincipal);
        return hasPending && cached && isAnnotationRecord(cached) ? cached : null;
      }
      if (!response.ok) throw new Error(`reading_annotation_${response.status}`);
      const payload = await response.json() as { annotation?: unknown; tombstone?: unknown };
      if (principalId() !== capturedPrincipal || generation !== capturedGeneration) return null;
      cached = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY)
        .find((row) => row.id === annotationId) ?? null;
      if (mutationVersion() !== capturedMutation) return cached && isAnnotationRecord(cached) ? cached : null;
      if (read(capturedPrincipal).some((operation) => 'annotationId' in operation && operation.annotationId === annotationId)) {
        return cached && isAnnotationRecord(cached) ? cached : null;
      }
      if (isAnnotationRecord(payload.annotation)) {
        upsertAnnotation(payload.annotation, capturedPrincipal);
        return payload.annotation;
      }
      removeAnnotation(annotationId, capturedPrincipal);
      return null;
    },

    async flush(): Promise<number> {
      if (!session.authenticated || !session.user?.id || !session.csrfToken) return 0;
      const requestedGeneration = generation;
      // Đọc lại outbox sau ACK thay vì gửi trùng mutation của lượt đang chạy.
      while (activeDrain?.generation === requestedGeneration) await activeDrain.done;
      if (generation !== requestedGeneration) return 0;
      const capturedPrincipal = session.user.id;
      const capturedGeneration = generation;
      const csrf = session.csrfToken;
      const operations = read(capturedPrincipal);
      if (!operations.length) return 0;
      const controller = new AbortController();
      inFlight = controller;
      let releaseDrain!: () => void;
      const drain = { generation: capturedGeneration, done: new Promise<void>(resolve => { releaseDrain = resolve; }) };
      activeDrain = drain;
      let applied = 0;
      try {
        for (const queued of operations) {
          // At most a predecessor plus the latest intent per entity in this drain.
          // Re-read shared storage so a removed, never-sent snapshot is not dispatched.
          for (let step = 0; step < 2; step += 1) {
            if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
            const pendingBeforeSend = read(capturedPrincipal);
            const current = pendingBeforeSend.find((item) => item.id === queued.id);
            if (!current) break;
            const operation = current.predecessor ?? current;
            if (!current.predecessor) {
              current.dispatched = true;
              write(pendingBeforeSend, capturedPrincipal);
            }
            const request = operationRequest(operation, csrf, controller.signal);
            const native = fetcher === fetch
              ? await fetchNativeJsonMutation(request.path, request.init) : null;
            const response = native ?? await fetcher(request.path, request.init);
            if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
            if (response.status === 409 && (operation.kind === 'progress' || operation.kind === 'progress-delete')) {
              const body = await response.json().catch(() => null) as {
                details?: { current?: ReadingProgressRecord | null; tombstone?: unknown };
                error?: { details?: { current?: ReadingProgressRecord | null; tombstone?: unknown } };
              } | null;
              if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
              const details = body?.error?.details ?? body?.details;
              if (details?.current === null && details?.tombstone === null
                && (operation.kind === 'progress-delete' || current.predecessor)) {
                // A rejected old sequence cannot later create this absent row.
                // Absence already satisfies the delete, even if another record
                // advanced this device's high-water sequence before the replay.
                acknowledge(operation, null, capturedPrincipal);
                continue;
              }
              const tombstone = rememberProgressTombstone(details?.tombstone, capturedPrincipal);
              if (tombstone
                && tombstone.contentKind === operation.payload.contentKind
                && tombstone.contentId === operation.payload.contentId) {
                if (operation.kind === 'progress-delete' || current.predecessor) {
                  acknowledge(operation, { tombstone }, capturedPrincipal);
                  continue;
                }
                removeProgress(operation.payload.contentKind, operation.payload.contentId, capturedPrincipal);
                break;
              }
              const remote = details?.current;
              if (remote && Number.isSafeInteger(remote.revision)) {
                const pending = read(capturedPrincipal);
                const queued = pending.find((item) => item.id === operation.id);
                if (queued?.predecessor && sameOperation(queued.predecessor, operation)
                  && remote.deviceId === operation.payload.deviceId
                  && remote.deviceSequence === operation.payload.deviceSequence) {
                  acknowledge(operation, { progress: remote }, capturedPrincipal);
                  continue;
                }
                const rebased = queued?.predecessor ?? queued;
                if (rebased && sameOperation(rebased, operation)
                  && (rebased.kind === 'progress' || rebased.kind === 'progress-delete')) {
                  rebased.payload.baseRevision = Number(remote.revision);
                  rebased.payload.epoch = Math.max(rebased.payload.epoch, Number(remote.epoch ?? 1));
                  rebased.payload.deviceSequence = nextSequence();
                  write(pending, capturedPrincipal);
                  const cached = readRecords<ReadingProgressRecord>(READING_PROGRESS_CACHE_KEY, capturedPrincipal)
                    .find((row) => row.contentKind === rebased.payload.contentKind && row.contentId === rebased.payload.contentId);
                  if (cached && rebased.kind === 'progress' && queued?.kind !== 'progress-delete') upsertProgress({
                    ...cached,
                    epoch: rebased.payload.epoch,
                    revision: rebased.payload.baseRevision,
                  }, capturedPrincipal);
                }
              }
              break;
            }
            if (response.status === 409 && operation.kind === 'annotation-update') {
              const body = await response.json().catch(() => null) as {
                error?: { details?: { current?: unknown } };
              } | null;
              if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
              const current = body?.error?.details?.current;
              if (isAnnotationRecord(current)) {
                const pending = read(capturedPrincipal);
                const queued = pending.find((item) => item.id === operation.id);
                const rebased = queued?.predecessor ?? queued;
                if (rebased?.kind === 'annotation-update' && sameOperation(rebased, operation)) {
                  rebased.payload.baseUpdatedAt = current.updatedAt;
                  write(pending, capturedPrincipal);
                  const local = readRecords<ReadingAnnotationRecord>(READING_ANNOTATIONS_CACHE_KEY, capturedPrincipal)
                    .find((row) => row.id === operation.annotationId);
                  if (local && queued?.kind !== 'annotation-delete') upsertAnnotation({ ...local, updatedAt: current.updatedAt }, capturedPrincipal);
                }
              }
              break;
            }
            if (!response.ok && !(operation.kind === 'annotation-delete' && response.status === 404)) {
              // A concurrent drain may already have consumed this exact dependency.
              const pending = read(capturedPrincipal).find((item) => item.id === operation.id);
              if (!pending || (!sameOperation(pending, operation)
                && (!pending.predecessor || !sameOperation(pending.predecessor, operation)))) break;
              if (pending.kind === 'annotation-delete' && pending.predecessor
                && ((operation.kind === 'annotation-create' && response.status === 409)
                  || (operation.kind === 'annotation-update' && response.status === 404))) {
                const stateResponse = await fetcher(`/api/reading/annotations/${encodeURIComponent(operation.annotationId)}`, {
                  headers: { accept: 'application/json' }, signal: controller.signal,
                });
                const state = stateResponse.ok ? await stateResponse.json() as OperationResponse : null;
                if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
                if (isAnnotationTombstone(state?.tombstone)) {
                  acknowledge(operation, state, capturedPrincipal);
                  continue;
                }
              }
              throw new Error(`reading_activity_${response.status}`);
            }
            const body = await response.json().catch(() => null) as OperationResponse | null;
            if (generation !== capturedGeneration || principalId() !== capturedPrincipal) return applied;
            acknowledge(operation, body, capturedPrincipal);
            applied += 1;
          }
        }
      } finally {
        if (inFlight === controller) inFlight = null;
        if (activeDrain === drain) activeDrain = null;
        releaseDrain();
      }
      return applied;
    },

    pending(principal = principalId()): ReadonlyArray<ReadingOperation> {
      return read(principal);
    },

    setSession(next: ReadingActivitySession): void {
      const previousPrincipal = principalId();
      session = next;
      if (previousPrincipal !== principalId()) {
        generation += 1;
        inFlight?.abort();
        inFlight = null;
        adoptionInFlight?.abort();
        adoptionInFlight = null;
        preparedAdoption = null;
      }
    },
  };
}

export function isReadingActivityCapacityError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === READING_ACTIVITY_OUTBOX_CAPACITY_ERROR;
}

export function createThrottledReadingProgressWriter(
  write: (draft: ReadingProgressDraft) => void,
  delayMs = 1_500,
  timers: Pick<typeof globalThis, 'clearTimeout' | 'setTimeout'> = globalThis,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: ReadingProgressDraft | null = null;
  const commit = () => {
    if (!latest) return;
    if (timer !== null) timers.clearTimeout(timer);
    const draft = latest;
    latest = null;
    timer = null;
    write(draft);
  };
  return {
    schedule(draft: ReadingProgressDraft) {
      latest = draft;
      if (timer !== null) return;
      timer = timers.setTimeout(commit, delayMs);
    },
    flush: commit,
    cancel() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      latest = null;
    },
  };
}

function isProgressRecord(value: unknown): value is ReadingProgressRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.contentId === 'string'
    && typeof row.contentKind === 'string'
    && typeof row.position === 'object'
    && Number.isFinite(Number(row.percent))
    && Number.isSafeInteger(Number(row.epoch));
}

function isProgressTombstone(value: unknown): value is ReadingProgressTombstone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.contentId === 'string'
    && typeof row.contentKind === 'string'
    && Number.isSafeInteger(Number(row.revision))
    && Number(row.revision) >= 1
    && Number.isSafeInteger(Number(row.epoch))
    && Number(row.epoch) >= 1
    && typeof row.serverUpdatedAt === 'string'
    && typeof row.deletedAt === 'string';
}

function isAnnotationTombstone(value: unknown): value is ReadingAnnotationTombstone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.updatedAt === 'string'
    && typeof row.deletedAt === 'string';
}

function isAnnotationRecord(value: unknown): value is ReadingAnnotationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.contentId === 'string'
    && typeof row.quoteText === 'string'
    && (row.color === 'yellow' || row.color === 'green')
    && typeof row.updatedAt === 'string';
}

function compareProgressRecency(left: ReadingProgressRecord, right: ReadingProgressRecord): number {
  return Date.parse(right.serverUpdatedAt || right.clientUpdatedAt || '')
    - Date.parse(left.serverUpdatedAt || left.clientUpdatedAt || '');
}

function progressIdentityKey(contentKind: string, contentId: string): string {
  return `${contentKind}\u0000${contentId}`;
}

function mergeByKey<T>(preferred: readonly T[], overlay: readonly T[], key: (row: T) => string): T[] {
  const merged = new Map(preferred.map((row) => [key(row), row]));
  for (const row of overlay) merged.set(key(row), row);
  return [...merged.values()];
}

function readingBookmarkMergeKey(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'id' in value) {
    const id = String((value as { id?: unknown }).id ?? '').trim();
    if (id) return `bookmark:${id}`;
  }
  return `unknown:${JSON.stringify(value)}`;
}

function bookmarkMergeKeyFromSyncDeletion(key: string): string {
  for (const prefix of ['id:', 'articleId:']) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return `bookmark:${key.slice(prefix.length)}`;
    }
  }
  return `sync:${key}`;
}

function normalizeBookmarkDeletions(value: unknown): SyncDeletion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.key !== 'string' || !record.key) return [];
    const deletedAt = typeof record.deletedAt === 'number'
      ? record.deletedAt
      : Date.parse(String(record.deletedAt || ''));
    return Number.isFinite(deletedAt) ? [{ key: record.key, deletedAt }] : [];
  });
}

function sameOperation(left: ReadingOperation, right: ReadingOperation): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.queuedAt === right.queuedAt
    && JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

function operationRequest(operation: ReadingOperation, csrf: string, signal: AbortSignal) {
  const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
  if (operation.kind === 'progress') {
    return { path: '/api/reading/progress', init: { body: JSON.stringify(operation.payload), headers, method: 'PUT', signal } };
  }
  if (operation.kind === 'progress-delete') {
    return { path: '/api/reading/progress', init: { body: JSON.stringify(operation.payload), headers, method: 'DELETE', signal } };
  }
  const path = operation.kind === 'annotation-create'
    ? '/api/reading/annotations'
    : `/api/reading/annotations/${encodeURIComponent(operation.annotationId)}`;
  const method = operation.kind === 'annotation-create' ? 'POST'
    : operation.kind === 'annotation-update' ? 'PATCH' : 'DELETE';
  return {
    path,
    init: {
      body: operation.payload === null ? undefined : JSON.stringify(operation.payload),
      headers,
      method,
      signal,
    },
  };
}

function isReadingOperation(value: unknown): value is ReadingOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && ['progress', 'progress-delete', 'annotation-create', 'annotation-update', 'annotation-delete'].includes(String(row.kind));
}
