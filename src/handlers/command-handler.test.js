import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { handleCommandEvent } from './command-handler.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn(),
    },
  },
}));

vi.mock('@/core/background/handlers/common/contentScriptInjector.js', () => ({
  injectContentScriptsForTab: vi.fn(),
}));

vi.mock('@/core/background/handlers/lazy/handleElementSelectionLazy.js', () => ({
  handleActivateSelectElementModeLazy: vi.fn(),
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { handleActivateSelectElementModeLazy } from '@/core/background/handlers/lazy/handleElementSelectionLazy.js';
import { injectContentScriptsForTab } from '@/core/background/handlers/common/contentScriptInjector.js';

describe('command-handler Select Element activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleActivateSelectElementModeLazy.mockResolvedValue({ success: true, activated: true });
  });

  it('routes keyboard activation through the central Background handler', async () => {
    await expect(handleCommandEvent('select_element', {
      id: 42,
      url: 'https://example.com',
    })).resolves.toBe(true);

    expect(handleActivateSelectElementModeLazy).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      data: expect.objectContaining({
        source: 'keyboard_shortcut',
        forceLoad: true,
        tabId: 42,
        active: true,
      }),
    }), { tab: { id: 42, url: 'https://example.com' } });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('preserves content-script injection retry for transport failures', async () => {
    handleActivateSelectElementModeLazy
      .mockResolvedValueOnce({
        success: false,
        message: 'Failed to communicate with tab - try refreshing the page',
      })
      .mockResolvedValueOnce({ success: true, activated: true });

    await expect(handleCommandEvent('select_element', {
      id: 42,
      url: 'https://example.com',
    })).resolves.toBe(true);

    expect(injectContentScriptsForTab).toHaveBeenCalledWith(42);
    expect(handleActivateSelectElementModeLazy).toHaveBeenCalledTimes(2);
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
