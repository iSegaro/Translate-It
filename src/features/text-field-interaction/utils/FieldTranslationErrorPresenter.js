import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import { reconstructTranslationError } from '@/shared/messaging/core/MessagingCore.js';

const EXCLUDED_ERROR_TYPES = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.USER_CANCELLED,
  ErrorTypes.TRANSLATION_CANCELLED,
]);

function normalizeCanonicalError(error) {
  return error instanceof Error ? error : reconstructTranslationError(error);
}

function isExcludedError(error) {
  return (
    isCancellationError(error)
    || EXCLUDED_ERROR_TYPES.has(error?.type)
    || ExtensionContextManager.isContextError(error)
  );
}

/**
 * Converts a confirmed ordinary Field translation failure into safe display data.
 *
 * Calling this helper is the explicit ownership assertion: callers must pass only
 * translation-request failures. Clipboard, field lifecycle, DOM, platform, and
 * strategy errors must remain on their existing Field-owned paths.
 *
 * This helper is presentation preparation only. It does not call ErrorHandler,
 * NotificationManager, or any toast/UI API.
 *
 * @param {Error|object|string} error - Confirmed ordinary translation failure
 * @returns {Promise<{canonicalError: Error, displayError: Error, publicError: object, canonicalType: string|null}|null>}
 */
export async function getFieldTranslationErrorPresentation(error) {
  const canonicalError = normalizeCanonicalError(error);

  if (isExcludedError(canonicalError)) return null;

  const publicError = mapCanonicalTranslationError(canonicalError);
  const displayError = await createLegacyDisplayError(canonicalError, publicError);
  if (!displayError) return null;

  return {
    canonicalError,
    displayError,
    publicError,
    canonicalType: canonicalError.type || null,
  };
}
