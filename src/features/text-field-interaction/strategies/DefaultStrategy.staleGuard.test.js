import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartTextReplacement: vi.fn(),
  smartDelay: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/features/text-field-interaction/utils/framework/framework-compat/index.js', () => ({
  smartTextReplacement: (...args) => mocks.smartTextReplacement(...args),
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

import DefaultStrategy from './DefaultStrategy.js';

describe('DefaultStrategy application guard', () => {
  it('allows only current request to continue after an async boundary', async () => {
    let releaseA;
    let releaseB;
    let currentA = true;
    let currentB = true;
    const strategyA = new DefaultStrategy(null, { handle: vi.fn() });
    const strategyB = new DefaultStrategy(null, { handle: vi.fn() });
    strategyA.applyVisualFeedback = () => new Promise((resolve) => { releaseA = resolve; });
    strategyB.applyVisualFeedback = () => new Promise((resolve) => { releaseB = resolve; });
    mocks.smartTextReplacement.mockResolvedValue(true);
    const targetA = document.createElement('textarea');
    const targetB = document.createElement('textarea');

    const applicationA = strategyA.updateElement(targetA, 'A', { isCurrent: () => currentA });
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    currentA = false;
    releaseA();
    await expect(applicationA).resolves.toBe(false);
    expect(mocks.smartTextReplacement).not.toHaveBeenCalled();

    const applicationB = strategyB.updateElement(targetB, 'B', { isCurrent: () => currentB });
    await vi.waitFor(() => expect(releaseB).toBeTypeOf('function'));
    releaseB();
    await expect(applicationB).resolves.toBe(true);
    expect(mocks.smartTextReplacement).toHaveBeenCalledTimes(1);
  });
});
