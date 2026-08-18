import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartTextReplacement: vi.fn(),
  smartDelay: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
  })),
}));

vi.mock('@/features/text-field-interaction/utils/framework/framework-compat/index.js', () => ({
  smartTextReplacement: (...args) => mocks.smartTextReplacement(...args),
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

import DiscordStrategy from './DiscordStrategy.js';

describe('DiscordStrategy Slate application guard', () => {
  it('does not invoke Slate mutation when ownership is stale', async () => {
    let current = false;
    const transforms = {
      select: vi.fn(),
      delete: vi.fn(),
      insertText: vi.fn(),
    };
    const editor = {};
    const element = document.createElement('div');
    element.isContentEditable = true;
    const strategy = new DiscordStrategy(null, { handle: vi.fn() });
    strategy._isSlateEditor = () => true;
    strategy._getSlateEditor = () => editor;
    window.Slate = {
      Transforms: transforms,
      Editor: {
        start: () => ({}),
        end: () => ({}),
      },
    };

    await expect(strategy.updateElement(element, 'stale', {
      isCurrent: () => current,
    })).resolves.toBe(false);

    expect(transforms.select).not.toHaveBeenCalled();
    expect(transforms.delete).not.toHaveBeenCalled();
    expect(transforms.insertText).not.toHaveBeenCalled();
  });

  it('executes current Slate mutation path successfully', async () => {
    const transforms = {
      select: vi.fn(),
      delete: vi.fn(),
      insertText: vi.fn(),
    };
    const element = document.createElement('div');
    element.isContentEditable = true;
    const editor = {};
    const strategy = new DiscordStrategy(null, { handle: vi.fn() });
    strategy._isSlateEditor = () => true;
    strategy._getSlateEditor = () => editor;
    window.Slate = {
      Transforms: transforms,
      Editor: {
        start: () => ({}),
        end: () => ({}),
      },
    };

    await expect(strategy._updateViaSlateAPI(element, 'current', {
      isCurrent: () => true,
    })).resolves.toBe(true);

    expect(transforms.select).toHaveBeenCalledTimes(1);
    expect(transforms.delete).toHaveBeenCalledTimes(1);
    expect(transforms.insertText).toHaveBeenCalledWith(editor, 'current');
  });
});
