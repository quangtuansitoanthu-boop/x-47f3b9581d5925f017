export const READING_CONTENT_KINDS = [
  'article',
  'book',
  'chapter',
  'pdf',
  'practice',
] as const;

export type ReadingContentKind = (typeof READING_CONTENT_KINDS)[number];
export type HighlightColor = 'yellow' | 'green';
export type AnnotationAnchorStatus = 'active' | 'orphaned';

export interface ReadingProgressPosition {
  page?: number;
  scrollTop?: number;
  chapterId?: string;
  chapterIdx?: number;
  chapterTitle?: string;
  chapterPercent?: number;
  selector?: string;
}

export interface ReadingProgressWrite {
  contentKind: ReadingContentKind;
  contentId: string;
  baseRevision: number;
  epoch: number;
  deviceId: string;
  deviceSequence: number;
  position: ReadingProgressPosition;
  total: number | null;
  percent: number;
  contentVersion: string | null;
  clientUpdatedAt: string | null;
}

export interface ReadingProgressDelete {
  contentKind: ReadingContentKind;
  contentId: string;
  baseRevision: number;
  epoch: number;
  deviceId: string;
  deviceSequence: number;
}

export interface ReadingAnnotationWrite {
  id: string;
  contentKind: ReadingContentKind;
  contentId: string;
  locator: Record<string, unknown>;
  quoteText: string;
  contextBefore: string;
  contextAfter: string;
  color: HighlightColor;
  note: string;
  contentVersion: string | null;
  anchorStatus: AnnotationAnchorStatus;
  idempotencyKey: string;
}

export interface ReadingAnnotationPatch {
  baseUpdatedAt: string;
  color: HighlightColor;
  note: string;
  locator: Record<string, unknown>;
  contentVersion: string | null;
  anchorStatus: AnnotationAnchorStatus;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function normalizeId(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim();
  if (!ID_PATTERN.test(normalized)) throw new Error(`invalid_${field}`);
  return normalized;
}

function finiteInteger(value: unknown, field: string, minimum: number): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum) throw new Error(`invalid_${field}`);
  return normalized;
}

export function normalizeReadingProgressWrite(input: unknown): ReadingProgressWrite {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_reading_progress');
  const row = input as Record<string, unknown>;
  const contentKind = String(row.contentKind ?? '') as ReadingContentKind;
  if (!READING_CONTENT_KINDS.includes(contentKind)) throw new Error('invalid_content_kind');
  const rawPosition = row.position;
  if (!rawPosition || typeof rawPosition !== 'object' || Array.isArray(rawPosition)) {
    throw new Error('invalid_position');
  }
  const percent = Number(row.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('invalid_percent');
  const total = row.total == null ? null : Number(row.total);
  if (total !== null && (!Number.isFinite(total) || total < 0)) throw new Error('invalid_total');

  return {
    contentKind,
    contentId: normalizeId(row.contentId, 'content_id'),
    baseRevision: finiteInteger(row.baseRevision ?? 0, 'base_revision', 0),
    epoch: finiteInteger(row.epoch ?? 1, 'epoch', 1),
    deviceId: normalizeId(row.deviceId, 'device_id'),
    deviceSequence: finiteInteger(row.deviceSequence, 'device_sequence', 1),
    position: { ...(rawPosition as ReadingProgressPosition) },
    total,
    percent,
    contentVersion: row.contentVersion == null ? null : String(row.contentVersion).slice(0, 256),
    clientUpdatedAt: row.clientUpdatedAt == null ? null : String(row.clientUpdatedAt).slice(0, 64),
  };
}

export function normalizeReadingProgressDelete(input: unknown): ReadingProgressDelete {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_reading_progress_delete');
  const row = input as Record<string, unknown>;
  const contentKind = String(row.contentKind ?? '') as ReadingContentKind;
  if (!READING_CONTENT_KINDS.includes(contentKind)) throw new Error('invalid_content_kind');
  return {
    contentKind,
    contentId: normalizeId(row.contentId, 'content_id'),
    baseRevision: finiteInteger(row.baseRevision, 'base_revision', 1),
    epoch: finiteInteger(row.epoch, 'epoch', 1),
    deviceId: normalizeId(row.deviceId, 'device_id'),
    deviceSequence: finiteInteger(row.deviceSequence, 'device_sequence', 1),
  };
}

export function normalizeReadingAnnotationWrite(input: unknown): ReadingAnnotationWrite {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_annotation');
  const row = input as Record<string, unknown>;
  const contentKind = String(row.contentKind ?? '') as ReadingContentKind;
  if (!READING_CONTENT_KINDS.includes(contentKind)) throw new Error('invalid_content_kind');
  const locator = row.locator;
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) throw new Error('invalid_locator');
  const quoteText = String(row.quoteText ?? '').trim();
  const note = String(row.note ?? '').trim();
  if (!quoteText || quoteText.length > 12_000) throw new Error('invalid_quote_text');
  if (note.length > 12_000) throw new Error('invalid_note');
  const color = String(row.color ?? '') as HighlightColor;
  if (color !== 'yellow' && color !== 'green') throw new Error('invalid_highlight_color');
  const anchorStatus = String(row.anchorStatus ?? 'active') as AnnotationAnchorStatus;
  if (anchorStatus !== 'active' && anchorStatus !== 'orphaned') throw new Error('invalid_anchor_status');

  return {
    id: normalizeId(row.id, 'annotation_id'),
    contentKind,
    contentId: normalizeId(row.contentId, 'content_id'),
    locator: { ...(locator as Record<string, unknown>) },
    quoteText,
    contextBefore: String(row.contextBefore ?? '').slice(0, 2_000),
    contextAfter: String(row.contextAfter ?? '').slice(0, 2_000),
    color,
    note,
    contentVersion: row.contentVersion == null ? null : String(row.contentVersion).slice(0, 256),
    anchorStatus,
    idempotencyKey: normalizeId(row.idempotencyKey, 'idempotency_key'),
  };
}

export function normalizeReadingAnnotationPatch(input: unknown): ReadingAnnotationPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_annotation_patch');
  const row = input as Record<string, unknown>;
  const locator = row.locator;
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) throw new Error('invalid_locator');
  const note = String(row.note ?? '').trim();
  if (note.length > 12_000) throw new Error('invalid_note');
  const color = String(row.color ?? '') as HighlightColor;
  if (color !== 'yellow' && color !== 'green') throw new Error('invalid_highlight_color');
  const anchorStatus = String(row.anchorStatus ?? 'active') as AnnotationAnchorStatus;
  if (anchorStatus !== 'active' && anchorStatus !== 'orphaned') throw new Error('invalid_anchor_status');
  const baseUpdatedAt = String(row.baseUpdatedAt ?? '').trim();
  if (!Number.isFinite(Date.parse(baseUpdatedAt))) throw new Error('invalid_base_updated_at');
  return {
    baseUpdatedAt,
    color,
    note,
    locator: { ...(locator as Record<string, unknown>) },
    contentVersion: row.contentVersion == null ? null : String(row.contentVersion).slice(0, 256),
    anchorStatus,
  };
}
