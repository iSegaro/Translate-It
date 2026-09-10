import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartTextReplacement: vi.fn(),
  smartDelay: vi.fn(),
}));

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

vi.mock('@/features/text-field-interaction/utils/framework/framework-compat/index.js', () => ({
  smartTextReplacement: (...args) => mocks.smartTextReplacement(...args),
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

import TwitterStrategy from './TwitterStrategy.js';

// Plain textarea inside a neutral container: exercises the generic composer
// path (no Draft.js select-all, no search-input branch) with a mocked pipeline.
function makeField() {
  const container = document.createElement('div');
  container.innerHTML = '<textarea>hello world</textarea>';
  const field = container.firstChild;
  document.body.appendChild(container);
  return { container, field };
}

describe('TwitterStrategy input-observer lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.smartDelay.mockResolvedValue(undefined);
    mocks.smartTextReplacement.mockResolvedValue(true);
  });

  it('detaches the observer on success', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });
    strategy.applyVisualFeedback = () => Promise.resolve();
    const { container, field } = makeField();
    const removeSpy = vi.spyOn(field, 'removeEventListener');

    const result = await strategy.updateElement(field, 'hi', { isCurrent: () => true });

    expect(result).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith('input', expect.any(Function));

    document.body.removeChild(container);
  });

  it('detaches the observer when the pipeline reports false', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });
    strategy.applyVisualFeedback = () => Promise.resolve();
    const { container, field } = makeField();
    const removeSpy = vi.spyOn(field, 'removeEventListener');
    mocks.smartTextReplacement.mockResolvedValue(false);

    const result = await strategy.updateElement(field, 'hi', { isCurrent: () => true });

    expect(result).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('input', expect.any(Function));

    document.body.removeChild(container);
  });

  it('detaches the observer when the pipeline throws and surfaces failure safely', async () => {
    const errorHandler = { handle: vi.fn() };
    const strategy = new TwitterStrategy(null, errorHandler);
    strategy.applyVisualFeedback = () => Promise.resolve();
    const { container, field } = makeField();
    const removeSpy = vi.spyOn(field, 'removeEventListener');
    mocks.smartTextReplacement.mockRejectedValueOnce(new Error('boom'));

    const result = await strategy.updateElement(field, 'hi', { isCurrent: () => true });

    expect(result).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('input', expect.any(Function));
    expect(errorHandler.handle).toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('detaches the observer on stale requests without emitting the nudge', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });
    strategy.applyVisualFeedback = () => Promise.resolve();
    const { container, field } = makeField();
    const removeSpy = vi.spyOn(field, 'removeEventListener');
    const dispatchSpy = vi.spyOn(field, 'dispatchEvent');
    let current = true;
    mocks.smartTextReplacement.mockImplementation(async () => {
      current = false;
      return true;
    });

    const result = await strategy.updateElement(field, 'hi', { isCurrent: () => current });

    expect(result).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('input', expect.any(Function));
    // Stale: no success path, so no manual nudge is dispatched by strategy.
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'input' }));

    document.body.removeChild(container);
  });
});
