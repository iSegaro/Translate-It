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
  LOG_COMPONENTS: { TEXT_FIELD_INTERACTION: 'text-field', FRAMEWORK: 'framework' },
}));

import TwitterStrategy from './TwitterStrategy.js';

const selectionScope = {
  scope: 'selection',
  range: { start: 6, end: 10 },
  expectedSourceText: 'سلام',
};

describe('TwitterStrategy search INPUT canonical Field scope', () => {
  it('replaces only the captured range instead of the full search value', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });

    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Search';
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('emits exactly one bubbling input and one bubbling change event (Field contract)', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });

    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Search';
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const seen = [];
    field.addEventListener('input', (event) => seen.push(event));
    field.addEventListener('change', (event) => seen.push(event));

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    // Same contract as the legacy direct assignment (one input + one change,
    // both bubbling): the beforeinput layer yields without events when it does
    // not mutate, so the single succeeding fallback owns mutation+events.
    expect(seen.filter((event) => event.type === 'input')).toHaveLength(1);
    expect(seen.filter((event) => event.type === 'change')).toHaveLength(1);
    expect(seen.every((event) => event.bubbles)).toBe(true);

    document.body.removeChild(field);
  });
});
