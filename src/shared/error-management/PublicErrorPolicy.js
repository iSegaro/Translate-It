/**
 * Public error-display policy.
 *
 * Defines the boundary between internal/runtime errors and errors that are safe
 * to present to users. It determines whether an error should be silent, shown
 * using its localized public type, or normalized to a generic translation
 * failure.
 *
 * This module owns public-display policy only. Error type detection remains in
 * ErrorMatcher, localized message resolution remains in ErrorMessages, and
 * final UI rendering remains the responsibility of each feature/ErrorHandler.
 *
 * Public display errors preserve the original error as `cause` so technical
 * diagnostics remain available without exposing internal/provider messages to
 * users.
 *
 * Current production consumers:
 * - SelectElementManager: sanitizes terminal Select Element translation errors
 *   before forwarding them to ErrorHandler.
 *
 * Other translation features do not currently use this policy and retain their
 * existing error-display behavior.
 */

import { ErrorTypes } from './ErrorTypes.js';
import { isCancellationError, isSilentError, matchErrorToType } from './ErrorMatcher.js';
import { errorMessages, getErrorMessage } from './ErrorMessages.js';

export const PublicErrorMessagePolicy = Object.freeze({
  SILENT: 'SILENT',
  LOCALIZED_TYPED: 'LOCALIZED_TYPED',
  LOCALIZED_GENERIC: 'LOCALIZED_GENERIC',
});

const INTERNAL_ERROR_TYPES = new Set([
  ErrorTypes.VALIDATION,
  ErrorTypes.API_RESPONSE_INVALID,
  ErrorTypes.JSON_PARSING_ERROR,
  ErrorTypes.UNEXPECTED_RESPONSE_FORMAT,
  ErrorTypes.NO_ACCEPTED_TRANSLATION_RESULTS,
  ErrorTypes.TRANSLATION_ERROR,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.UNKNOWN,
]);

export function getPublicErrorPolicy(errorOrType) {
  const type = typeof errorOrType === 'string'
    ? errorOrType
    : (errorOrType?.type || matchErrorToType(errorOrType));

  if (isCancellationError(errorOrType) || isSilentError(type)) {
    return { policy: PublicErrorMessagePolicy.SILENT, type };
  }

  if (INTERNAL_ERROR_TYPES.has(type)) {
    return {
      policy: PublicErrorMessagePolicy.LOCALIZED_GENERIC,
      type: ErrorTypes.TRANSLATION_FAILED,
      internalType: type,
    };
  }

  if (type === ErrorTypes.OPERATION_TIMEOUT) {
    return {
      policy: PublicErrorMessagePolicy.LOCALIZED_TYPED,
      type: ErrorTypes.TRANSLATION_TIMEOUT,
      internalType: type,
    };
  }

  if (errorMessages[type]) {
    return { policy: PublicErrorMessagePolicy.LOCALIZED_TYPED, type };
  }

  return {
    policy: PublicErrorMessagePolicy.LOCALIZED_GENERIC,
    type: ErrorTypes.TRANSLATION_FAILED,
    internalType: type,
  };
}

export async function createPublicDisplayError(originalError) {
  const resolved = getPublicErrorPolicy(originalError);
  if (resolved.policy === PublicErrorMessagePolicy.SILENT) return null;

  const message = await getErrorMessage(resolved.type);
  const displayError = new Error(message || errorMessages[resolved.type] || errorMessages[ErrorTypes.TRANSLATION_FAILED]);
  displayError.type = resolved.type;
  displayError.cause = originalError;

  if (originalError?.translationOutcome) {
    displayError.translationOutcome = originalError.translationOutcome;
  }

  return displayError;
}
