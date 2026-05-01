import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useElementSelectionLazy } from './useElementSelectionLazy.js';

// Mock dependencies
vi.mock('../ElementSelectionFactory.js', () => ({
  ElementSelectionFactory: {
    getSelectElementManager: vi.fn(),
    getElementSelectionHandlers: vi.fn(),
    getElementSelector: vi.fn(),
    getDomTranslatorAdapter: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(() => ({ size: 0 })),
    cache: new Map()
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

import { ElementSelectionFactory } from '../ElementSelectionFactory.js';

describe('useElementSelectionLazy', () => {
  let composable;

  beforeEach(() => {
    vi.clearAllMocks();
    composable = useElementSelectionLazy();
  });

  it('should initialize with default values', () => {
    expect(composable.isLoading.value).toBe(false);
    expect(composable.loadError.value).toBe(null);
    expect(composable.isManagerLoaded.value).toBe(false);
  });

  it('should load SelectElementManager and update status', async () => {
    const mockManager = { name: 'Manager' };
    ElementSelectionFactory.getSelectElementManager.mockResolvedValue(mockManager);

    const promise = composable.loadSelectElementManager();
    expect(composable.isLoading.value).toBe(true);
    
    const result = await promise;
    
    expect(result).toBe(mockManager);
    expect(composable.isLoading.value).toBe(false);
    expect(composable.isManagerLoaded.value).toBe(true);
    expect(ElementSelectionFactory.getSelectElementManager).toHaveBeenCalled();
  });

  it('should handle loading errors', async () => {
    const error = new Error('Load failed');
    ElementSelectionFactory.getSelectElementManager.mockRejectedValue(error);

    await expect(composable.loadSelectElementManager()).rejects.toThrow('Load failed');
    
    expect(composable.isLoading.value).toBe(false);
    expect(composable.loadError.value).toBe(error);
  });

  it('should not reload if already loaded', async () => {
    // Manually mark as loaded for this test's perspective in its own state
    // Note: useElementSelectionLazy has its own internal 'loadedModules' ref
    ElementSelectionFactory.getSelectElementManager.mockResolvedValue({ name: 'Manager' });
    
    await composable.loadSelectElementManager();
    expect(ElementSelectionFactory.getSelectElementManager).toHaveBeenCalledTimes(1);

    // Call again
    await composable.loadSelectElementManager();
    expect(ElementSelectionFactory.getSelectElementManager).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should load core modules in parallel', async () => {
    ElementSelectionFactory.getSelectElementManager.mockResolvedValue({ name: 'M' });
    ElementSelectionFactory.getElementSelector.mockResolvedValue({ name: 'S' });
    ElementSelectionFactory.getDomTranslatorAdapter.mockResolvedValue({ name: 'A' });

    const result = await composable.loadElementSelectionCore();

    expect(result.SelectElementManager).toBeDefined();
    expect(result.ElementSelector).toBeDefined();
    expect(result.DomTranslatorAdapter).toBeDefined();
    expect(composable.isManagerLoaded.value).toBe(true);
    expect(composable.isSelectorLoaded.value).toBe(true);
    expect(composable.isAdapterLoaded.value).toBe(true);
  });

  it('should clear cache', async () => {
    ElementSelectionFactory.getSelectElementManager.mockResolvedValue({});
    await composable.loadSelectElementManager();
    
    composable.clearCache();
    
    expect(ElementSelectionFactory.clearCache).toHaveBeenCalled();
    expect(composable.isManagerLoaded.value).toBe(false);
  });

  it('should provide stats', () => {
    const stats = composable.getStats();
    expect(stats).toHaveProperty('isLoading');
    expect(stats).toHaveProperty('loadedModules');
    expect(stats).toHaveProperty('factoryStats');
  });
});
