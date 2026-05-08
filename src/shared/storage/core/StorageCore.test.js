import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageCore } from './StorageCore.js';

// Mock Dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    operation: vi.fn()
  })
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn()
  }
}));

describe('StorageCore CRUD Operations', () => {
  let storage;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Use the global browser mock from setup.js
    browser.storage.local.get.mockResolvedValue({});
    storage = new StorageCore();
    await storage._readyPromise;
  });

  it('get should return values from storage and update cache', async () => {
    browser.storage.local.get.mockResolvedValue({ theme: 'dark' });
    
    const result = await storage.get('theme');
    
    expect(result).toEqual({ theme: 'dark' });
    expect(browser.storage.local.get).toHaveBeenCalledWith(['theme']);
    expect(storage.cache.get('theme')).toBe('dark');
  });

  it('get should use cache on subsequent calls', async () => {
    browser.storage.local.get.mockResolvedValue({ theme: 'dark' });
    
    // First call - hits storage
    await storage.get('theme');
    
    // Second call - should hit cache
    const result = await storage.get('theme');
    
    expect(result).toEqual({ theme: 'dark' });
    // 1 (init) + 1 (first get) = 2
    expect(browser.storage.local.get).toHaveBeenCalledTimes(2);
  });

  it('set should store data and update cache', async () => {
    await storage.set({ theme: 'light' });
    
    expect(browser.storage.local.set).toHaveBeenCalledWith({ theme: 'light' });
    expect(storage.cache.get('theme')).toBe('light');
  });

  it('remove should delete from storage and cache', async () => {
    storage.cache.set('key', 'value');
    await storage.remove('key');
    
    expect(browser.storage.local.remove).toHaveBeenCalledWith(['key']);
    expect(storage.cache.has('key')).toBe(false);
  });
});

describe('StorageCore Synchronization', () => {
  let storage;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Add missing onChanged mock
    if (!browser.storage.onChanged) {
      browser.storage.onChanged = {
        addListener: vi.fn(),
        removeListener: vi.fn()
      };
    }
    storage = new StorageCore();
    await storage._readyPromise;
  });

  it('should update cache and emit events when browser storage changes externally', async () => {
    const changeCallback = vi.fn();
    storage.on('change:theme', changeCallback);
    
    // Find the listener registered with browser.storage.onChanged
    const onCall = browser.storage.onChanged.addListener.mock.calls.find(call => call[1] === 'change' || true);
    const listener = onCall[0];
    
    // Simulate external change
    listener({ 
      theme: { newValue: 'dark', oldValue: 'light' } 
    }, 'local');
    
    expect(storage.cache.get('theme')).toBe('dark');
    expect(changeCallback).toHaveBeenCalledWith({ newValue: 'dark', oldValue: 'light' });
  });
});
