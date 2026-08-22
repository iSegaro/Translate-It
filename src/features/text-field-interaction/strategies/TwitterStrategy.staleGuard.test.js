import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartTextReplacement: vi.fn(),
  smartDelay: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/features/text-field-interaction/utils/framework/framework-compat/index.js', () => ({
  smartTextReplacement: (...args) => mocks.smartTextReplacement(...args),
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

import TwitterStrategy from './TwitterStrategy.js';

describe('TwitterStrategy application guard', () => {
  it('does not perform direct assignment after an async ownership loss', async () => {
    let release;
    let current = true;
    const input = document.createElement('input');
    input.dataset.testid = 'SearchBox_Search_Input';
    input.setAttribute('data-testid', 'SearchBox_Search_Input');
    input.value = 'original';
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });
    strategy.applyVisualFeedback = () => new Promise((resolve) => { release = resolve; });

    const application = strategy.updateElement(input, 'stale', {
      isCurrent: () => current,
    });

    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    current = false;
    release();

    await expect(application).resolves.toBe(false);
    expect(input.value).toBe('original');
  });
});
