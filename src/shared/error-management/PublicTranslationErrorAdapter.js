import { ErrorTypes } from './ErrorTypes.js';
import { getErrorMessage } from './ErrorMessages.js';
import {
  PublicTranslationErrorTypes,
} from './PublicTranslationError.js';
import {
  PublicTranslationErrorMessageKeys,
} from './PublicTranslationErrorPolicy.js';

export const PUBLIC_TO_LEGACY_ERROR_TYPES = Object.freeze({
  [PublicTranslationErrorTypes.MODEL_UNAVAILABLE]: ErrorTypes.MODEL_MISSING,
  [PublicTranslationErrorTypes.API_KEY_MISSING]: ErrorTypes.API_KEY_MISSING,
  [PublicTranslationErrorTypes.API_KEY_INVALID]: ErrorTypes.API_KEY_INVALID,
  [PublicTranslationErrorTypes.QUOTA_EXCEEDED]: ErrorTypes.QUOTA_EXCEEDED,
  [PublicTranslationErrorTypes.INSUFFICIENT_BALANCE]: ErrorTypes.INSUFFICIENT_BALANCE,
  [PublicTranslationErrorTypes.RATE_LIMITED]: ErrorTypes.RATE_LIMIT_REACHED,
  [PublicTranslationErrorTypes.MODEL_OVERLOADED]: ErrorTypes.MODEL_OVERLOADED,
  [PublicTranslationErrorTypes.NETWORK_ERROR]: ErrorTypes.NETWORK_ERROR,
  [PublicTranslationErrorTypes.SERVER_ERROR]: ErrorTypes.SERVER_ERROR,
  [PublicTranslationErrorTypes.TRANSLATION_TIMEOUT]: ErrorTypes.TRANSLATION_TIMEOUT,
  [PublicTranslationErrorTypes.INVALID_RESPONSE]: ErrorTypes.API_RESPONSE_INVALID,
  [PublicTranslationErrorTypes.INVALID_INPUT]: ErrorTypes.VALIDATION,
  [PublicTranslationErrorTypes.INVALID_REQUEST]: ErrorTypes.INVALID_REQUEST,
  [PublicTranslationErrorTypes.TRANSLATION_FAILED]: ErrorTypes.TRANSLATION_FAILED,
});

const TEMPORARY_MESSAGE_KEY_FALLBACKS = Object.freeze({
  ERRORS_INVALID_INPUT: 'ERRORS_TRANSLATION_FAILED',
});

function getLegacyType(publicError) {
  return PUBLIC_TO_LEGACY_ERROR_TYPES[publicError?.type] || ErrorTypes.TRANSLATION_FAILED;
}

function getMessageKey(publicError) {
  const messageKey = publicError?.messageKey;
  return TEMPORARY_MESSAGE_KEY_FALLBACKS[messageKey]
    || messageKey
    || PublicTranslationErrorMessageKeys[PublicTranslationErrorTypes.TRANSLATION_FAILED];
}

/**
 * Adapts a public semantic DTO to the legacy ErrorHandler contract.
 *
 * This is migration infrastructure only. Actions and safe detail remain in
 * the DTO and are intentionally not copied to the legacy Error.
 */
export async function createLegacyDisplayError(canonicalError, publicError) {
  if (!publicError || publicError.silent) return null;

  const displayError = new Error(await getErrorMessage(getMessageKey(publicError)));
  displayError.type = getLegacyType(publicError);

  // Keep diagnostics available to the current handler without exposing them
  // through enumerable Error fields or the public DTO.
  Object.defineProperty(displayError, 'cause', {
    configurable: true,
    enumerable: false,
    value: canonicalError,
    writable: false,
  });

  return displayError;
}
