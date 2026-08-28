import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { PublicTranslationErrorActions } from '@/shared/error-management/PublicTranslationError.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';

const EXCLUDED_ERROR_TYPES = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.USER_CANCELLED,
  ErrorTypes.TRANSLATION_CANCELLED,
]);

const isExcludedError = (error) => (
  isCancellationError(error)
  || EXCLUDED_ERROR_TYPES.has(error?.type)
  || ExtensionContextManager.isContextError(error)
);

/**
 * Converts canonical translation failures into Selection Window display data.
 * Runtime consumers remain responsible for window state and event handling.
 *
 * @param {Error|object|string} canonicalError
 * @param {string} context
 * @param {{ getErrorForUI: Function }} errorHandler
 * @returns {Promise<{displayError: Error, errorInfo: object, canonicalType: string|null}|null>}
 */
export async function getSelectionWindowErrorPresentation(canonicalError, context, errorHandler) {
  if (isExcludedError(canonicalError)) return null;

  const publicError = mapCanonicalTranslationError(canonicalError);
  const displayError = await createLegacyDisplayError(canonicalError, publicError);
  if (!displayError) return null;

  const errorInfo = await errorHandler.getErrorForUI(displayError, context);
  errorInfo.canRetry = publicError.action === PublicTranslationErrorActions.RETRY;
  errorInfo.needsSettings = publicError.action === PublicTranslationErrorActions.OPEN_SETTINGS;

  return {
    displayError,
    errorInfo,
    canonicalType: canonicalError?.type || null,
  };
}
