import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('RevertShortcut ESC-cancel ownership', () => {
  let RevertShortcut;
  let deactivate;
  let featureManager;

  beforeEach(async () => {
    vi.clearAllMocks();
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
