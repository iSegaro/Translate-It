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

import { handleSetSelectElementState } from './handleSetSelectElementState.js';
import { setStateForTab } from './selectElementStateManager.js';

describe('handleSetSelectElementState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set state for a tab from sender', async () => {
    const message = { data: { activate: true } };
    const sender = { tab: { id: 123 } };
    
    const response = await handleSetSelectElementState(message, sender);

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(123, true);
  });

  it('should set state for a tab from data tabId', async () => {
    const message = { data: { activate: false, tabId: 456 } };
    
    const response = await handleSetSelectElementState(message, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(456, false);
  });

  it('should broadcast deactivation if explicit', async () => {
    const message = { data: { activate: false, tabId: 789, isExplicitDeactivation: true } };
    
    await handleSetSelectElementState(message, {});

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(789, expect.objectContaining({
      action: 'DEACTIVATE_SELECT_ELEMENT_MODE',
      data: expect.objectContaining({ isExplicitDeactivation: true })
    }));
  });

  it('should not broadcast activation', async () => {
    const message = { data: { activate: true, tabId: 101 } };
    
    await handleSetSelectElementState(message, {});

    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('should return error if no tabId', async () => {
    const response = await handleSetSelectElementState({ data: { activate: true } }, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('No tabId available');
  });

  it('should handle errors in setStateForTab', async () => {
    setStateForTab.mockImplementation(() => { throw new Error('State error'); });
    const response = await handleSetSelectElementState({ data: { activate: true, tabId: 1 } }, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('State error');
  });
});
