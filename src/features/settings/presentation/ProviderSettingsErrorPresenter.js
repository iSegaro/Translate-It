import ExtensionContextManager from '@/core/extensionContext.js'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js'

const UNKNOWN_ERROR_MESSAGE_KEY = 'ERRORS_UNKNOWN'
const CONTEXT_ERROR_MESSAGE_KEY = 'ERRORS_INVALID_CONTEXT'

/**
 * Converts provider-test exceptions into ApiKeyInput-compatible safe data.
 * Raw exception messages remain available only to internal logging callers.
 */
export function presentProviderSettingsError(error) {
  if (error?.type === ErrorTypes.CONTEXT
    || error?.type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
    || ExtensionContextManager.isContextError(error)) {
    return { messageKey: CONTEXT_ERROR_MESSAGE_KEY }
  }

  if (!error || typeof error !== 'object' || (!error.type && !error.originalType)) {
    return { messageKey: UNKNOWN_ERROR_MESSAGE_KEY }
  }

  const canonicalError = error.type
    ? error
    : { ...error, type: error.originalType }
  const publicError = mapCanonicalTranslationError(canonicalError)
  return {
    messageKey: publicError.messageKey || UNKNOWN_ERROR_MESSAGE_KEY,
    ...(publicError.messageParams && { params: publicError.messageParams }),
  }
}
