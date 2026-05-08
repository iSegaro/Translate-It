import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStorage, useStorageItem } from './useStorage.js';
import { storageCore } from '../core/StorageCore.js';
import { nextTick } from 'vue';

// Mock storageCore
vi.mock('../core/StorageCore.js', () => ({
  storageCore: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCached: vi.fn()
  }
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}));

import { mount } from '@vue/test-utils';

// Helper to test composables
function withSetup(composable) {
  let result;
  const wrapper = mount({
    setup() {
      result = composable();
      return () => {};
    },
    template: '<div></div>'
  });
  return [result, wrapper];
}

describe('useStorage Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync with external changes via events', async () => {
    const [{ data }] = withSetup(() => useStorage(['theme']));
    
    // Now setupListeners should have been called in onMounted
    const listenerCall = storageCore.on.mock.calls.find(call => call[0] === 'change:theme');
    expect(listenerCall).toBeDefined();
    const listener = listenerCall[1];
    
    // Simulate external change
    listener({ newValue: 'auto' });
    
    expect(data.theme).toBe('auto');
  });

  it('should load data on mount if immediate is true', async () => {
    storageCore.get.mockResolvedValue({ theme: 'dark' });
    
    const [{ data }] = withSetup(() => useStorage(['theme']));

    // Wait for async load in onMounted
    await nextTick();
    await nextTick(); // Second tick for the internal promise resolution
    
    expect(data.theme).toBe('dark');
  });

  it('should update reactive data when save is called', async () => {
    storageCore.set.mockResolvedValue(true);
    const [{ data, save }] = withSetup(() => useStorage(['theme']));
    
    await save({ theme: 'light' });
    
    expect(data.theme).toBe('light');
    expect(storageCore.set).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('should remove keys from reactive data', async () => {
    storageCore.remove.mockResolvedValue(true);
    const [{ data, remove }] = withSetup(() => useStorage(['theme']));
    data.theme = 'dark';
    
    await remove('theme');
    
    expect(data.theme).toBeUndefined();
    expect(storageCore.remove).toHaveBeenCalledWith(['theme']);
  });
});

describe('useStorageItem Composable', () => {
  it('should auto-save when value changes', async () => {
    storageCore.get.mockResolvedValue({ theme: 'auto' });
    storageCore.set.mockResolvedValue(true);
    
    const [{ value }] = withSetup(() => useStorageItem('theme', 'auto', { debounceMs: 0, immediate: false }));
    
    value.value = 'dark';
    
    // Watchers are async in Vue
    await nextTick();
    
    expect(storageCore.set).toHaveBeenCalledWith({ theme: 'dark' });
  });
});
