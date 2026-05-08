import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn(() => Promise.resolve())
    }
  }
}));

vi.mock('./selectElementStateManager.js', () => ({
  setStateForTab: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn()
  }))
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE'
  }
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { CONTENT: 'CONTENT' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context }))
  }
}));

import { handleDeactivateSelectElementMode } from './handleDeactivateSelectElementMode.js';
import { setStateForTab } from './selectElementStateManager.js';

describe('handleDeactivateSelectElementMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deactivate state for a tab', async () => {
    const message = { data: { tabId: 123 } };
    const response = await handleDeactivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(123, false);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
      action: 'DEACTIVATE_SELECT_ELEMENT_MODE'
    }));
  });

  it('should return error if no tabId', async () => {
    const response = await handleDeactivateSelectElementMode({}, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('No tabId available');
  });
});
