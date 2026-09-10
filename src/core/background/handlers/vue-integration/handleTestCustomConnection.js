// Handler for Custom Test Connection from Vue apps.
//
// Runs probeCustomConnection in the background service worker so capability
// writes land in the same module instance CustomProvider reads. The Options
// page is a separate JS runtime; probing there would leave the background
// cache untouched. Narrowly scoped: exact caller-supplied values in, semantic
// report out. Never Test Key semantics, never storage reads/writes, never
// settings mutation.
//
// Cancellation ownership: this module owns one overall deadline per active
// check plus a caller-keyed registry of in-flight checks. A newer check from
// the same caller aborts the older one (supersede); different callers are
// independent. The registry keys primarily on the caller-supplied callerId
// (one stable id per UI component instance); the sender-derived key remains
// only as a fallback for callers that omit it. The UI may also cancel its
// active check explicitly (config edits) via { cancel: true }. Every path —
// success, failure, timeout, supersede, cancel — clears its timer and
// registry entry in `finally`, and entries are removed by object identity so
// a settled older run can never drop a newer entry.
import { probeCustomConnection } from '@/features/translation/providers/CustomConnectionProbe.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'TestCustomConnection');

/**
 * Overall per-check deadline for one compatibility probe. Generous for local
 * cold starts (model load + several sequential round-trips); the messaging
 * timeout for TEST_CUSTOM_CONNECTION sits safely above it as a backstop.
 */
export const CUSTOM_CONNECTION_PROBE_DEADLINE_MS = 90000;

const activeCustomConnectionChecks = new Map();

function toProbeString(value) {
  return typeof value === 'string' ? value : '';
}

const CALLER_ID_MAX_LENGTH = 128;

/**
 * Validates the caller-supplied caller id: a trimmed non-empty string,
 * bounded so registry keys stay small. Returns '' when unusable so the
 * caller falls back to sender-based scoping.
 */
function toCallerId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > CALLER_ID_MAX_LENGTH ? trimmed.slice(0, CALLER_ID_MAX_LENGTH) : trimmed;
}

function createOperationId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the local fallback below.
  }
  return `probe-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Compat fallback caller identity for supersede scoping, derived from the
 * message sender (never from translation messageIds). Extension pages expose
 * their URL; content-script senders expose a tab id. Missing senders share
 * one fallback bucket. Prefer the caller-supplied callerId whenever present:
 * two instances of the same page share one sender URL and would collide here.
 */
function callerKeyOf(sender) {
  const url = typeof sender?.url === 'string' && sender.url
    ? sender.url.split(/[?#]/, 1)[0]
    : '';
  if (url) return `url:${url}`;
  const tabId = sender?.tab?.id;
  if (tabId !== undefined && tabId !== null) return `tab:${tabId}:${sender?.frameId ?? 0}`;
  return 'unknown-caller';
}

function cancelActiveCheck(callerKey, reason) {
  const entry = activeCustomConnectionChecks.get(callerKey);
  if (!entry) return false;
  clearTimeout(entry.timeoutId);
  activeCustomConnectionChecks.delete(callerKey);
  entry.controller.abort(reason);
  return true;
}

export async function handleTestCustomConnection(message, sender) {
  const config = message?.data?.config;
  const values = config && typeof config === 'object' ? config : {};
  // Caller-supplied callerId wins (one stable id per UI instance); the
  // sender-derived key is only a compat fallback. Namespaced so a crafted
  // callerId can never collide with sender-derived keys.
  const callerId = toCallerId(values.callerId);
  const callerKey = callerId ? `caller:${callerId}` : callerKeyOf(sender);

  // Explicit cancellation of this caller's active check (e.g. the user edited
  // the form mid-flight). Harmless when nothing is in flight.
  if (values.cancel === true) {
    const cancelled = cancelActiveCheck(callerKey, 'cancelled');
    if (cancelled) logger.debug('[Custom] Test compatibility check cancelled');
    return { success: true, data: { cancelled } };
  }

  const operationId = toProbeString(values.operationId) || createOperationId();

  const previous = activeCustomConnectionChecks.get(callerKey);
  if (previous) {
    clearTimeout(previous.timeoutId);
    activeCustomConnectionChecks.delete(callerKey);
    previous.controller.abort('superseded');
    logger.debug('[Custom] Test compatibility check superseded');
  }

  const controller = new AbortController();
  const entry = { operationId, controller, timeoutId: 0 };
  activeCustomConnectionChecks.set(callerKey, entry);
  entry.timeoutId = setTimeout(() => {
    controller.abort('timeout');
    logger.debug('[Custom] Test compatibility check timed out');
  }, CUSTOM_CONNECTION_PROBE_DEADLINE_MS);

  try {
    const report = await probeCustomConnection({
      apiUrl: toProbeString(values.apiUrl),
      apiModel: toProbeString(values.apiModel),
      apiKey: toProbeString(values.apiKey),
      signal: controller.signal,
    });
    // Single bounded semantic summary for the Test Compatibility boundary.
    // Approved fields only: never keys, bodies, raw params, or unbounded
    // content (model names arrive already bounded by the probe).
    logger.debug('[Custom] Test compatibility result:', {
      state: report?.state,
      usable: report?.usable,
      responseFormat: report?.responseFormat,
      fallbackStructured: report?.fallbackStructured,
      modelStatus: report?.modelStatus,
      requestedModel: report?.requestedModel,
      effectiveModel: report?.effectiveModel,
    });
    return { success: true, data: { report, operationId } };
  } catch (error) {
    const errorResponse = MessageFormat.createErrorResponse(
      error,
      message?.messageId || null,
      { context: 'custom-connection-test' },
    );
    return { ...errorResponse, data: { success: false } };
  } finally {
    if (activeCustomConnectionChecks.get(callerKey) === entry) {
      clearTimeout(entry.timeoutId);
      activeCustomConnectionChecks.delete(callerKey);
    }
  }
}
