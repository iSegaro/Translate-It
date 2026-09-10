import { describe, it, expect } from 'vitest';

import {
  captureFieldTranslationSource,
  getFieldSourceScope,
  validateFieldSourceSnapshot,
  resolveScopedInputRange,
  INVALID_FIELD_SCOPE,
} from './fieldSourceSnapshot.js';

describe('captureFieldTranslationSource', () => {
  it('captures only the selected substring with a selection scope for INPUT/TEXTAREA', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(6, 10);

    expect(captureFieldTranslationSource(el)).toEqual({
      text: 'سلام',
      selectionRange: { start: 6, end: 10 },
      sourceSnapshot: { scope: 'selection', expectedSelectedText: 'سلام' },
    });
  });

  it('returns the full value with an explicit full scope when nothing is selected', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(0, 0);

    expect(captureFieldTranslationSource(el)).toEqual({
      text: 'Hello سلام world',
      selectionRange: null,
      sourceSnapshot: { scope: 'full', expectedSelectedText: null },
    });
  });

  it('preserves contentEditable behavior (full text, null range, no scope)', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'hello world';

    expect(captureFieldTranslationSource(el)).toEqual({
      text: 'hello world',
      selectionRange: null,
      sourceSnapshot: null,
    });
  });
});

describe('getFieldSourceScope', () => {
  it('normalizes a selection pair into a canonical selection scope', () => {
    expect(
      getFieldSourceScope(
        { start: 6, end: 10 },
        { scope: 'selection', expectedSelectedText: 'سلام' }
      )
    ).toEqual({
      scope: 'selection',
      range: { start: 6, end: 10 },
      expectedSelectedText: 'سلام',
    });
  });

  it('normalizes a full descriptor into a canonical full scope', () => {
    expect(
      getFieldSourceScope(null, { scope: 'full', expectedSelectedText: null })
    ).toEqual({ scope: 'full', range: null, expectedSelectedText: null });
  });

  it('returns null when no descriptor is present (legacy callers keep live fallback)', () => {
    expect(getFieldSourceScope(null, null)).toBeNull();
    expect(getFieldSourceScope({ start: 6, end: 10 }, null)).toBeNull();
  });

  it('marks an incomplete selection descriptor invalid (fail closed, no legacy fallback)', () => {
    expect(getFieldSourceScope(null, { scope: 'selection', expectedSelectedText: 'سلام' })).toEqual({
      scope: INVALID_FIELD_SCOPE,
      range: null,
      expectedSelectedText: null,
    });
    expect(getFieldSourceScope({ start: 6, end: 10 }, { scope: 'selection' })).toEqual({
      scope: INVALID_FIELD_SCOPE,
      range: null,
      expectedSelectedText: null,
    });
  });

  it('marks an unknown scope invalid (fail closed, no legacy fallback)', () => {
    expect(getFieldSourceScope(null, { scope: 'weird', expectedSelectedText: null })).toEqual({
      scope: INVALID_FIELD_SCOPE,
      range: null,
      expectedSelectedText: null,
    });
    expect(getFieldSourceScope(null, {})).toEqual({
      scope: INVALID_FIELD_SCOPE,
      range: null,
      expectedSelectedText: null,
    });
  });
});

describe('validateFieldSourceSnapshot', () => {
  it('accepts an unchanged source at the captured range', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';

    expect(
      validateFieldSourceSnapshot(el, {
        scope: 'selection',
        range: { start: 6, end: 10 },
        expectedSelectedText: 'سلام',
      })
    ).toBe(true);
  });

  it('rejects when the user edited the source before settle', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello CHANGED world';

    expect(
      validateFieldSourceSnapshot(el, {
        scope: 'selection',
        range: { start: 6, end: 10 },
        expectedSelectedText: 'سلام',
      })
    ).toBe(false);
  });

  it('treats full scope and absent descriptors as valid (ownership owns staleness)', () => {
    const el = document.createElement('textarea');
    el.value = 'anything';

    expect(validateFieldSourceSnapshot(el, { scope: 'full', range: null, expectedSelectedText: null })).toBe(true);
    expect(validateFieldSourceSnapshot(el, null)).toBe(true);
  });

  it('rejects present-but-malformed descriptors (fail closed, no mutation)', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';

    expect(
      validateFieldSourceSnapshot(el, { scope: INVALID_FIELD_SCOPE, range: null, expectedSelectedText: null })
    ).toBe(false);
  });
});

describe('resolveScopedInputRange', () => {
  it('uses the captured range even when the live selection moved', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(0, 0);

    expect(
      resolveScopedInputRange(el, null, null, {
        isCurrent: () => true,
        fieldSource: { scope: 'selection', range: { start: 6, end: 10 }, expectedSelectedText: 'سلام' },
      })
    ).toEqual({ start: 6, end: 10, refused: false });
  });

  it('forces full-field range even when a live selection was created later', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(6, 10);

    expect(
      resolveScopedInputRange(el, 6, 10, {
        isCurrent: () => true,
        fieldSource: { scope: 'full', range: null, expectedSelectedText: null },
      })
    ).toEqual({ start: 0, end: 16, refused: false });
  });

  it('refuses when the scoped source was edited (no overwrite)', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello CHANGED world';

    expect(
      resolveScopedInputRange(el, null, null, {
        isCurrent: () => true,
        fieldSource: { scope: 'selection', range: { start: 6, end: 10 }, expectedSelectedText: 'سلام' },
      })
    ).toEqual(expect.objectContaining({ refused: true }));
  });

  it('refuses malformed and unknown scopes (fail closed, no mutation)', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(6, 10);

    for (const fieldSource of [
      { scope: INVALID_FIELD_SCOPE, range: null, expectedSelectedText: null },
      { scope: 'weird', range: null, expectedSelectedText: null },
    ]) {
      expect(
        resolveScopedInputRange(el, 6, 10, { isCurrent: () => true, fieldSource })
      ).toEqual(expect.objectContaining({ refused: true }));
      // Live selection left untouched by the refusal (caller must not mutate).
      expect(el.value).toBe('Hello سلام world');
    }
  });

  it('passes args through untouched when no descriptor is present (legacy)', () => {
    const el = document.createElement('textarea');
    el.value = 'Hello سلام world';
    el.setSelectionRange(6, 10);

    expect(resolveScopedInputRange(el, 6, 10, { isCurrent: () => true })).toEqual({
      start: 6,
      end: 10,
      refused: false,
    });
  });

  it('never touches contentEditable ranges', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'hello world';

    expect(
      resolveScopedInputRange(el, null, null, {
        isCurrent: () => true,
        fieldSource: { scope: 'selection', range: { start: 0, end: 5 }, expectedSelectedText: 'hello' },
      })
    ).toEqual({ start: null, end: null, refused: false });
  });
});
