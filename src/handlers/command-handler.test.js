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

vi.mock('@/core/tabPermissions.js', () => ({
  tabPermissionChecker: {
    checkTabAccess: vi.fn(),
  },
}));

vi.mock('@/core/background/handlers/common/contentScriptInjector.js', () => ({
  injectContentScriptsForTab: vi.fn(),
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

import { tabPermissionChecker } from '@/core/tabPermissions.js';

describe('command-handler Select Element activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabPermissionChecker.checkTabAccess.mockResolvedValue({
      isAccessible: true,
      isRestricted: false,
      fullUrl: 'https://example.com',
    });
    browser.tabs.sendMessage.mockResolvedValue({ success: true, activated: true });
  });

  it('sends keyboard activation directly to content with canonical state-capable action', async () => {
    await expect(handleCommandEvent('select_element', {
      id: 42,
      url: 'https://example.com',
    })).resolves.toBe(true);

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({
      action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      data: expect.objectContaining({
        source: 'keyboard_shortcut',
        forceLoad: true,
      }),
    }));
  });
});
