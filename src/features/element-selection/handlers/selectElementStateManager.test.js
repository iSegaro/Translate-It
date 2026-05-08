import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve())
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() }
    }
  }
}));

// Mock Messaging dependencies
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    SELECT_ELEMENT_STATE_CHANGED: 'SELECT_ELEMENT_STATE_CHANGED'
  }
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { BACKGROUND: 'BACKGROUND' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context }))
  }
}));

import { setStateForTab, getStateForTab, clearStateForTab } from './selectElementStateManager.js';

const onRemovedListener = browser.tabs.onRemoved.addListener.mock.calls[0][0];

describe('selectElementStateManager', () => {
  it('should register listeners on load', () => {
    expect(browser.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(browser.tabs.onActivated.addListener).toHaveBeenCalled();
  });

  describe('Core Functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should set and get state for a tab', () => {
      const tabId = 123;
      setStateForTab(tabId, true);
      
      const state = getStateForTab(tabId);
      expect(state.active).toBe(true);
      expect(state.updatedAt).toBeDefined();
    });

    it('should broadcast message when state changes', async () => {
      const tabId = 456;
      setStateForTab(tabId, true);
      
      // We need to wait for the async IIFE inside setStateForTab
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: 'SELECT_ELEMENT_STATE_CHANGED',
        data: { tabId, active: true }
      }));
    });

    it('should return default state for unknown tab', () => {
      const state = getStateForTab(999);
      expect(state.active).toBe(false);
    });

    it('should clear state for a tab', () => {
      const tabId = 789;
      setStateForTab(tabId, true);
      clearStateForTab(tabId);
      
      const state = getStateForTab(tabId);
      expect(state.active).toBe(false);
    });

    it('should handle falsy tabId in set/get/clear', () => {
      // Should not throw
      setStateForTab(null, true);
      expect(getStateForTab(null)).toEqual({ active: false });
      clearStateForTab(undefined);
    });

    it('should clear state when tab is removed', () => {
      const tabId = 101;
      setStateForTab(tabId, true);
      
      onRemovedListener(tabId);
      
      expect(getStateForTab(tabId).active).toBe(false);
    });
  });
});
