import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { SHORTCUTS: 'Shortcuts' }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn(() => Promise.resolve()),
  sendRegularMessage: vi.fn(() => Promise.resolve())
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    CANCEL_TRANSLATION: 'CANCEL_TRANSLATION',
    REVERT_SELECT_ELEMENT_MODE: 'REVERT_SELECT_ELEMENT_MODE'
  }
}));

vi.mock('@/handlers/content/RevertHandler.js', () => ({
  revertHandler: {
    executeRevert: vi.fn(async () => ({ success: false }))
  }
}));

import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { revertHandler } from '@/handlers/content/RevertHandler.js';

describe('RevertShortcut ESC-cancel ownership', () => {
  let RevertShortcut;
  let deactivate;
  let featureManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T00:00:00Z'));
    deactivate = vi.fn(async () => {});
    featureManager = {
      getFeatureHandler: vi.fn((name) =>
        name === 'selectElement' ? { deactivate, isActive: true } : null
      ),
    };
    window.featureManager = featureManager;
    delete window.selectElementHandlingESC;
    window.isScreenCaptureActive = false;

    const module = await import('./RevertShortcut.js');
    RevertShortcut = module.RevertShortcut;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function escapeEvent(overrides = {}) {
    return {
      key: 'Escape',
      code: 'Escape',
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...overrides,
    };
  }

  it('requires two plain Escape presses within 400ms', async () => {
    const shortcut = new RevertShortcut();

    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(false);
    vi.advanceTimersByTime(400);
    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(true);
  });

  it('treats a slow Escape as a new first press', async () => {
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    vi.advanceTimersByTime(401);
    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(false);
    vi.advanceTimersByTime(400);
    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(true);
  });

  it('ignores repeated and modified Escape without corrupting a valid sequence', async () => {
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    await expect(shortcut.shouldExecute(escapeEvent({ repeat: true }))).resolves.toBe(false);
    await expect(shortcut.shouldExecute(escapeEvent({ ctrlKey: true }))).resolves.toBe(false);
    await expect(shortcut.shouldExecute(escapeEvent({ altKey: true }))).resolves.toBe(false);
    await expect(shortcut.shouldExecute(escapeEvent({ shiftKey: true }))).resolves.toBe(false);
    await expect(shortcut.shouldExecute(escapeEvent({ metaKey: true }))).resolves.toBe(false);
    vi.advanceTimersByTime(400);
    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(true);
  });

  it('resets a pending sequence during shortcut cleanup', async () => {
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    shortcut.cleanup();
    vi.advanceTimersByTime(100);

    await expect(shortcut.shouldExecute(escapeEvent())).resolves.toBe(false);
  });

  it('requests tab-wide Select Element deactivation on ESC during active translation', async () => {
    window.isTranslationInProgress = true;

    const shortcut = new RevertShortcut();
    const result = await shortcut.execute();

    expect(result.success).toBe(true);
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'cancel',
        requestGlobalDeactivation: true,
      })
    );
    // Dead flag must not be reintroduced.
    expect(deactivate.mock.calls[0][0]).not.toHaveProperty('fromCancel');
  });

  it('uses the existing cancellation flow once after a valid Double Escape', async () => {
    window.isTranslationInProgress = true;
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    vi.advanceTimersByTime(100);
    expect(await shortcut.shouldExecute(escapeEvent())).toBe(true);
    await shortcut.execute();

    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('reverts completed translations once and preserves the iframe broadcast', async () => {
    window.isTranslationInProgress = false;
    featureManager.getFeatureHandler.mockReturnValue({ deactivate, isActive: false });
    revertHandler.executeRevert.mockResolvedValue({ success: true, revertedCount: 1 });
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    vi.advanceTimersByTime(100);
    await shortcut.shouldExecute(escapeEvent());
    await shortcut.execute();

    expect(revertHandler.executeRevert).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REVERT_SELECT_ELEMENT_MODE',
    }));
  });

  it('preserves the iframe broadcast when this frame has no translations to revert', async () => {
    window.isTranslationInProgress = false;
    featureManager.getFeatureHandler.mockReturnValue({ deactivate, isActive: false });
    revertHandler.executeRevert.mockResolvedValue({ success: true, revertedCount: 0 });
    const shortcut = new RevertShortcut();

    await shortcut.shouldExecute(escapeEvent());
    vi.advanceTimersByTime(100);
    await shortcut.shouldExecute(escapeEvent());
    await shortcut.execute();

    expect(revertHandler.executeRevert).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REVERT_SELECT_ELEMENT_MODE',
    }));
  });

  it('defers to SelectElementManager while it owns the ESC key', async () => {
    window.selectElementHandlingESC = true;

    const shortcut = new RevertShortcut();
    const result = await shortcut.execute();

    expect(result.action).toBe('skipped_select_element_handling_esc');
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('leaves selection-phase ESC handling untouched when no translation runs', async () => {
    window.isTranslationInProgress = false;

    const shortcut = new RevertShortcut();
    const result = await shortcut.execute();

    expect(result.action).toBe('skipped_select_element_active');
    expect(deactivate).not.toHaveBeenCalled();
  });
});
