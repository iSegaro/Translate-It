import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn()
    }
  }
}));

// Mock local dependencies
vi.mock('./selectElementStateManager.js', () => ({
  setStateForTab: vi.fn()
}));

vi.mock('@/core/tabPermissions.js', () => ({
  tabPermissionChecker: {
    checkTabAccess: vi.fn()
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn()
  }
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: vi.fn().mockImplementation(function() {
    this.handle = vi.fn();
  })
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    ACTIVATE_SELECT_ELEMENT_MODE: 'ACTIVATE_SELECT_ELEMENT_MODE',
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE'
  }
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { CONTENT: 'CONTENT' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context }))
  }
}));

import { handleActivateSelectElementMode } from './handleActivateSelectElementMode.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';
import { setStateForTab } from './selectElementStateManager.js';

describe('handleActivateSelectElementMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabPermissionChecker.checkTabAccess.mockResolvedValue({ isAccessible: true, isRestricted: false, fullUrl: 'https://example.com' });
    browser.tabs.sendMessage.mockResolvedValue({ success: true, activated: true });
  });

  it('should activate mode for a specific tab', async () => {
    const message = { data: { tabId: 1, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
      action: 'ACTIVATE_SELECT_ELEMENT_MODE'
    }));
    expect(setStateForTab).toHaveBeenCalledWith(1, true);
  });

  it('should find active tab if no tabId provided', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 2 }]);
    const message = { data: { active: true } };
    
    await handleActivateSelectElementMode(message, {});

    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(2, expect.anything());
  });

  it('should handle permission check failures', async () => {
    tabPermissionChecker.checkTabAccess.mockResolvedValue({ 
      isAccessible: false, 
      errorMessage: 'Restricted page', 
      fullUrl: 'chrome://settings' 
    });
    
    const message = { data: { tabId: 3, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(false);
    expect(response.isRestrictedPage).toBe(true);
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('should handle communication errors with content script', async () => {
    browser.tabs.sendMessage.mockRejectedValue(new Error('Connection closed'));
    
    const message = { data: { tabId: 1, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(false);
    expect(response.message).toContain('Failed to communicate');
  });

  it('should handle legacy boolean responses (true)', async () => {
    browser.tabs.sendMessage.mockResolvedValue(true);
    
    const message = { data: { tabId: 1, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(setStateForTab).toHaveBeenCalledWith(1, true);
  });

  it('should handle legacy boolean responses (false) on accessible pages', async () => {
    browser.tabs.sendMessage.mockResolvedValue(false);
    
    const message = { data: { tabId: 1, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    // For accessible pages, false is treated as success for legacy reasons
    expect(response.success).toBe(true);
    expect(response.isLegacyResponse).toBe(true);
  });

  it('should handle structured error response from content script', async () => {
    browser.tabs.sendMessage.mockResolvedValue({ 
      success: false, 
      error: 'Already active',
      isCompatibilityIssue: true 
    });
    
    const message = { data: { tabId: 1, active: true } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(false);
    expect(response.message).toBe('Already active');
    expect(response.isCompatibilityIssue).toBe(true);
  });

  it('should deactivate mode', async () => {
    const message = { data: { tabId: 1, active: false } };
    const response = await handleActivateSelectElementMode(message, {});

    expect(response.success).toBe(true);
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
      action: 'DEACTIVATE_SELECT_ELEMENT_MODE'
    }));
    expect(setStateForTab).toHaveBeenCalledWith(1, false);
  });
});
