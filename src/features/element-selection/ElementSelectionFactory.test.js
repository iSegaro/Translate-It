import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

// Mock dynamic imports
vi.mock('./SelectElementManager.js', () => ({
  SelectElementManager: { name: 'MockSelectElementManager' }
}));

vi.mock('./core/ElementSelector.js', () => ({
  ElementSelector: { name: 'MockElementSelector' }
}));

vi.mock('./core/DomTranslatorAdapter.js', () => ({
  DomTranslatorAdapter: { name: 'MockDomTranslatorAdapter' }
}));

vi.mock('./handlers/handleActivateSelectElementMode.js', () => ({
  handleActivateSelectElementMode: vi.fn()
}));
vi.mock('./handlers/handleDeactivateSelectElementMode.js', () => ({
  handleDeactivateSelectElementMode: vi.fn()
}));
vi.mock('./handlers/handleGetSelectElementState.js', () => ({
  handleGetSelectElementState: vi.fn()
}));
vi.mock('./handlers/handleSetSelectElementState.js', () => ({
  handleSetSelectElementState: vi.fn()
}));

import { ElementSelectionFactory } from './ElementSelectionFactory.js';

describe('ElementSelectionFactory', () => {
  beforeEach(() => {
    ElementSelectionFactory.clearCache();
  });

  it('should load and cache SelectElementManager', async () => {
    const manager1 = await ElementSelectionFactory.getSelectElementManager();
    expect(manager1.name).toBe('MockSelectElementManager');

    const stats = ElementSelectionFactory.getCacheStats();
    expect(stats.cachedModules).toContain('SelectElementManager');

    const manager2 = await ElementSelectionFactory.getSelectElementManager();
    expect(manager2).toBe(manager1); // Should be same instance from cache
  });

  it('should load and cache ElementSelector', async () => {
    const selector = await ElementSelectionFactory.getElementSelector();
    expect(selector.name).toBe('MockElementSelector');
    expect(ElementSelectionFactory.getCacheStats().cachedModules).toContain('ElementSelector');
  });

  it('should load and cache DomTranslatorAdapter', async () => {
    const adapter = await ElementSelectionFactory.getDomTranslatorAdapter();
    expect(adapter.name).toBe('MockDomTranslatorAdapter');
    expect(ElementSelectionFactory.getCacheStats().cachedModules).toContain('DomTranslatorAdapter');
  });

  it('should load and cache handlers', async () => {
    const handlers = await ElementSelectionFactory.getElementSelectionHandlers();
    expect(handlers).toHaveProperty('handleActivateSelectElementMode');
    expect(handlers).toHaveProperty('handleDeactivateSelectElementMode');
    expect(ElementSelectionFactory.getCacheStats().cachedModules).toContain('ElementSelectionHandlers');
  });

  it('should clear cache', async () => {
    await ElementSelectionFactory.getSelectElementManager();
    expect(ElementSelectionFactory.getCacheStats().cacheSize).toBe(1);
    
    ElementSelectionFactory.clearCache();
    expect(ElementSelectionFactory.getCacheStats().cacheSize).toBe(0);
  });
});
