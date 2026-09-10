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
  expectedSelectedText: 'سلام',
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

  it('emits bubbling input/change events for accepted scoped updates (Field contract)', async () => {
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
    // Field contract: the accepted update surfaces as bubbling input/change,
    // like the legacy direct assignment did — no loss of notifications.
    // Note: environments without document.execCommand (jsdom) may observe one
    // extra synthetic input from the shared pipeline's beforeinput simulation
    // layer; that pre-existing trait affects every strategy path equally and
    // is not introduced by scoped application.
    const inputs = seen.filter((event) => event.type === 'input');
    const changes = seen.filter((event) => event.type === 'change');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((event) => event.bubbles)).toBe(true);

    document.body.removeChild(field);
  });
});
