import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { reconstructTranslationError } from '@/shared/messaging/core/MessagingCore.js';

const translationRequestErrorMarker = Symbol('field-translation-request-error');
const markedErrors = new WeakSet();

/**
 * Marks an error known to originate from the Field translation request phase.
 * The marker is private, non-enumerable, and never crosses transport.
 *
 * @param {Error|object|string} error
 * @returns {Error|object}
 */
export function markFieldTranslationRequestError(error) {
  const canonicalError = error && typeof error === 'object'
    ? error
    : reconstructTranslationError(error);

  if (
    isCancellationError(canonicalError)
    || canonicalError.type === ErrorTypes.CONTEXT
    || canonicalError.type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
    || ExtensionContextManager.isContextError(canonicalError)
  ) {
    return canonicalError;
  }

  markedErrors.add(canonicalError);

  try {
    Object.defineProperty(canonicalError, translationRequestErrorMarker, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  } catch {
    // WeakSet marker remains available for non-extensible error-like objects.
  }

  return canonicalError;
}

/**
 * Checks whether error originated from Field translation request execution.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isFieldTranslationRequestError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && (
      markedErrors.has(error)
      || error[translationRequestErrorMarker] === true
    )
  );
}
