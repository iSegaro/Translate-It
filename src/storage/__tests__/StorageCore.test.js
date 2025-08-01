/**
 * StorageCore Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock webextension-polyfill first, before importing StorageManager
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn()
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

import { StorageCore, StorageManager } from '../core/StorageCore.js';

describe('StorageCore', () => {
  let storageManager;
  let mockBrowser;

  beforeEach(async () => {
    // Get fresh mock reference
    mockBrowser = (await vi.importMock('webextension-polyfill')).default;
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup successful mock responses
    mockBrowser.storage.local.get.mockResolvedValue({});
    mockBrowser.storage.local.set.mockResolvedValue();
    mockBrowser.storage.local.remove.mockResolvedValue();
    mockBrowser.storage.local.clear.mockResolvedValue();

    // Create new instance for each test
    storageManager = new StorageCore();
    
    // Wait for initialization
    await storageManager._readyPromise;
  });

  afterEach(async () => {
    if (storageManager) {
      await storageManager.cleanup();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(storageManager._isReady).toBe(true);
      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith(['__storage_test__']);
    });

    it('should setup change listener', () => {
      expect(mockBrowser.storage.onChanged.addListener).toHaveBeenCalled();
    });
  });

  describe('Basic Operations', () => {
    it('should get values from storage', async () => {
      const testData = { key1: 'value1', key2: 'value2' };
      mockBrowser.storage.local.get.mockResolvedValueOnce(testData);

      const result = await storageManager.get(['key1', 'key2']);

      expect(result).toEqual(testData);
      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith(['key1', 'key2']);
    });

    it('should set values to storage', async () => {
      const testData = { key1: 'value1', key2: 'value2' };

      await storageManager.set(testData);

      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith(testData);
    });

    it('should remove values from storage', async () => {
      await storageManager.remove(['key1', 'key2']);

      expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith(['key1', 'key2']);
    });

    it('should clear all storage', async () => {
      await storageManager.clear();

      expect(mockBrowser.storage.local.clear).toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should cache retrieved values', async () => {
      const testData = { key1: 'value1' };
      mockBrowser.storage.local.get.mockResolvedValueOnce(testData);

      // First call should fetch from storage
      await storageManager.get(['key1']);
      
      // Second call should use cache
      const result = await storageManager.get(['key1']);

      expect(result).toEqual(testData);
      expect(mockBrowser.storage.local.get).toHaveBeenCalledTimes(2); // Once for init, once for first get
    });

    it('should update cache on set operations', async () => {
      const testData = { key1: 'value1' };

      await storageManager.set(testData);

      const cachedValue = storageManager.getCached('key1');
      expect(cachedValue).toBe('value1');
    });

    it('should invalidate cache correctly', async () => {
      // Set some cached data
      await storageManager.set({ key1: 'value1' });
      expect(storageManager.hasCached('key1')).toBe(true);

      // Invalidate cache
      storageManager.invalidateCache(['key1']);
      expect(storageManager.hasCached('key1')).toBe(false);
    });

    it('should clear cache correctly', () => {
      storageManager.cache.set('key1', 'value1');
      storageManager.cache.set('key2', 'value2');

      storageManager.clearCache();

      expect(storageManager.cache.size).toBe(0);
    });
  });

  describe('Event System', () => {
    it('should emit events on set operations', async () => {
      const setListener = vi.fn();
      const keyListener = vi.fn();

      storageManager.on('set', setListener);
      storageManager.on('set:testKey', keyListener);

      await storageManager.set({ testKey: 'testValue' });

      expect(setListener).toHaveBeenCalledWith({
        key: 'testKey',
        value: 'testValue'
      });
      expect(keyListener).toHaveBeenCalledWith({
        value: 'testValue'
      });
    });

    it('should emit events on remove operations', async () => {
      const removeListener = vi.fn();
      const keyListener = vi.fn();

      storageManager.on('remove', removeListener);
      storageManager.on('remove:testKey', keyListener);

      await storageManager.remove(['testKey']);

      expect(removeListener).toHaveBeenCalledWith({
        key: 'testKey'
      });
      expect(keyListener).toHaveBeenCalledWith({});
    });

    it('should remove event listeners correctly', async () => {
      const listener = vi.fn();

      storageManager.on('set', listener);
      storageManager.off('set', listener);

      await storageManager.set({ testKey: 'testValue' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Default Values', () => {
    it('should handle default values in get operations', async () => {
      mockBrowser.storage.local.get.mockResolvedValueOnce({});

      const result = await storageManager.get({
        existingKey: 'defaultValue',
        missingKey: 'defaultForMissing'
      });

      expect(result).toEqual({
        existingKey: 'defaultValue',
        missingKey: 'defaultForMissing'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle storage get errors', async () => {
      const error = new Error('Storage get failed');
      mockBrowser.storage.local.get.mockRejectedValueOnce(error);

      await expect(storageManager.get(['key1'])).rejects.toThrow('Storage get failed');
    });

    it('should handle storage set errors', async () => {
      const error = new Error('Storage set failed');
      mockBrowser.storage.local.set.mockRejectedValueOnce(error);

      await expect(storageManager.set({ key1: 'value1' })).rejects.toThrow('Storage set failed');
    });

    it('should handle event listener errors gracefully', async () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      storageManager.on('set', errorListener);
      storageManager.on('set', goodListener);

      // Should not throw despite error in listener
      await expect(storageManager.set({ testKey: 'testValue' })).resolves.not.toThrow();

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should provide cache statistics', () => {
      storageManager.cache.set('key1', 'value1');
      storageManager.cache.set('key2', 'value2');

      const stats = storageManager.getCacheStats();

      expect(stats).toEqual({
        size: 2,
        keys: ['key1', 'key2'],
        isReady: true
      });
    });
  });

  describe('Vue Proxy Support', () => {
    it('should handle Vue reactive objects (Proxy)', async () => {
      // Simulate a Vue reactive object (Proxy)
      const reactiveData = new Proxy({
        setting1: 'value1',
        setting2: { nested: 'value2' },
        setting3: [1, 2, 3]
      }, {
        get: (target, prop) => target[prop],
        set: (target, prop, value) => {
          target[prop] = value;
          return true;
        }
      });

      // Should not throw error with proxy objects
      await expect(storageManager.set(reactiveData)).resolves.not.toThrow();

      // Verify data was converted and stored correctly
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        setting1: 'value1',
        setting2: { nested: 'value2' },
        setting3: [1, 2, 3]
      });
    });

    it('should handle nested proxy objects', async () => {
      const nestedProxy = new Proxy({
        level1: new Proxy({
          level2: 'deep value'
        }, {})
      }, {});

      await expect(storageManager.set(nestedProxy)).resolves.not.toThrow();

      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        level1: {
          level2: 'deep value'
        }
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources properly', async () => {
      await storageManager.cleanup();

      expect(mockBrowser.storage.onChanged.removeListener).toHaveBeenCalled();
      expect(storageManager._isReady).toBe(false);
      expect(storageManager.cache.size).toBe(0);
      expect(storageManager.listeners.size).toBe(0);
    });
  });
});