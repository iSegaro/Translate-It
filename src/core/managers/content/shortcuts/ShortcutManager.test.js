import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { SHORTCUTS: 'Shortcuts' },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), operation: vi.fn() })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    cleanup() {}
  },
}));

vi.mock('../KeyboardStateManager.js', () => ({
  KeyboardStateManager: class KeyboardStateManager {},
}));

import { ShortcutManager } from './ShortcutManager.js';

describe('ShortcutManager event consumption', () => {
  it('executes a non-consuming handler without claiming the browser event', async () => {
    const manager = new ShortcutManager();
    manager.initialized = true;
    const execute = vi.fn();
    manager.registerShortcut('Escape', {
      shouldExecute: vi.fn(async () => true),
      shouldConsumeEvent: vi.fn(() => false),
      execute,
    });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    await manager.handleKeyboardEvent(event);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('preserves consuming behavior for existing handlers', async () => {
    const manager = new ShortcutManager();
    manager.initialized = true;
    const execute = vi.fn();
    manager.registerShortcut('Ctrl+/', { shouldExecute: vi.fn(async () => true), execute });
    const event = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true });

    await manager.handleKeyboardEvent(event);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('resets only RevertShortcut state during manager cleanup', () => {
    const manager = new ShortcutManager();
    manager.revertShortcut = { cleanup: vi.fn() };
    const fieldShortcut = { cleanup: vi.fn() };
    manager.registerShortcut('Escape', manager.revertShortcut);
    manager.registerShortcut('Ctrl+/', fieldShortcut);

    manager.cleanup();

    expect(manager.revertShortcut).toBeNull();
    expect(fieldShortcut.cleanup).not.toHaveBeenCalled();
  });
});
