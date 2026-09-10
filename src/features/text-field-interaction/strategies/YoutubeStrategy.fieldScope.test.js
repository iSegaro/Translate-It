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

import YoutubeStrategy from './YoutubeStrategy.js';

const selectionScope = {
  scope: 'selection',
  range: { start: 6, end: 10 },
  expectedSelectedText: 'سلام',
};

describe('YoutubeStrategy canonical Field scope', () => {
  it('replaces only the captured range and preserves prefix/suffix', async () => {
    const strategy = new YoutubeStrategy(null, { handle: vi.fn() });

    const field = document.createElement('textarea');
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

  it('is not redirected by a live selection that moved after the request', async () => {
    const strategy = new YoutubeStrategy(null, { handle: vi.fn() });

    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 1);

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });
});
