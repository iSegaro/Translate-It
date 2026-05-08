import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: vi.fn(() => Promise.resolve([]))
    }
  }
}));

vi.mock('./selectElementStateManager.js', () => ({
  getStateForTab: vi.fn(() => ({ active: false }))
}));

import { handleGetSelectElementState } from './handleGetSelectElementState.js';
import { getStateForTab } from './selectElementStateManager.js';

describe('handleGetSelectElementState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get state for a tab from data tabId', async () => {
    const message = { data: { tabId: 123 } };
    getStateForTab.mockReturnValue({ active: true, updatedAt: 1000 });
    
    const response = await handleGetSelectElementState(message, {});

    expect(response.success).toBe(true);
    expect(response.active).toBe(true);
    expect(getStateForTab).toHaveBeenCalledWith(123);
  });

  it('should get state for a tab from sender', async () => {
    const sender = { tab: { id: 456 } };
    
    await handleGetSelectElementState({}, sender);

    expect(getStateForTab).toHaveBeenCalledWith(456);
  });

  it('should query active tab if no tabId provided', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 789 }]);
    
    await handleGetSelectElementState({}, {});

    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(getStateForTab).toHaveBeenCalledWith(789);
  });

  it('should return error if no tabId can be determined', async () => {
    browser.tabs.query.mockResolvedValue([]);
    
    const response = await handleGetSelectElementState({}, {});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Could not determine tabId');
  });
});
