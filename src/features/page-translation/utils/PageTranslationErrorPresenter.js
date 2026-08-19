import ExtensionContextManager from '@/core/extensionContext.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import { reconstructTranslationError } from '@/shared/messaging/core/MessagingCore.js';

function getCanonicalSource(detail) {
  if (
    detail?.errorDetails
    && typeof detail.errorDetails === 'object'
    && typeof detail.errorDetails.message === 'string'
  ) {
    return detail.errorDetails;
  }

  if (detail?.error && typeof detail.error === 'object') {
    return detail.error;
  }

  return {
    message: typeof detail?.error === 'string' ? detail.error : 'Translation failed',
    type: detail?.errorType,
  };
}

/**
 * Converts Page translation failure data into safe display data.
 * Structured errorDetails always outrank legacy error fields.
 *
 * @param {Object} detail - Page translation error event data
 * @returns {Promise<Error|null>} Safe localized display Error, or null for silent errors
 */
export async function getPageTranslationErrorPresentation(detail) {
  const canonicalError = reconstructTranslationError(getCanonicalSource(detail));

  if (
    [ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED].includes(canonicalError.type)
    || isCancellationError(canonicalError)
    || ExtensionContextManager.isContextError(canonicalError)
  ) {
    return null;
  }

  const publicError = mapCanonicalTranslationError(canonicalError);
  return createLegacyDisplayError(canonicalError, publicError);
}
