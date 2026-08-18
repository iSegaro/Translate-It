/**
 * Public semantic translation-error contract.
 *
 * This DTO intentionally contains no diagnostic Error fields. Runtime
 * consumers are not migrated to it in Phase 2A.
 */

export const PublicTranslationErrorTypes = Object.freeze({
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  ELEMENT_TOO_LARGE: 'ELEMENT_TOO_LARGE',
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_KEY_INVALID: 'API_KEY_INVALID',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  GEMINI_QUOTA_REGION: 'GEMINI_QUOTA_REGION',
  DEEPL_QUOTA_EXCEEDED: 'DEEPL_QUOTA_EXCEEDED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  RATE_LIMITED: 'RATE_LIMITED',
  MODEL_OVERLOADED: 'MODEL_OVERLOADED',
  API_FAILURE: 'API_FAILURE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  TRANSLATION_TIMEOUT: 'TRANSLATION_TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  REQUEST_FAILURE: 'REQUEST_FAILURE',
  API_URL_MISSING: 'API_URL_MISSING',
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  ENDPOINT_INVALID: 'ENDPOINT_INVALID',
  BROWSER_API_UNAVAILABLE: 'BROWSER_API_UNAVAILABLE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  TEXT_EMPTY: 'TEXT_EMPTY',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  PROMPT_INVALID: 'PROMPT_INVALID',
  LANGUAGE_PAIR_UNSUPPORTED: 'LANGUAGE_PAIR_UNSUPPORTED',
  TRANSLATION_FAILED: 'TRANSLATION_FAILED',
});

export const PublicTranslationErrorActions = Object.freeze({
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  RETRY: 'RETRY',
  RETRY_LATER: 'RETRY_LATER',
});

export const PublicTranslationErrorDetailKinds = Object.freeze({
  PROVIDER: 'provider',
  MODEL: 'model',
  RETRY_AFTER: 'retry-after',
  LIMIT: 'limit',
});

export const PublicTranslationErrorSeverities = Object.freeze({
  WARNING: 'warning',
  ERROR: 'error',
});

const MAX_DETAIL_VALUE_LENGTH = 64;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._:-]*$/;
const SAFE_PARAM_KEYS = new Set(['provider', 'model', 'seconds', 'limit']);

function safeString(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > MAX_DETAIL_VALUE_LENGTH
    || !SAFE_IDENTIFIER_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000
    ? value
    : null;
}

function createSafeMessageParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;

  const safeParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (!SAFE_PARAM_KEYS.has(key)) continue;
    const safeValue = typeof value === 'string' ? safeString(value) : safeNumber(value);
    if (safeValue !== null) safeParams[key] = safeValue;
  }

  return Object.keys(safeParams).length > 0 ? Object.freeze(safeParams) : undefined;
}

function createSafeDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined;

  const allowedKinds = Object.values(PublicTranslationErrorDetailKinds);
  if (!allowedKinds.includes(detail.kind)) return undefined;

  const value = detail.kind === PublicTranslationErrorDetailKinds.RETRY_AFTER
    || detail.kind === PublicTranslationErrorDetailKinds.LIMIT
    ? safeNumber(detail.value)
    : safeString(detail.value);

  return value === null
    ? undefined
    : Object.freeze({ kind: detail.kind, value });
}

export function createPublicTranslationError({
  type,
  messageKey,
  messageParams,
  detail,
  action,
  severity = PublicTranslationErrorSeverities.ERROR,
  silent = false,
}) {
  const dto = {
    type,
    messageKey,
    ...(messageParams && { messageParams: createSafeMessageParams(messageParams) }),
    ...(detail && { detail: createSafeDetail(detail) }),
    ...(action && { action }),
    severity,
    silent: Boolean(silent),
  };

  if (!dto.messageParams) delete dto.messageParams;
  if (!dto.detail) delete dto.detail;
  return Object.freeze(dto);
}

export function createProviderDetail(providerId, providerName) {
  const value = safeString(providerId) || safeString(providerName);
  return value ? createSafeDetail({ kind: PublicTranslationErrorDetailKinds.PROVIDER, value }) : undefined;
}
