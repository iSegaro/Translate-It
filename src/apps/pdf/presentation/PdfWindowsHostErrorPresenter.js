// src/apps/pdf/presentation/PdfWindowsHostErrorPresenter.js
// PDF windows-host local translation error presenter.
// Owns only PDF windows-host presentation. It must not be imported by
// feature-owned managers (see SelectionWindowErrorPresenter for those).

import ExtensionContextManager from '@/core/extensionContext.js'
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js'
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js'
import { PublicTranslationErrorActions } from '@/shared/error-management/PublicTranslationError.js'
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js'
import { reconstructTranslationError } from '@/shared/messaging/core/MessagingCore.js'

/**
 * Determines whether an error carries canonical translation identity.
 * Untyped local/operational errors are intentionally excluded so they keep
 * their existing windows-host presentation and are never mislabeled as
 * translation failures.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTranslationDomainError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && typeof error.type === 'string'
    && error.type.length > 0
  )
}

function isSilentError(error) {
  return isCancellationError(error) || ExtensionContextManager.isContextError(error)
}

/**
 * Converts a PDF windows-host translation failure into safe display text.
 *
 * Returns null for silent failures (cancellation/context invalidation) so
 * callers keep the error area clear instead of showing a fabricated message.
 * Untyped local/operational errors must be gated by the caller with
 * {@link isTranslationDomainError} before this helper is invoked.
 *
 * @param {Error|object|string} errorLike - Confirmed translation-request failure
 * @returns {Promise<string|null>}
 */
export async function getPdfWindowsHostTranslationPresentation(errorLike) {
  const canonicalError = reconstructTranslationError(errorLike)

  if (isSilentError(canonicalError)) return null

  const publicError = mapCanonicalTranslationError(canonicalError)
  const displayError = await createLegacyDisplayError(canonicalError, publicError)
  if (!displayError) return null

  return {
    message: displayError.message,
    canRetry: publicError.action === PublicTranslationErrorActions.RETRY,
  }
}

export async function presentPdfWindowsHostTranslationError(errorLike) {
  const presentation = await getPdfWindowsHostTranslationPresentation(errorLike)
  return presentation?.message || null
}
