/**
 * Dev-only messaging contract for the Phase D OpenAI spike (SPIKE ONLY).
 *
 * The tester hook lives in Background and owns the transaction
 * (tab/lease/key/mint/stream-id/lifecycle); the Offscreen dev listener
 * owns consume/tracks/transport/playback/cleanup. Every message carries an
 * explicit transaction identity so stale responses can never affect newer
 * runs.
 *
 * Messages use their own target (never `offscreen`): the production
 * offscreen router answers `OFFSCREEN_UNAUTHORIZED` to any `offscreen`-
 * targeted message outside its allowlist, and that synchronous answer
 * would win the response race. The dev listener ignores everything else.
 *
 * These action names are namespaced to the spike and are never registered
 * in any production router, registry, UI, or settings surface.
 *
 * This module is dependency-free on purpose: both sides import it, and the
 * Offscreen side must stay free of key/mint dependencies.
 */

/** Dev-only message target. Never `offscreen` (see above). */
export const OPENAI_SPIKE_DEV_TARGET = 'openai-spike-dev';

/** Dev-only extension-messaging actions. Never add these to production routers. */
export const OPENAI_SPIKE_DEV_ACTIONS = Object.freeze({
  START: 'OPENAI_SPIKE_DEV_START',
  STOP: 'OPENAI_SPIKE_DEV_STOP',
  STATUS: 'OPENAI_SPIKE_DEV_STATUS',
});

const DEV_ACTION_VALUES = new Set(Object.values(OPENAI_SPIKE_DEV_ACTIONS));

/**
 * Whether an incoming runtime message targets the spike dev listener.
 * @param {unknown} message
 * @returns {boolean}
 */
export function isSpikeDevMessage(message) {
  return Boolean(message)
    && typeof message === 'object'
    && message.target === OPENAI_SPIKE_DEV_TARGET
    && typeof message.action === 'string'
    && DEV_ACTION_VALUES.has(message.action);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/**
 * Build the Background → Offscreen START dispatch. Sent immediately after
 * the stream id is minted — nothing slow may run between the two.
 */
export function createSpikeDevStart({ transactionId, targetLanguage, streamId, bootstrap }) {
  return {
    target: OPENAI_SPIKE_DEV_TARGET,
    action: OPENAI_SPIKE_DEV_ACTIONS.START,
    data: { transactionId, targetLanguage, streamId, bootstrap },
  };
}

/** Build the Background → Offscreen STOP dispatch. */
export function createSpikeDevStop(transactionId) {
  return {
    target: OPENAI_SPIKE_DEV_TARGET,
    action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
    data: { transactionId },
  };
}

/** Build the Background → Offscreen STATUS query. */
export function createSpikeDevStatus(transactionId) {
  return {
    target: OPENAI_SPIKE_DEV_TARGET,
    action: OPENAI_SPIKE_DEV_ACTIONS.STATUS,
    data: { transactionId },
  };
}

/**
 * Validate an inbound START dispatch. Returns the ephemeral fields or null.
 * Language binding is rechecked by the receiver; this stays structural.
 */
export function parseSpikeDevStart(message) {
  if (!isSpikeDevMessage(message) || message.action !== OPENAI_SPIKE_DEV_ACTIONS.START) return null;
  const data = isPlainObject(message.data) ? message.data : null;
  const bootstrap = data && isPlainObject(data.bootstrap) ? data.bootstrap : null;
  if (!data || !isNonEmptyString(data.transactionId) || !isNonEmptyString(data.streamId)) return null;
  if (typeof data.targetLanguage !== 'string' || !data.targetLanguage) return null;
  if (!bootstrap || !isNonEmptyString(bootstrap.secret)) return null;
  return {
    transactionId: data.transactionId,
    targetLanguage: data.targetLanguage,
    streamId: data.streamId,
    bootstrap,
  };
}

/** Validate an inbound STOP dispatch. */
export function parseSpikeDevStop(message) {
  if (!isSpikeDevMessage(message) || message.action !== OPENAI_SPIKE_DEV_ACTIONS.STOP) return null;
  const data = isPlainObject(message.data) ? message.data : null;
  if (!data || !isNonEmptyString(data.transactionId)) return null;
  return { transactionId: data.transactionId };
}

/** Validate an inbound STATUS query. */
export function parseSpikeDevStatus(message) {
  if (!isSpikeDevMessage(message) || message.action !== OPENAI_SPIKE_DEV_ACTIONS.STATUS) return null;
  const data = isPlainObject(message.data) ? message.data : null;
  if (!data || !isNonEmptyString(data.transactionId)) return null;
  return { transactionId: data.transactionId };
}

/**
 * Validate a START/STOP ack against the expected transaction. Stale,
 * malformed, or foreign acks return null and must never affect the run.
 */
export function parseSpikeDevAck(response, expectedTransactionId) {
  if (!isPlainObject(response)) return null;
  if (!isNonEmptyString(expectedTransactionId)) return null;
  if (response.transactionId !== expectedTransactionId) return null;
  if (typeof response.success !== 'boolean') return null;
  return {
    transactionId: response.transactionId,
    success: response.success,
    error: typeof response.error === 'string' ? response.error : undefined,
    targetLanguage: typeof response.targetLanguage === 'string' ? response.targetLanguage : undefined,
  };
}

/**
 * Validate a STATUS ack against the expected transaction. Telemetry is
 * accepted only as a plain scalar carrier; anything else becomes null.
 */
export function parseSpikeDevStatusAck(response, expectedTransactionId) {
  if (!isPlainObject(response)) return null;
  if (!isNonEmptyString(expectedTransactionId)) return null;
  if (response.transactionId !== expectedTransactionId) return null;
  if (response.success !== true || typeof response.active !== 'boolean') return null;
  return {
    success: true,
    transactionId: response.transactionId,
    active: response.active,
    targetLanguage: typeof response.targetLanguage === 'string' ? response.targetLanguage : null,
    captureReady: response.captureReady === true,
    telemetry: sanitizeSpikeTelemetry(response.telemetry),
  };
}

const TELEMETRY_MILESTONES = Object.freeze([
  'start',
  'offerCreated',
  'answerApplied',
  'firstRemoteAudio',
  'firstTranscriptEvent',
  'cleanup',
]);

function safeTelemetryCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeTelemetryMillis(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Rebuild transport telemetry as a fresh DTO of known safe scalars only:
 * booleans, non-negative safe ints, and finite-number-or-null milestones.
 * Nested objects, arrays, arbitrary strings (transcripts, SDP, secrets,
 * stream ids, raw data), and every unknown field are discarded. Malformed
 * input fails closed to null. Shared by the Offscreen STATUS response and
 * the Background STATUS-ack parsing so both sides enforce the same shape.
 * @param {unknown} value
 * @returns {{offerCreated: boolean, answerApplied: boolean, transcriptEvents: number, remoteTracks: number, milestones: object}|null}
 */
export function sanitizeSpikeTelemetry(value) {
  if (!isPlainObject(value)) return null;
  const milestones = isPlainObject(value.milestones) ? value.milestones : {};
  const cleanMilestones = {};
  for (const name of TELEMETRY_MILESTONES) {
    cleanMilestones[name] = safeTelemetryMillis(milestones[name]);
  }
  return {
    offerCreated: value.offerCreated === true,
    answerApplied: value.answerApplied === true,
    transcriptEvents: safeTelemetryCount(value.transcriptEvents),
    remoteTracks: safeTelemetryCount(value.remoteTracks),
    milestones: cleanMilestones,
  };
}
