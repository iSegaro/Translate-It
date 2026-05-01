import { describe, it, expect, vi } from 'vitest';

// We mock the modules that are dynamicly imported in index.js
vi.mock('./SelectElementManager.js', () => ({
  SelectElementManager: class MockManager {},
  default: class MockManager {}
}));

vi.mock('./core/ElementSelector.js', () => ({
  ElementSelector: class MockSelector {}
}));

vi.mock('./core/DomTranslatorAdapter.js', () => ({
  DomTranslatorAdapter: class MockAdapter {}
}));

vi.mock('./handlers/handleActivateSelectElementMode.js', () => ({
  default: vi.fn()
}));

vi.mock('./handlers/handleDeactivateSelectElementMode.js', () => ({
  default: vi.fn()
}));

vi.mock('./handlers/handleGetSelectElementState.js', () => ({
  default: vi.fn()
}));

vi.mock('./handlers/handleSetSelectElementState.js', () => ({
  default: vi.fn()
}));

vi.mock('./constants/SelectElementModes.js', () => ({
  SelectElementModes: { ACTIVE: 'active' }
}));

import * as ElementSelectionIndex from './index.js';

describe('Element Selection Index', () => {
  it('should load core modules', async () => {
    const core = await ElementSelectionIndex.loadElementSelectionCore();
    
    expect(core.SelectElementManager).toBeDefined();
    expect(core.ElementSelector).toBeDefined();
    expect(core.DomTranslatorAdapter).toBeDefined();
  });

  it('should load handlers', async () => {
    const handlers = await ElementSelectionIndex.loadElementSelectionHandlers();
    
    expect(handlers).toHaveLength(4);
    expect(handlers.every(h => h.default !== undefined)).toBe(true);
  });

  it('should load constants', async () => {
    const constants = await ElementSelectionIndex.loadElementSelectionConstants();
    expect(constants.SelectElementModes).toBeDefined();
  });

  it('should provide getSelectElementManagerAsync for backward compatibility', async () => {
    const manager = await ElementSelectionIndex.getSelectElementManagerAsync();
    expect(manager).toBeDefined();
  });

  it('should export ElementSelection facade', () => {
    const { ElementSelection } = ElementSelectionIndex;
    expect(ElementSelection.loadCore).toBeDefined();
    expect(ElementSelection.loadHandlers).toBeDefined();
    expect(ElementSelection.loadConstants).toBeDefined();
    expect(ElementSelection.getManagerAsync).toBeDefined();
  });
});
