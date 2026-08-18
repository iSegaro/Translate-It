import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartDelay: vi.fn(),
}));

vi.mock('../helpers.js', () => ({
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    init: vi.fn(),
  })),
}));

import { tryInputInsertion } from './input.js';

describe('input insertion application guard', () => {
  it('does not mutate after ownership is lost during an await', async () => {
    let release;
    let current = true;
    mocks.smartDelay.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const input = document.createElement('input');
    input.value = 'original';

    const application = tryInputInsertion(input, 'stale', false, null, null, {
      isCurrent: () => current,
    });

    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    current = false;
    release();

    await expect(application).resolves.toBe(false);
    expect(input.value).toBe('original');
  });

  it('keeps current insertion behavior when ownership remains valid', async () => {
    mocks.smartDelay.mockResolvedValue(undefined);
    const input = document.createElement('input');
    input.value = 'original';

    await expect(tryInputInsertion(input, 'current', false, null, null, {
      isCurrent: () => true,
    })).resolves.toBe(true);
    expect(input.value).toBe('current');
  });
});
