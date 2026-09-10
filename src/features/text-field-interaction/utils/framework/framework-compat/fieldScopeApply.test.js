import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TEXT_FIELD_INTERACTION: 'text-field', FRAMEWORK: 'framework', TRANSLATION: 'translation' },
}));

import { smartTextReplacement } from './index.js';

const selectionScope = {
  scope: 'selection',
  range: { start: 6, end: 10 },
  expectedSourceText: 'سلام',
};
const fullScope = { scope: 'full', range: null, expectedSourceText: 'Hello سلام world' };

describe('smartTextReplacement canonical Field scope', () => {
  it('replaces only the captured range and preserves prefix/suffix', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('ignores a moved live selection and still replaces the captured range', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // User moved the caret elsewhere while the request was in flight.
    field.setSelectionRange(0, 1);

    const result = await smartTextReplacement(field, 'hello', 0, 1, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('applies full-field even when a selection was created after the request', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // User selected a sub-range after a full-field request started.
    field.setSelectionRange(6, 10);

    const result = await smartTextReplacement(field, 'all new', 6, 10, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('all new');

    document.body.removeChild(field);
  });

  it('refuses a stale scoped replace without mutating the field', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello CHANGED world';
    document.body.appendChild(field);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(false);
    expect(field.value).toBe('Hello CHANGED world');

    document.body.removeChild(field);
  });

  it('applies a full-field replace when the value is unedited, caret movement included', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // Caret/selection-only movement never changes element value: still valid.
    field.setSelectionRange(2, 2);

    const result = await smartTextReplacement(field, 'all new', null, null, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('all new');

    document.body.removeChild(field);
  });

  it.each([
    ['appended suffix', 'Hello سلام world!'],
    ['deleted text', 'Hello سلام'],
    ['changed text', 'Hello CHANGED world'],
  ])('refuses a full-field replace when the value was edited (%s), no overwrite', async (_label, editedValue) => {
    const field = document.createElement('textarea');
    field.value = editedValue;
    document.body.appendChild(field);

    const result = await smartTextReplacement(field, 'all new', null, null, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(false);
    expect(field.value).toBe(editedValue);

    document.body.removeChild(field);
  });

  it('keeps the legacy live-selection fallback only when no descriptor is present', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(6, 10);

    const result = await smartTextReplacement(field, 'hello', 6, 10, true, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });
});
