import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';

const { mockEmit, mockSettingsGet, mockDetect } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockSettingsGet: vi.fn((key, def) => {
    if (key === 'EXTENSION_ENABLED') return true;
    if (key === 'TRANSLATE_ON_TEXT_FIELDS') return true;
    return def;
  }),
  mockDetect: vi.fn(() => Promise.resolve({ shouldShowTextFieldIcon: true }))
}));

// Mock state
vi.mock('@/shared/config/config.js', () => ({
  state: {
    preventTextFieldIconCreation: false,
    activeTranslateIcon: null
  }
}));

// 1. Mock dependencies FIRST
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn(path => path),
      id: 'test-id'
    },
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        remove: vi.fn(() => Promise.resolve()),
        clear: vi.fn(() => Promise.resolve())
      }
    }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    trace: vi.fn()
  }))
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: mockEmit,
    on: vi.fn(),
    off: vi.fn(),
    addEventListener: vi.fn()
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: mockSettingsGet,
    onChange: vi.fn(() => vi.fn())
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  ExtensionContextManager: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false)
  },
  default: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false)
  }
}));

const mockExclusionChecker = {
  isFeatureAllowed: vi.fn(() => Promise.resolve(true))
};

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: vi.fn(() => mockExclusionChecker)
  }
}));

vi.mock('../utils/PositionCalculator.js', () => ({
  PositionCalculator: {
    calculateOptimalPosition: vi.fn(() => ({ top: 100, left: 100, placement: 'top-right' })),
    getDebugInfo: vi.fn(() => ({}))
  }
}));

vi.mock('../utils/ElementAttachment.js', () => ({
  ElementAttachment: class {
    constructor() {
      this.attach = vi.fn();
      this.detach = vi.fn();
      this.getStatus = vi.fn(() => ({}));
      this.forceUpdate = vi.fn();
    }
  }
}));

vi.mock('../utils/TextFieldDetector.js', () => ({
  textFieldDetector: {
    detect: mockDetect
  }
}));

// Mock ResourceTracker
vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {}
    addEventListener() {}
    trackResource() {}
    cleanup() {}
    destroy() {}
  }
}));

// Mock smartTranslationIntegration to avoid dynamic import issues
vi.mock('@/handlers/smartTranslationIntegration.js', () => ({
  translateFieldViaSmartHandler: vi.fn()
}));

// 2. Import after mocks
import { TextFieldIconManager } from './TextFieldIconManager.js';
import { ExtensionContextManager } from '@/core/extensionContext.js';
import { state } from '@/shared/config/config.js';

describe('TextFieldIconManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    TextFieldIconManager.resetInstance();
    manager = TextFieldIconManager.getInstance();
    
    // Mock location properly
    vi.stubGlobal('location', { protocol: 'https:' });
    vi.stubGlobal('window', { ...global.window, location: { protocol: 'https:' } });
    
    // Default mocks
    mockSettingsGet.mockImplementation((key, def) => {
      if (key === 'EXTENSION_ENABLED') return true;
      if (key === 'TRANSLATE_ON_TEXT_FIELDS') return true;
      return def;
    });

    vi.mocked(ExtensionContextManager.isValidSync).mockReturnValue(true);
    state.preventTextFieldIconCreation = false;
    state.activeTranslateIcon = null;
  });

  afterEach(() => {
    TextFieldIconManager.resetInstance();
    vi.unstubAllGlobals();
  });

  it('should implement singleton pattern', () => {
    const instance2 = TextFieldIconManager.getInstance();
    expect(instance2).toBe(manager);
  });

  it('should initialize and setup listeners', () => {
    manager.initialize();
    expect(manager.initialized).toBe(true);
  });

  describe('isEditableElement', () => {
    it('should use TextFieldDetector', async () => {
      const el = document.createElement('textarea');
      const result = await manager.isEditableElement(el);
      
      expect(result).toBe(true);
      expect(mockDetect).toHaveBeenCalledWith(el);
    });
  });

  describe('shouldProcessTextField', () => {
    it('should return true when all conditions are met', async () => {
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBe(true);
    });

    it('should return null if extension is disabled', async () => {
      mockSettingsGet.mockImplementation((key) => key === 'EXTENSION_ENABLED' ? false : true);
      
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBeNull();
    });

    it('should return null if context is invalid', async () => {
      vi.mocked(ExtensionContextManager.isValidSync).mockReturnValue(false);
      
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBeNull();
    });

    it('should return null if protocol is invalid', async () => {
      vi.stubGlobal('location', { protocol: 'chrome-extension:' });
      vi.stubGlobal('window', { location: { protocol: 'chrome-extension:' } });
      
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBeNull();
    });

    it('should return false if exclusion checker denies', async () => {
      mockExclusionChecker.isFeatureAllowed.mockResolvedValue(false);
      
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBe(false);
    });

    it('should return false if state prevents creation', async () => {
      state.preventTextFieldIconCreation = true;
      
      const el = document.createElement('textarea');
      const result = await manager.shouldProcessTextField(el);
      expect(result).toBe(false);
    });
  });

  describe('handleEditableFocus', () => {
    it('should call processEditableElement if feature is on', async () => {
      const spy = vi.spyOn(manager, 'processEditableElement');
      manager.featureManager = { isOn: vi.fn(() => true) };
      
      const el = document.createElement('textarea');
      Object.defineProperty(el, 'isConnected', { value: true });
      
      await manager.handleEditableFocus(el);
      expect(spy).toHaveBeenCalledWith(el);
    });

    it('should NOT call processEditableElement if feature is off', async () => {
      const spy = vi.spyOn(manager, 'processEditableElement');
      manager.featureManager = { isOn: vi.fn(() => false) };
      
      const el = document.createElement('textarea');
      Object.defineProperty(el, 'isConnected', { value: true });
      
      await manager.handleEditableFocus(el);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('handleEditableBlur', () => {
    it('should call cleanup after delay', async () => {
      const spy = vi.spyOn(manager, 'cleanup');
      
      const el = document.createElement('textarea');
      Object.defineProperty(el, 'isConnected', { value: true });
      
      manager.handleEditableBlur(el);
      
      await flushPromises();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('executeTranslation', () => {
    it('should call translateFieldViaSmartHandler and cleanup', async () => {
      const { translateFieldViaSmartHandler } = await import('@/handlers/smartTranslationIntegration.js');
      const spy = vi.spyOn(manager, 'cleanupElement');
      
      const el = document.createElement('textarea');
      el.value = 'hello';
      const iconData = { targetElement: el };
      
      await manager.executeTranslation(iconData);
      
      expect(translateFieldViaSmartHandler).toHaveBeenCalledWith({
        text: 'hello',
        target: el
      });
      expect(spy).toHaveBeenCalledWith(el);
    });
  });

  describe('cleanup', () => {
    it('should remove all icons and attachments', async () => {
      const el = document.createElement('textarea');
      Object.defineProperty(el, 'isConnected', { value: true });
      document.body.appendChild(el);
      
      // Manually add an icon and attachment to test cleanup
      const iconId = 'test-icon';
      manager.activeIcons.set(el, { id: iconId });
      const { ElementAttachment } = await import('../utils/ElementAttachment.js');
      const attachment = new ElementAttachment();
      manager.iconAttachments.set(iconId, attachment);
      
      manager.cleanup();
      
      expect(manager.activeIcons.size).toBe(0);
      expect(manager.iconAttachments.size).toBe(0);
      expect(attachment.detach).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith('remove-all-field-icons');
      
      document.body.removeChild(el);
    });
  });

  describe('destroy', () => {
    it('should fully cleanup and reset singleton', () => {
      const spy = vi.spyOn(manager, 'cleanup');
      manager.destroy();
      
      expect(spy).toHaveBeenCalled();
      expect(TextFieldIconManager.getInstance()).not.toBe(manager);
    });
  });
});
