// src/features/text-field-interaction/utils/framework/framework-compat/fieldSourceSnapshot.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  serializeContentEditableText,
  getContentEditableSelection,
  bookmarkContentEditableRange,
  isValidContentEditableBookmark,
  validateContentEditableSelection,
  validateContentEditableFull,
} from './contentEditableScope.js';

// Use scoped cached logger (consistent with selectionUtils.js)
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'fieldSourceSnapshot');

/**
 * Captured source for a field translation request.
 * @typedef {Object} FieldTranslationSource
 * @property {string} text - Exact text submitted for translation (selected substring or full value).
 * @property {{start:number,end:number}|null} selectionRange - Request-time range for INPUT/TEXTAREA only, else null.
 * @property {{scope:'selection'|'full',targetKind:'native'|'contenteditable',expectedSourceText:string|null,bookmark:Object|null}|null} sourceSnapshot - Request-time scope descriptor carrying the one canonical source-identity field, else null.
 */

/**
 * Canonical request-time Field source scope (native INPUT/TEXTAREA and contentEditable).
 * This is the single structured shape consumed on the apply path. It is
 * authoritative: later caret/selection movement must NEVER change it; only a
 * source-text edit invalidates it. Validation reads exactly one descriptor
 * field (`expectedSourceText`). Native selections use `range` offsets;
 * contentEditable selections use the serializable `bookmark` (never overloaded
 * onto native offsets); no Range/Selection/node refs are ever persisted.
 * @typedef {Object} FieldSourceScope
 * @property {'selection'|'full'|'invalid'} scope - 'selection' replaces only the captured range; 'full' replaces the whole field; 'invalid' is a present-but-malformed descriptor that must fail closed (no mutation).
 * @property {'native'|'contenteditable'} targetKind - Field technology; selects the range representation and validator.
 * @property {{start:number,end:number}|null} range - Captured offsets for native selections, else null.
 * @property {Object|null} bookmark - Serializable root-relative DOM bookmark for contentEditable selections, else null.
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
 * For contentEditable: a non-collapsed window selection contained in the target
 * captures the selected text only (canonical newlines) with a serializable
 * root-relative DOM bookmark; otherwise the full canonical visible text
 * (block-structure serialization, NOT raw flattened textContent) is captured
 * with a full scope. Internal whitespace/newlines are preserved, never trimmed.
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
        return { text: fullValue, selectionRange: null, sourceSnapshot: { scope: 'full', targetKind: 'native', expectedSourceText: fullValue } };
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
            targetKind: 'native',
            expectedSourceText: selectedText,
          },
        };
      }

      logger.debug('captureFieldTranslationSource: no selection, using full value', {
        tagName,
        textLength: fullValue.length,
      });
      return { text: fullValue, selectionRange: null, sourceSnapshot: { scope: 'full', targetKind: 'native', expectedSourceText: fullValue } };
    }

    // contentEditable: a non-collapsed selection contained in the target
    // captures the selected text only (canonical newlines) with a serializable
    // root-relative DOM bookmark; otherwise the full canonical visible text
    // (block-structure serialization, NOT raw flattened textContent).
    if (element.isContentEditable || element.contentEditable === 'true') {
      const contained = getContentEditableSelection(element);
      if (contained) {
        const bookmark = bookmarkContentEditableRange(element, contained.range);
        if (bookmark) {
          logger.debug('captureFieldTranslationSource: contentEditable selection captured', {
            textLength: contained.text.length,
          });
          return {
            text: contained.text,
            selectionRange: null,
            sourceSnapshot: {
              scope: 'selection',
              targetKind: 'contenteditable',
              bookmark,
              expectedSourceText: contained.text,
            },
          };
        }
        logger.debug('captureFieldTranslationSource: selection unmappable, using full canonical text');
      }
      const fullText = serializeContentEditableText(element);
      logger.debug('captureFieldTranslationSource: contentEditable full canonical text', {
        textLength: fullText.length,
      });
      return {
        text: fullText,
        selectionRange: null,
        sourceSnapshot: { scope: 'full', targetKind: 'contenteditable', expectedSourceText: fullText },
      };
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
 * - null = ABSENT (no descriptor captured, e.g. legacy direct callers):
 *   the live-DOM fallback stays allowed.
 * - {scope:'selection'|'full', ...} = VALID: authoritative, live selection ignored.
 * - {scope:'invalid', ...} = PRESENT-BUT-MALFORMED (unknown scope or kind,
 *   selection scope with unusable range/bookmark or missing expected text):
 *   fail closed, no mutation.
 *
 * @param {{start:number,end:number}|null} selectionRange - Stored request-time range (native only)
 * @param {{scope:string,targetKind:string,bookmark:Object|null,expectedSourceText:string|null}|null} sourceSnapshot - Stored request-time scope descriptor
 * @returns {FieldSourceScope|null} Canonical scope, invalid marker, or null when absent
 */
export function getFieldSourceScope(selectionRange, sourceSnapshot) {
  // Absent descriptor: nothing was captured (legacy callers).
  if (sourceSnapshot == null) return null;

  const scope = sourceSnapshot?.scope ?? null;
  // Missing kinds predate explicit kinds and are always native captures.
  const targetKind = sourceSnapshot?.targetKind ?? 'native';
  if (targetKind !== 'native' && targetKind !== 'contenteditable') {
    logger.debug('getFieldSourceScope: unrecognized targetKind, marking invalid');
    return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
  }

  if (scope === 'full') {
    // Full scope carries the whole request-time source as identity; a
    // missing identity cannot be validated fail-closed, so it is invalid.
    // A full descriptor must not carry a range representation from either
    // technology: contradictory scopes are rejected, never silently canonicalized.
    const expectedSourceText = sourceSnapshot?.expectedSourceText ?? null;
    if (typeof expectedSourceText !== 'string'
      || selectionRange != null
      || sourceSnapshot?.bookmark != null) {
      logger.debug('getFieldSourceScope: full descriptor without expected text or with a range, marking invalid');
      return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
    }
    return { scope: 'full', targetKind, range: null, bookmark: null, expectedSourceText };
  }

  if (scope === 'selection') {
    const expectedSourceText = sourceSnapshot?.expectedSourceText ?? null;
    if (typeof expectedSourceText !== 'string') {
      logger.debug('getFieldSourceScope: selection descriptor without expected text, marking invalid');
      return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
    }
    if (targetKind === 'contenteditable') {
      // Bookmark is the only range representation here; native offsets are
      // never overloaded for CE (a native range must not ride along).
      const bookmark = sourceSnapshot?.bookmark ?? null;
      if (selectionRange != null || !isValidContentEditableBookmark(bookmark)) {
        logger.debug('getFieldSourceScope: unusable CE bookmark, marking invalid');
        return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
      }
      return { scope: 'selection', targetKind, range: null, bookmark, expectedSourceText };
    }
    // Native selection: usable offsets plus the exact expected text are both
    // required; a bookmark must never ride along on a native descriptor.
    const { start, end } = selectionRange ?? {};
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start === end ||
      sourceSnapshot?.bookmark != null
    ) {
      logger.debug('getFieldSourceScope: incomplete native selection descriptor, marking invalid');
      return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
    }

    return { scope: 'selection', targetKind, range: { start, end }, bookmark: null, expectedSourceText };
  }

  // Present but unrecognized scope string: fail closed rather than falling
  // back to a live selection that was never captured.
  logger.debug('getFieldSourceScope: unrecognized descriptor, marking invalid');
  return { scope: INVALID_FIELD_SCOPE, targetKind, range: null, bookmark: null, expectedSourceText: null };
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

  // contentEditable descriptors are owned by the CE validators (bookmark or
  // canonical-text identity); native logic below never sees them.
  if ((fieldSource.targetKind ?? 'native') === 'contenteditable') {
    if (fieldSource.scope === 'selection') {
      return validateContentEditableSelection(element, fieldSource);
    }
    if (fieldSource.scope === 'full') {
      return validateContentEditableFull(element, fieldSource);
    }
    return false;
  }

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

  // Kind fence: a contenteditable-kind descriptor on a native element is a
  // mismatch — fail closed rather than applying cross-kind.
  if ((fieldSource.targetKind ?? 'native') !== 'native') {
    logger.debug('resolveScopedInputRange: kind mismatch, refusing replace');
    return { start, end, refused: true };
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
