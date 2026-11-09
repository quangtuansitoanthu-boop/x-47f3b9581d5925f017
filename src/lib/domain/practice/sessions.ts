import { ROSARY_PHRASES, ROSARY_SIZES } from './guided-sessions';

export const AUTOMATIC_PRACTICE_TYPES = [
  'meditation',
  'rosary',
  'scripture',
  'model_chant',
  'dharma_talk',
] as const;

export const PRACTICE_RECEIPT_TOLERANCE_SECONDS = 5;
export const MEDITATION_MINIMUM_TARGET_SECONDS = 60;
export const MEDITATION_MAXIMUM_TARGET_SECONDS = 24 * 60 * 60;
export const SCRIPTURE_MINIMUM_TARGET_SECONDS = 30;
export const SCRIPTURE_MAXIMUM_TARGET_SECONDS = 20 * 60;
export const AUDIO_MAXIMUM_TARGET_SECONDS = 24 * 60 * 60;

export type AutomaticPracticeType = (typeof AUTOMATIC_PRACTICE_TYPES)[number];
export type PracticeVerificationResult =
  | 'accepted'
  | 'below_threshold'
  | 'incomplete'
  | 'implausible'
  | 'unsupported';

export interface PracticeSessionStart {
  clientSessionId: string;
  activityType: AutomaticPracticeType;
  targetDurationSeconds: number | null;
  targetCount: number | null;
  sourceKind: string | null;
  sourceId: string | null;
  startedAt: string;
  idempotencyKey: string;
}

export interface PracticeSessionCompletion {
  acceptedDurationSeconds: number;
  acceptedCount: number;
  completedAt: string;
  evidenceSummary: Record<string, unknown>;
  verificationResult: PracticeVerificationResult;
  verificationReason: string | null;
}

export interface PracticeSessionFinishRequest {
  completedAt: string;
  evidenceSummary: Record<string, unknown>;
}

export interface PracticeSessionVerificationContext {
  serverElapsedSeconds: number;
  receiptMode?: 'live' | 'offline_replay';
  toleranceSeconds?: number;
}

const CUSTOM_ROSARY_SOURCE_PATTERN = /^custom:cp_\d{10,16}_[a-z0-9]{1,12}$/u;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function sessionId(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim();
  if (!SESSION_ID_PATTERN.test(normalized)) throw new Error(`invalid_${field}`);
  return normalized;
}

function optionalPositiveInteger(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function optionalMetadata(value: unknown, field: string, maximumLength: number): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`invalid_${field}`);
  }
  return normalized;
}

export function normalizePracticeSessionStart(input: unknown): PracticeSessionStart {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_practice_session');
  const row = input as Record<string, unknown>;
  const activityType = String(row.activityType ?? '') as AutomaticPracticeType;
  if (!AUTOMATIC_PRACTICE_TYPES.includes(activityType)) throw new Error('invalid_activity_type');
  const normalized: PracticeSessionStart = {
    clientSessionId: sessionId(row.clientSessionId, 'client_session_id'),
    activityType,
    targetDurationSeconds: optionalPositiveInteger(row.targetDurationSeconds, 'target_duration_seconds'),
    targetCount: optionalPositiveInteger(row.targetCount, 'target_count'),
    sourceKind: optionalMetadata(row.sourceKind, 'source_kind', 64),
    sourceId: optionalMetadata(row.sourceId, 'source_id', 192),
    startedAt: String(row.startedAt ?? '').slice(0, 64),
    idempotencyKey: sessionId(row.idempotencyKey, 'idempotency_key'),
  };
  const issue = practiceSessionStartIssue(normalized);
  if (issue) throw new Error(issue);
  return normalized;
}

export function normalizePracticeSessionCompletion(input: unknown): PracticeSessionCompletion {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_practice_completion');
  const row = input as Record<string, unknown>;
  const verificationResult = String(row.verificationResult ?? '') as PracticeVerificationResult;
  if (!['accepted', 'below_threshold', 'incomplete', 'implausible', 'unsupported'].includes(verificationResult)) {
    throw new Error('invalid_verification_result');
  }
  const acceptedDurationSeconds = Number(row.acceptedDurationSeconds ?? 0);
  const acceptedCount = Number(row.acceptedCount ?? 0);
  if (!Number.isSafeInteger(acceptedDurationSeconds) || acceptedDurationSeconds < 0) {
    throw new Error('invalid_accepted_duration');
  }
  if (!Number.isSafeInteger(acceptedCount) || acceptedCount < 0) throw new Error('invalid_accepted_count');
  const evidenceSummary = row.evidenceSummary;
  if (!evidenceSummary || typeof evidenceSummary !== 'object' || Array.isArray(evidenceSummary)) {
    throw new Error('invalid_evidence_summary');
  }
  return {
    acceptedDurationSeconds,
    acceptedCount,
    completedAt: String(row.completedAt ?? '').slice(0, 64),
    evidenceSummary: { ...(evidenceSummary as Record<string, unknown>) },
    verificationResult,
    verificationReason: row.verificationReason == null ? null : String(row.verificationReason).slice(0, 128),
  };
}

export function normalizePracticeSessionFinishRequest(input: unknown): PracticeSessionFinishRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_practice_completion');
  const row = input as Record<string, unknown>;
  const evidenceSummary = row.evidenceSummary;
  if (!evidenceSummary || typeof evidenceSummary !== 'object' || Array.isArray(evidenceSummary)) {
    throw new Error('invalid_evidence_summary');
  }
  const completedAt = String(row.completedAt ?? '').trim();
  if (!Number.isFinite(Date.parse(completedAt))) throw new Error('invalid_completed_at');
  if (new TextEncoder().encode(JSON.stringify(evidenceSummary)).byteLength > 16_000) {
    throw new Error('evidence_too_large');
  }
  return { completedAt, evidenceSummary: { ...(evidenceSummary as Record<string, unknown>) } };
}

export function verifyPracticeSession(
  start: PracticeSessionStart,
  finish: PracticeSessionFinishRequest,
  context: PracticeSessionVerificationContext,
): PracticeSessionCompletion {
  const evidence = finish.evidenceSummary;
  const elapsedSeconds = evidenceInteger(evidence.clientElapsedSeconds);
  const common = {
    completedAt: finish.completedAt,
    evidenceSummary: { ...evidence, receiptMode: context.receiptMode ?? 'live' },
  };
  const startIssue = practiceSessionStartIssue(start);
  if (startIssue) return rejected(common, 'unsupported', startIssue);

  const serverElapsedSeconds = evidenceInteger(context.serverElapsedSeconds);
  const toleranceSeconds = context.toleranceSeconds == null
    ? PRACTICE_RECEIPT_TOLERANCE_SECONDS
    : evidenceInteger(context.toleranceSeconds);
  if (serverElapsedSeconds < 0 || toleranceSeconds < 0) {
    return rejected(common, 'implausible', 'invalid_server_receipt_window');
  }
  const trustedElapsedLimit = serverElapsedSeconds + toleranceSeconds;

  if (elapsedSeconds < 0) return rejected(common, 'implausible', 'negative_elapsed');
  if (elapsedSeconds > trustedElapsedLimit) {
    return rejected(common, 'implausible', 'server_elapsed_mismatch');
  }

  if (start.activityType === 'meditation') {
    const target = start.targetDurationSeconds ?? 0;
    const foreground = evidenceInteger(evidence.activeSeconds);
    const background = evidence.backgroundActiveSeconds === undefined ? 0 : evidenceInteger(evidence.backgroundActiveSeconds);
    const active = foreground + background;
    const hidden = evidenceInteger(evidence.hiddenSeconds);
    if (target <= 0) return rejected(common, 'unsupported', 'missing_duration_target');
    if (foreground < 0 || background < 0 || background > hidden || active > trustedElapsedLimit
      || hidden < 0 || foreground + hidden > elapsedSeconds + 2) {
      return rejected(common, 'implausible', 'meditation_elapsed_mismatch');
    }
    const verification = meditationVerification({ activeSeconds: active, targetSeconds: target });
    return {
      ...common,
      acceptedCount: 0,
      acceptedDurationSeconds: verification.acceptedDurationSeconds,
      verificationReason: verification.verificationReason,
      verificationResult: verification.verificationResult,
    };
  }

  if (start.activityType === 'rosary') {
    const acceptedCount = evidenceInteger(evidence.acceptedCount);
    const minimumIntervalMs = evidenceInteger(evidence.minimumIntervalMs);
    const plausibleMaximum = Math.floor((trustedElapsedLimit * 1_000) / 400) + 1;
    const clientPlausibleMaximum = Math.floor((elapsedSeconds * 1_000) / 400) + 1;
    if (acceptedCount <= 0) return rejected(common, 'incomplete', 'rosary_empty');
    if (minimumIntervalMs < 400 || acceptedCount > plausibleMaximum || acceptedCount > clientPlausibleMaximum) {
      return rejected(common, 'implausible', 'rosary_interaction_rate');
    }
    return {
      ...common,
      acceptedCount,
      acceptedDurationSeconds: elapsedSeconds,
      verificationReason: null,
      verificationResult: 'accepted',
    };
  }

  if (start.activityType === 'scripture') {
    const target = start.targetDurationSeconds ?? 0;
    const active = evidenceInteger(evidence.activeSeconds);
    const scrollDepth = evidenceNumber(evidence.scrollDepthPercent);
    if (target <= 0) return rejected(common, 'unsupported', 'missing_reading_minimum');
    if (active < 0 || active > trustedElapsedLimit || active > elapsedSeconds + 2
      || scrollDepth < 0 || scrollDepth > 100) {
      return rejected(common, 'implausible', 'reading_elapsed_mismatch');
    }
    if (scrollDepth < 100 || active < target) return rejected(common, 'incomplete', 'scripture_not_completed');
    return {
      ...common,
      acceptedCount: 1,
      acceptedDurationSeconds: active,
      verificationReason: null,
      verificationResult: 'accepted',
    };
  }

  if (start.activityType === 'model_chant') {
    const target = start.targetDurationSeconds ?? 0;
    const played = evidenceInteger(evidence.playedSeconds);
    const skipped = evidenceInteger(evidence.skippedSeconds);
    if (target <= 0) return rejected(common, 'unsupported', 'missing_audio_duration');
    if (played < 0 || played > trustedElapsedLimit || played > elapsedSeconds + 2 || skipped < 0) {
      return rejected(common, 'implausible', 'model_audio_elapsed_mismatch');
    }
    if (evidence.sequential !== true || skipped > 0 || played < target) {
      return rejected(common, 'incomplete', 'model_audio_not_sequential');
    }
    return {
      ...common,
      acceptedCount: 1,
      acceptedDurationSeconds: Math.min(played, target),
      verificationReason: null,
      verificationResult: 'accepted',
    };
  }

  const played = evidenceInteger(evidence.playedSeconds);
  if (played < 0 || played > trustedElapsedLimit || played > elapsedSeconds + 2) {
    return rejected(common, 'implausible', 'dharma_talk_elapsed_mismatch');
  }
  if (start.targetDurationSeconds != null && played > start.targetDurationSeconds + toleranceSeconds) {
    return rejected(common, 'implausible', 'dharma_talk_duration_mismatch');
  }
  if (played < 60) return rejected(common, 'below_threshold', 'dharma_talk_below_one_minute');
  return {
    ...common,
    acceptedCount: 0,
    acceptedDurationSeconds: played,
    verificationReason: null,
    verificationResult: 'accepted',
  };
}

function practiceSessionStartIssue(start: PracticeSessionStart): string | null {
  if (start.activityType === 'meditation') {
    if (start.sourceKind !== 'guided_meditation' || start.sourceId !== null) return 'invalid_meditation_source';
    if (start.targetCount !== null) return 'invalid_meditation_target';
    const target = start.targetDurationSeconds;
    return target != null
      && target >= MEDITATION_MINIMUM_TARGET_SECONDS
      && target <= MEDITATION_MAXIMUM_TARGET_SECONDS
      && target % 60 === 0
      ? null
      : 'invalid_meditation_target';
  }

  if (start.activityType === 'rosary') {
    if (start.sourceKind !== 'guided_rosary'
      || !(ROSARY_PHRASES.includes(start.sourceId as (typeof ROSARY_PHRASES)[number])
        || (start.sourceId !== null && CUSTOM_ROSARY_SOURCE_PATTERN.test(start.sourceId)))) {
      return 'invalid_rosary_source';
    }
    return start.targetDurationSeconds === null
      && ROSARY_SIZES.includes(start.targetCount as (typeof ROSARY_SIZES)[number])
      ? null
      : 'invalid_rosary_target';
  }

  if (start.activityType === 'scripture') {
    if (start.sourceKind !== 'practice_article' || start.sourceId === null) return 'invalid_scripture_source';
    if (start.targetCount !== null) return 'invalid_scripture_target';
    const target = start.targetDurationSeconds;
    return target != null && target >= SCRIPTURE_MINIMUM_TARGET_SECONDS && target <= SCRIPTURE_MAXIMUM_TARGET_SECONDS
      ? null
      : 'invalid_scripture_target';
  }

  if (start.activityType === 'model_chant') {
    if (start.sourceKind !== 'practice_article_speech' || start.sourceId === null) return 'invalid_model_chant_source';
    if (start.targetCount !== null) return 'invalid_model_chant_target';
    const target = start.targetDurationSeconds;
    return target != null && target >= 1 && target <= AUDIO_MAXIMUM_TARGET_SECONDS
      ? null
      : 'invalid_model_chant_target';
  }

  if (start.sourceKind !== 'dharma_talk' || start.sourceId === null) return 'invalid_dharma_talk_source';
  if (start.targetCount !== null) return 'invalid_dharma_talk_target';
  return start.targetDurationSeconds === null
    || start.targetDurationSeconds <= AUDIO_MAXIMUM_TARGET_SECONDS
    ? null
    : 'invalid_dharma_talk_target';
}

export function meditationVerification(input: {
  activeSeconds: number;
  targetSeconds: number;
}): Pick<PracticeSessionCompletion, 'acceptedDurationSeconds' | 'verificationResult' | 'verificationReason'> {
  const targetSeconds = Math.max(1, Math.floor(input.targetSeconds));
  const activeSeconds = Math.max(0, Math.floor(input.activeSeconds));
  const ratio = activeSeconds / targetSeconds;
  return ratio >= 0.8
    ? { acceptedDurationSeconds: activeSeconds, verificationResult: 'accepted', verificationReason: null }
    : { acceptedDurationSeconds: 0, verificationResult: 'below_threshold', verificationReason: 'meditation_below_80_percent' };
}

function evidenceInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : -1;
}

function evidenceNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : -1;
}

function rejected(
  common: Pick<PracticeSessionCompletion, 'completedAt' | 'evidenceSummary'>,
  result: Exclude<PracticeVerificationResult, 'accepted'>,
  reason: string,
): PracticeSessionCompletion {
  return {
    ...common,
    acceptedCount: 0,
    acceptedDurationSeconds: 0,
    verificationReason: reason,
    verificationResult: result,
  };
}
