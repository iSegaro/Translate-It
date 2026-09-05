import ExtensionContextManager from '@/core/extensionContext.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import { reconstructTranslationError, isStructuredTranslationError } from '@/shared/messaging/core/MessagingCore.js';

function isSilentError(error) {
  return [ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED].includes(error.type)
    || isCancellationError(error)
    || ExtensionContextManager.isContextError(error);
}

/**
 * Prepares subtitle translation failure presentation without changing job state.
 * Missing or malformed details use a safe generic translation failure message.
 *
 * @param {Object} detail - Subtitle translation failure data
 * @returns {Promise<{kind: 'display', message: string, action?: string, error: Error}|{kind: 'silent'}>}
 */
export async function presentSubtitleTranslationError(detail = {}) {
  if (!isStructuredTranslationError(detail.errorDetails)) {
    const fallbackError = new Error();
    fallbackError.type = ErrorTypes.TRANSLATION_FAILED;
    const publicError = mapCanonicalTranslationError(fallbackError);
    const displayError = await createLegacyDisplayError(fallbackError, publicError);
    if (!displayError) return { kind: 'silent' };

    return {
      kind: 'display',
      message: displayError.message,
      action: publicError.action,
      error: displayError
    };
  }

  const canonicalError = reconstructTranslationError(detail.errorDetails);
  if (isSilentError(canonicalError)) {
    return { kind: 'silent' };
  }

  const publicError = mapCanonicalTranslationError(canonicalError);
  const displayError = await createLegacyDisplayError(canonicalError, publicError);
  if (!displayError) return { kind: 'silent' };

  return {
    kind: 'display',
    message: displayError.message,
    action: publicError.action,
    error: displayError
  };
}
