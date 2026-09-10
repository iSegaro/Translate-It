// src/features/text-field-interaction/utils/framework/framework-compat/fieldSourceSnapshot.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Use scoped cached logger (consistent with selectionUtils.js)
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'fieldSourceSnapshot');

/**
 * Captured source for a field translation request.
 * @typedef {Object} FieldTranslationSource
 * @property {string} text - Exact text submitted for translation (selected substring or full value).
 * @property {{start:number,end:number}|null} selectionRange - Request-time range for INPUT/TEXTAREA, else null.
 * @property {{scope:'selection'|'full',expectedSourceText:string|null}|null} sourceSnapshot - Request-time scope descriptor carrying the one canonical source-identity field, else null.
 */

/**
 * Canonical request-time Field source scope for normal INPUT/TEXTAREA.
 * This is the single structured shape consumed on the apply path. It is
 * authoritative: later caret/selection movement must NEVER change it; only a
 * source-text edit invalidates it. Validation reads exactly one descriptor
 * field (`expectedSourceText`): the selected substring for selection scope,
 * the full value for full scope.
 * @typedef {Object} FieldSourceScope
 * @property {'selection'|'full'|'invalid'} scope - 'selection' replaces only the captured range; 'full' replaces the whole field; 'invalid' is a present-but-malformed descriptor that must fail closed (no mutation).
 * @property {{start:number,end:number}|null} range - Captured offsets when scope is 'selection', else null.
 * @property {string|null} expectedSourceText - Exact source text submitted at request time.
 */

/**
 * Scope marker for a present-but-malformed descriptor. Unlike absent (null,
 * legacy callers keep the live-DOM fallback), invalid must fail closed.
 */
export const INVALID_FIELD_SCOPE = 'invalid';

/**
 * Capture the translation source for a field element at request time.
 *
 * For normal INPUT/TEXTAREA: when selectionStart/End are valid numbers and
 * non-collapsed, the exact selected substring is captured with its {start,end}
 * range plus an explicit scope descriptor. Otherwise the full value is captured
 * with an explicit full scope carrying the full value as source identity, so a
 * later text edit (not mere caret/selection movement) invalidates the apply.
 *
 * For contentEditable: preserves existing behavior (full textContent, null range).
 * contentEditable ranges are intentionally NOT refactored here.
 *
 * MV3 + Chrome/Firefox compatible. No provider changes, no new deps.
 *
 * @param {HTMLElement} element - Target field element
 * @returns {FieldTranslationSource} Captured source snapshot
 */
export function captureFieldTranslationSource(element) {
  if (!element) {
    return { text: '', selectionRange: null, sourceSnapshot: null };
  }

  try {
    const tagName = element.tagName;

    // Normal INPUT/TEXTAREA: selection defines the source.
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      const fullValue = element.value ?? '';

      let start = null;
      let end = null;
      try {
        start = element.selectionStart;
        end = element.selectionEnd;
      } catch {
        // Some input types (e.g. number/date) throw or report null for selection.
        logger.debug('captureFieldTranslationSource: selection unreadable, using full value', {
          tagName,
          type: element.type,
        });
        return { text: fullValue, selectionRange: null, sourceSnapshot: { scope: 'full', expectedSourceText: fullValue } };
      }

      const isValidRange =
        typeof start === 'number' &&
        typeof end === 'number' &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start !== end &&
        start >= 0 &&
        end <= fullValue.length &&
        start < end;

      if (isValidRange) {
        const selectedText = fullValue.substring(start, end);
        logger.debug('captureFieldTranslationSource: selected text captured', {
          tagName,
          start,
          end,
          textLength: selectedText.length,
        });
        return {
          text: selectedText,
          selectionRange: { start, end },
          sourceSnapshot: {
            scope: 'selection',
            expectedSourceText: selectedText,
          },
        };
      }

      logger.debug('captureFieldTranslationSource: no selection, using full value', {
        tagName,
        textLength: fullValue.length,
      });
      return { text: fullValue, selectionRange: null, sourceSnapshot: { scope: 'full', expectedSourceText: fullValue } };
    }

    // contentEditable: preserve existing behavior (full text, no range refactor).
    if (element.isContentEditable || element.contentEditable === 'true') {
      const fullText = element.textContent ?? '';
      logger.debug('captureFieldTranslationSource: contentEditable full text', {
        textLength: fullText.length,
      });
      return { text: fullText, selectionRange: null, sourceSnapshot: null };
    }

    // Fallback for other elements: preserve legacy value/textContent behavior.
    const fallbackText = element.value ?? element.textContent ?? '';
    return { text: fallbackText, selectionRange: null, sourceSnapshot: null };
  } catch (error) {
    logger.warn('captureFieldTranslationSource error, falling back to legacy read', error);
    try {
      const fallbackText = element.value ?? element.textContent ?? '';
      return { text: fallbackText, selectionRange: null, sourceSnapshot: null };
    } catch {
      return { text: '', selectionRange: null, sourceSnapshot: null };
    }
  }
}

/**
 * Normalize a wire-level (selectionRange, sourceSnapshot) pair into the canonical
 * {@link FieldSourceScope} consumed on the apply path.
 *
 * Three outcomes, deliberately distinct:
 * - null = ABSENT (no descriptor captured, e.g. legacy direct callers or
 *   contentEditable): the live-DOM fallback stays allowed.
 * - {scope:'selection'|'full', ...} = VALID: authoritative, live selection ignored.
 * - {scope:'invalid', ...} = PRESENT-BUT-MALFORMED (unknown scope, selection
 *   scope with null range or missing expected text): fail closed, no mutation.
 *
 * @param {{start:number,end:number}|null} selectionRange - Stored request-time range
 * @param {{scope:string,expectedSourceText:string|null}|null} sourceSnapshot - Stored request-time scope descriptor
 * @returns {FieldSourceScope|null} Canonical scope, invalid marker, or null when absent
 */
export function getFieldSourceScope(selectionRange, sourceSnapshot) {
  // Absent descriptor: nothing was captured (legacy callers, contentEditable).
  if (sourceSnapshot == null) return null;

  const scope = sourceSnapshot?.scope ?? null;

  if (scope === 'full') {
    // Full scope carries the whole request-time value as source identity; a
    // missing identity cannot be validated fail-closed, so it is invalid.
    const expectedSourceText = sourceSnapshot?.expectedSourceText ?? null;
    if (typeof expectedSourceText !== 'string') {
      logger.debug('getFieldSourceScope: full descriptor without expected text, marking invalid');
      return { scope: INVALID_FIELD_SCOPE, range: null, expectedSourceText: null };
    }
    return { scope: 'full', range: null, expectedSourceText };
  }

  if (scope === 'selection') {
    // A usable range plus the exact expected text are both required. Without
    // the expected text we cannot validate staleness fail-closed.
    const { start, end } = selectionRange ?? {};
    const expectedSourceText = sourceSnapshot?.expectedSourceText ?? null;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start === end ||
      typeof expectedSourceText !== 'string'
    ) {
      logger.debug('getFieldSourceScope: incomplete selection descriptor, marking invalid');
      return { scope: INVALID_FIELD_SCOPE, range: null, expectedSourceText: null };
    }

    return { scope: 'selection', range: { start, end }, expectedSourceText };
  }

  // Present but unrecognized (unknown scope string, non-object shape, ...):
  // fail closed rather than falling back to a live selection that was never captured.
  logger.debug('getFieldSourceScope: unrecognized descriptor, marking invalid');
  return { scope: INVALID_FIELD_SCOPE, range: null, expectedSourceText: null };
}

/**
 * Validate a canonical Field source scope against the live element.
 *
 * Used on the apply path so translation output never depends on the live
 * DOM selection after the async request. Returns true when the apply may
 * proceed; false means the source was edited (fail safely = no overwrite).
 *
 * Both scopes validate source identity against the single descriptor field:
 * selection checks bounds plus the live substring at [start,end]; full checks
 * the live full value. Caret/selection-only movement never changes element
 * value, so it never invalidates either scope. Absent descriptors (legacy
 * callers) stay valid; latest-request ownership and cancellation still apply
 * around this check, unchanged.
 *
 * @param {HTMLElement} element - Live target element
 * @param {FieldSourceScope|null} fieldSource - Canonical request-time scope (null = absent)
 * @returns {boolean} Whether the scope still matches the live field
 */
export function validateFieldSourceSnapshot(element, fieldSource) {
  // Absent descriptor (legacy callers): nothing extra to validate.
  if (!fieldSource) return true;
  // Present-but-malformed descriptor: fail closed, never mutate.
  if (fieldSource.scope === INVALID_FIELD_SCOPE) return false;
  if (!element) return false;

  try {
    // Only INPUT/TEXTAREA carry request-time source identity; anything else
    // cannot be validated here.
    if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') return true;

    if (fieldSource.scope === 'full') {
      // Full-identity guard: any text edit (append, delete, change) before
      // settle refuses the replace; caret/selection movement is harmless.
      const liveValue = element.value ?? '';
      if (liveValue !== fieldSource.expectedSourceText) {
        logger.debug('validateFieldSourceSnapshot: full value changed, refusing replace');
        return false;
      }
      return true;
    }

    if (fieldSource.scope !== 'selection') return false;

    const { start, end } = fieldSource.range ?? {};
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start === end
    ) {
      logger.debug('validateFieldSourceSnapshot: invalid range, refusing partial replace', { start, end });
      return false;
    }

    const currentValue = element.value ?? '';
    if (end > currentValue.length) {
      logger.debug('validateFieldSourceSnapshot: range out of bounds, source edited', {
        start,
        end,
        currentLength: currentValue.length,
      });
      return false;
    }

    // Stale-source guard: the exact selected text must still sit at [start,end].
    // A mismatch means the user edited the source before settle -> no overwrite.
    const liveSlice = currentValue.substring(start, end);
    if (liveSlice !== fieldSource.expectedSourceText) {
      logger.debug('validateFieldSourceSnapshot: source text changed, refusing partial replace');
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('validateFieldSourceSnapshot error, refusing partial replace', error);
    return false;
  }
}

/**
 * Resolve the authoritative (start, end) for a native INPUT/TEXTAREA replacement.
 *
 * Single canonical scope-resolution point for every Field strategy: when
 * `applicationContext.fieldSource` carries a request-time scope, the captured
 * scope wins over both the passed args and the live DOM selection. Otherwise
 * the passed args flow through untouched (legacy live-DOM behavior preserved).
 * contentEditable elements are never touched here.
 *
 * @param {HTMLElement} element - Target element
 * @param {number|null} start - Passed start (may be live-derived or null)
 * @param {number|null} end - Passed end (may be live-derived or null)
 * @param {Object|null} applicationContext - Latest-request guard ({isCurrent, fieldSource})
 * @returns {{start:number|null,end:number|null,refused:boolean}} Authoritative range; refused=true means stale (caller must not mutate)
 */
export function resolveScopedInputRange(element, start, end, applicationContext = null) {
  const fieldSource = applicationContext?.fieldSource ?? null;
  const isNativeInput = !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');

  // No descriptor (legacy direct callers), non-native targets, or contentEditable:
  // preserve existing behavior exactly.
  if (!fieldSource || !isNativeInput || element.isContentEditable) {
    return { start, end, refused: false };
  }

  if (fieldSource.scope === 'selection') {
    // Stale-source guard first: edited source must never be overwritten.
    if (!validateFieldSourceSnapshot(element, fieldSource)) {
      return { start, end, refused: true };
    }
    return { start: fieldSource.range.start, end: fieldSource.range.end, refused: false };
  }

  // Present-but-malformed descriptor: fail closed, never mutate.
  if (fieldSource.scope === INVALID_FIELD_SCOPE) {
    logger.debug('resolveScopedInputRange: invalid scope, refusing replace');
    return { start, end, refused: true };
  }

  if (fieldSource.scope === 'full') {
    // Authoritative full-field: force whole-value replacement even when the user
    // selected (or moved the caret into) a sub-range while the request was in flight.
    // The identity check above already rejected any text edit, so the live
    // length equals the captured length here.
    if (!validateFieldSourceSnapshot(element, fieldSource)) {
      return { start, end, refused: true };
    }
    try {
      const fullLength = (element.value ?? '').length;
      return { start: 0, end: fullLength, refused: false };
    } catch (error) {
      logger.warn('resolveScopedInputRange: unreadable full value, refusing replace', error);
      return { start, end, refused: true };
    }
  }

  // Unknown scope shape: fail closed rather than guessing.
  logger.debug('resolveScopedInputRange: unknown scope, refusing replace');
  return { start, end, refused: true };
}
