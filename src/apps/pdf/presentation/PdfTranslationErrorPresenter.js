import ExtensionContextManager from '@/core/extensionContext.js'
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js'
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js'
import { reconstructTranslationError } from '@/shared/messaging/core/MessagingCore.js'

function hasValidErrorDetails(errorDetails) {
  return errorDetails
    && typeof errorDetails === 'object'
    && typeof errorDetails.message === 'string'
}

function isSilentError(error) {
  return [ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED].includes(error.type)
    || isCancellationError(error)
    || ExtensionContextManager.isContextError(error)
}

/**
 * Prepares PDF translation failure presentation without changing PDF domain state.
 * failureReason remains PDF operational metadata and never replaces canonical type.
 *
 * @param {Object} detail - PDF translation failure data
 * @returns {Promise<{kind: 'display', message: string, error: Error}|{kind: 'silent'}|{kind: 'legacy'}>}
 */
export async function presentPdfTranslationError(detail = {}) {
  if (!hasValidErrorDetails(detail.errorDetails)) {
    return { kind: 'legacy' }
  }

  const canonicalError = reconstructTranslationError(detail.errorDetails)
  if (isSilentError(canonicalError)) {
    return { kind: 'silent' }
  }

  const publicError = mapCanonicalTranslationError(canonicalError)
  const displayError = await createLegacyDisplayError(canonicalError, publicError)
  if (!displayError) return { kind: 'silent' }

  return {
    kind: 'display',
    message: displayError.message,
    error: displayError,
  }
}
