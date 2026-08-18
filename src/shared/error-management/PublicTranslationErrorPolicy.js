import { ErrorTypes } from './ErrorTypes.js';
import { isCancellationError } from './ErrorMatcher.js';
import {
  createProviderDetail,
  createPublicTranslationError,
  PublicTranslationErrorActions,
  PublicTranslationErrorSeverities,
  PublicTranslationErrorTypes,
} from './PublicTranslationError.js';

export const PublicTranslationErrorMessageKeys = Object.freeze({
  [PublicTranslationErrorTypes.MODEL_UNAVAILABLE]: 'ERRORS_MODEL_MISSING',
  [PublicTranslationErrorTypes.ELEMENT_TOO_LARGE]: 'ERRORS_ELEMENT_TOO_LARGE',
  [PublicTranslationErrorTypes.API_KEY_MISSING]: 'ERRORS_API_KEY_MISSING',
  [PublicTranslationErrorTypes.API_KEY_INVALID]: 'ERRORS_API_KEY_INVALID',
  [PublicTranslationErrorTypes.QUOTA_EXCEEDED]: 'ERRORS_QUOTA_EXCEEDED',
  [PublicTranslationErrorTypes.GEMINI_QUOTA_REGION]: 'ERRORS_GEMINI_QUOTA_REGION',
  [PublicTranslationErrorTypes.DEEPL_QUOTA_EXCEEDED]: 'ERRORS_DEEPL_QUOTA_EXCEEDED',
  [PublicTranslationErrorTypes.INSUFFICIENT_BALANCE]: 'ERRORS_INSUFFICIENT_BALANCE',
  [PublicTranslationErrorTypes.RATE_LIMITED]: 'ERRORS_RATE_LIMIT_REACHED',
  [PublicTranslationErrorTypes.MODEL_OVERLOADED]: 'ERRORS_MODEL_OVERLOADED',
  [PublicTranslationErrorTypes.API_FAILURE]: 'ERRORS_API_ERROR',
  [PublicTranslationErrorTypes.NETWORK_ERROR]: 'ERRORS_NETWORK_ERROR',
  [PublicTranslationErrorTypes.SERVER_ERROR]: 'ERRORS_SERVER_ERROR',
  [PublicTranslationErrorTypes.TRANSLATION_TIMEOUT]: 'ERRORS_TRANSLATION_TIMEOUT',
  [PublicTranslationErrorTypes.INVALID_RESPONSE]: 'ERRORS_API_RESPONSE_INVALID',
  [PublicTranslationErrorTypes.INVALID_INPUT]: 'ERRORS_INVALID_INPUT',
  [PublicTranslationErrorTypes.INVALID_REQUEST]: 'ERRORS_INVALID_REQUEST',
  [PublicTranslationErrorTypes.REQUEST_FAILURE]: 'ERRORS_HTTP_ERROR',
  [PublicTranslationErrorTypes.API_URL_MISSING]: 'ERRORS_API_URL_MISSING',
  [PublicTranslationErrorTypes.CONFIGURATION_INVALID]: 'ERRORS_API_CONFIG_INVALID',
  [PublicTranslationErrorTypes.ENDPOINT_INVALID]: 'ERRORS_API_ENDPOINT_INVALID',
  [PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE]: 'ERRORS_BROWSER_API_UNAVAILABLE',
  [PublicTranslationErrorTypes.ACCESS_DENIED]: 'ERRORS_FORBIDDEN_ERROR',
  [PublicTranslationErrorTypes.TEXT_EMPTY]: 'ERRORS_TEXT_EMPTY',
  [PublicTranslationErrorTypes.TEXT_TOO_LONG]: 'ERRORS_TEXT_TOO_LONG',
  [PublicTranslationErrorTypes.PROMPT_INVALID]: 'ERRORS_PROMPT_INVALID',
  [PublicTranslationErrorTypes.LANGUAGE_PAIR_UNSUPPORTED]: 'ERRORS_LANGUAGE_PAIR_NOT_SUPPORTED',
  [PublicTranslationErrorTypes.PROVIDER_TEMPORARILY_UNAVAILABLE]: 'ERRORS_CIRCUIT_BREAKER_OPEN',
  [PublicTranslationErrorTypes.TRANSLATION_NOT_FOUND]: 'ERRORS_TRANSLATION_NOT_FOUND',
  [PublicTranslationErrorTypes.TRANSLATION_FAILED]: 'ERRORS_TRANSLATION_FAILED',
});

const PUBLIC_TYPE_BY_INTERNAL_TYPE = new Map([
  [ErrorTypes.MODEL_MISSING, PublicTranslationErrorTypes.MODEL_UNAVAILABLE],
  [ErrorTypes.ELEMENT_TOO_LARGE, PublicTranslationErrorTypes.ELEMENT_TOO_LARGE],
  [ErrorTypes.API_KEY_MISSING, PublicTranslationErrorTypes.API_KEY_MISSING],
  [ErrorTypes.API_KEY_INVALID, PublicTranslationErrorTypes.API_KEY_INVALID],
  [ErrorTypes.QUOTA_EXCEEDED, PublicTranslationErrorTypes.QUOTA_EXCEEDED],
  [ErrorTypes.GEMINI_QUOTA_REGION, PublicTranslationErrorTypes.GEMINI_QUOTA_REGION],
  [ErrorTypes.DEEPL_QUOTA_EXCEEDED, PublicTranslationErrorTypes.DEEPL_QUOTA_EXCEEDED],
  [ErrorTypes.INSUFFICIENT_BALANCE, PublicTranslationErrorTypes.INSUFFICIENT_BALANCE],
  [ErrorTypes.RATE_LIMIT_REACHED, PublicTranslationErrorTypes.RATE_LIMITED],
  [ErrorTypes.MODEL_OVERLOADED, PublicTranslationErrorTypes.MODEL_OVERLOADED],
  [ErrorTypes.API_ERROR, PublicTranslationErrorTypes.API_FAILURE],
  [ErrorTypes.NETWORK_ERROR, PublicTranslationErrorTypes.NETWORK_ERROR],
  [ErrorTypes.SERVER_ERROR, PublicTranslationErrorTypes.SERVER_ERROR],
  [ErrorTypes.TRANSLATION_TIMEOUT, PublicTranslationErrorTypes.TRANSLATION_TIMEOUT],
  [ErrorTypes.OPERATION_TIMEOUT, PublicTranslationErrorTypes.TRANSLATION_TIMEOUT],
  [ErrorTypes.API_RESPONSE_INVALID, PublicTranslationErrorTypes.INVALID_RESPONSE],
  [ErrorTypes.JSON_PARSING_ERROR, PublicTranslationErrorTypes.INVALID_RESPONSE],
  [ErrorTypes.UNEXPECTED_RESPONSE_FORMAT, PublicTranslationErrorTypes.INVALID_RESPONSE],
  [ErrorTypes.VALIDATION, PublicTranslationErrorTypes.INVALID_INPUT],
  [ErrorTypes.TEXT_EMPTY, PublicTranslationErrorTypes.TEXT_EMPTY],
  [ErrorTypes.TEXT_TOO_LONG, PublicTranslationErrorTypes.TEXT_TOO_LONG],
  [ErrorTypes.PROMPT_INVALID, PublicTranslationErrorTypes.PROMPT_INVALID],
  [ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED, PublicTranslationErrorTypes.LANGUAGE_PAIR_UNSUPPORTED],
  [ErrorTypes.CIRCUIT_BREAKER_OPEN, PublicTranslationErrorTypes.PROVIDER_TEMPORARILY_UNAVAILABLE],
  [ErrorTypes.TRANSLATION_NOT_FOUND, PublicTranslationErrorTypes.TRANSLATION_NOT_FOUND],
  [ErrorTypes.INVALID_REQUEST, PublicTranslationErrorTypes.INVALID_REQUEST],
  [ErrorTypes.HTTP_ERROR, PublicTranslationErrorTypes.REQUEST_FAILURE],
  [ErrorTypes.API_URL_MISSING, PublicTranslationErrorTypes.API_URL_MISSING],
  [ErrorTypes.API_CONFIG_INVALID, PublicTranslationErrorTypes.CONFIGURATION_INVALID],
  [ErrorTypes.API_ENDPOINT_INVALID, PublicTranslationErrorTypes.ENDPOINT_INVALID],
  [ErrorTypes.BROWSER_API_UNAVAILABLE, PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE],
  [ErrorTypes.FORBIDDEN_ERROR, PublicTranslationErrorTypes.ACCESS_DENIED],
  [ErrorTypes.TRANSLATION_FAILED, PublicTranslationErrorTypes.TRANSLATION_FAILED],
]);

const GENERIC_INTERNAL_TYPES = new Set([
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.API_ERROR,
  ErrorTypes.TRANSLATION_ERROR,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.UNKNOWN,
]);

// Only canonical semantic identities may refine generic transport identities.
export const PUBLIC_TRANSLATION_ORIGINAL_TYPE_ALLOWLIST = new Set([
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA_REGION,
  ErrorTypes.DEEPL_QUOTA_EXCEEDED,
  ErrorTypes.INSUFFICIENT_BALANCE,
  ErrorTypes.RATE_LIMIT_REACHED,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.NETWORK_ERROR,
  ErrorTypes.SERVER_ERROR,
  ErrorTypes.API_RESPONSE_INVALID,
  ErrorTypes.JSON_PARSING_ERROR,
  ErrorTypes.UNEXPECTED_RESPONSE_FORMAT,
  ErrorTypes.VALIDATION,
  ErrorTypes.INVALID_REQUEST,
]);

function resolvePublicType(error) {
  const internalType = error?.type;
  const directType = PUBLIC_TYPE_BY_INTERNAL_TYPE.get(internalType);

  if (directType && !GENERIC_INTERNAL_TYPES.has(internalType)) return directType;

  if (
    GENERIC_INTERNAL_TYPES.has(internalType)
    && PUBLIC_TRANSLATION_ORIGINAL_TYPE_ALLOWLIST.has(error?.originalType)
  ) {
    return PUBLIC_TYPE_BY_INTERNAL_TYPE.get(error.originalType);
  }

  if (internalType === ErrorTypes.HTTP_ERROR) {
    return PublicTranslationErrorTypes.REQUEST_FAILURE;
  }

  return directType || PublicTranslationErrorTypes.TRANSLATION_FAILED;
}

function getAction(type) {
  switch (type) {
    case PublicTranslationErrorTypes.MODEL_UNAVAILABLE:
    case PublicTranslationErrorTypes.API_KEY_MISSING:
    case PublicTranslationErrorTypes.API_KEY_INVALID:
    case PublicTranslationErrorTypes.QUOTA_EXCEEDED:
    case PublicTranslationErrorTypes.INSUFFICIENT_BALANCE:
    case PublicTranslationErrorTypes.INVALID_REQUEST:
    case PublicTranslationErrorTypes.API_URL_MISSING:
    case PublicTranslationErrorTypes.CONFIGURATION_INVALID:
    case PublicTranslationErrorTypes.ENDPOINT_INVALID:
      return PublicTranslationErrorActions.OPEN_SETTINGS;
    case PublicTranslationErrorTypes.REQUEST_FAILURE:
    case PublicTranslationErrorTypes.MODEL_OVERLOADED:
    case PublicTranslationErrorTypes.NETWORK_ERROR:
    case PublicTranslationErrorTypes.SERVER_ERROR:
    case PublicTranslationErrorTypes.TRANSLATION_FAILED:
      return PublicTranslationErrorActions.RETRY;
    case PublicTranslationErrorTypes.RATE_LIMITED:
      return PublicTranslationErrorActions.RETRY_LATER;
    default:
      return undefined;
  }
}

function getSeverity(type) {
  return [
    PublicTranslationErrorTypes.ELEMENT_TOO_LARGE,
    PublicTranslationErrorTypes.API_FAILURE,
    PublicTranslationErrorTypes.INVALID_RESPONSE,
    PublicTranslationErrorTypes.INVALID_INPUT,
    PublicTranslationErrorTypes.CONFIGURATION_INVALID,
    PublicTranslationErrorTypes.ENDPOINT_INVALID,
    PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE,
    PublicTranslationErrorTypes.TRANSLATION_NOT_FOUND,
    PublicTranslationErrorTypes.TRANSLATION_FAILED,
  ].includes(type)
    ? PublicTranslationErrorSeverities.ERROR
    : PublicTranslationErrorSeverities.WARNING;
}

/**
 * Maps canonical translation errors to safe public semantics.
 * No raw message parsing or diagnostic field copying occurs here.
 */
export function mapCanonicalTranslationError(error) {
  if (isCancellationError(error)) {
    return createPublicTranslationError({
      type: PublicTranslationErrorTypes.TRANSLATION_FAILED,
      messageKey: PublicTranslationErrorMessageKeys[PublicTranslationErrorTypes.TRANSLATION_FAILED],
      severity: PublicTranslationErrorSeverities.WARNING,
      silent: true,
    });
  }

  const type = resolvePublicType(error);
  const detail = [
    PublicTranslationErrorTypes.MODEL_UNAVAILABLE,
    PublicTranslationErrorTypes.API_KEY_MISSING,
    PublicTranslationErrorTypes.API_KEY_INVALID,
    PublicTranslationErrorTypes.QUOTA_EXCEEDED,
    PublicTranslationErrorTypes.INSUFFICIENT_BALANCE,
  ].includes(type)
    ? createProviderDetail(error?.providerId, error?.providerName)
    : undefined;

  return createPublicTranslationError({
    type,
    messageKey: PublicTranslationErrorMessageKeys[type],
    detail,
    action: getAction(type),
    severity: getSeverity(type),
    silent: false,
  });
}
