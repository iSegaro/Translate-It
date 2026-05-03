import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browser polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    scripting: {
      executeScript: vi.fn(() => Promise.resolve())
    },
    tabs: {
      query: vi.fn(),
      executeScript: vi.fn(() => Promise.resolve())
    }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

import browser from 'webextension-polyfill';
import { 
  dismissAllSelectionWindowsInTab, 
  dismissAllSelectionWindows 
} from './cleanupSelectionWindows.js';

describe('cleanupSelectionWindows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dismissAllSelectionWindowsInTab', () => {
    it('should use browser.scripting.executeScript in MV3', async () => {
      await dismissAllSelectionWindowsInTab(123);
      
      expect(browser.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
        target: { tabId: 123 },
        func: expect.any(Function)
      }));
    });

    it('should fallback to browser.tabs.executeScript if scripting API is missing', async () => {
      // Temporarily remove scripting API
      const originalScripting = browser.scripting;
      browser.scripting = null;
      
      await dismissAllSelectionWindowsInTab(456);
      
      expect(browser.tabs.executeScript).toHaveBeenCalledWith(456, expect.objectContaining({
        func: expect.any(Function)
      }));
      
      // Restore
      browser.scripting = originalScripting;
    });

    it('should handle errors gracefully', async () => {
      browser.scripting.executeScript.mockRejectedValue(new Error('Tab closed'));
      
      // Should not throw
      await expect(dismissAllSelectionWindowsInTab(789)).resolves.not.toThrow();
    });
  });

  describe('dismissAllSelectionWindows', () => {
    it('should query all tabs and cleanup each', async () => {
      browser.tabs.query.mockResolvedValue([
        { id: 1 },
        { id: 2 },
        { id: null } // Should be skipped
      ]);

      await dismissAllSelectionWindows();

      expect(browser.tabs.query).toHaveBeenCalledWith({ url: '<all_urls>' });
      expect(browser.scripting.executeScript).toHaveBeenCalledTimes(2);
    });

    it('should handle query errors', async () => {
      browser.tabs.query.mockRejectedValue(new Error('Permission denied'));
      
      // Should not throw
      await expect(dismissAllSelectionWindows()).resolves.not.toThrow();
    });
  });
});
