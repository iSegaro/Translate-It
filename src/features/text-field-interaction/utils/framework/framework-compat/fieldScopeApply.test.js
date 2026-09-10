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
  expectedSelectedText: 'سلام',
};
const fullScope = { scope: 'full', range: null, expectedSelectedText: null };

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
