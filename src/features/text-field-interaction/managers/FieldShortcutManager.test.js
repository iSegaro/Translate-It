import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock dependencies FIRST
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      id: 'test-id'
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn()
      }
    }
  }
}));

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(() => Promise.resolve({ success: true }))
}));

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn()
  }))
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn(() => Promise.resolve())
    }))
  }
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {
    TRANSLATION_FAILED: 'TRANSLATION_FAILED'
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn((key, def) => {
      if (key === 'TEXT_FIELD_SHORTCUT') return 'Ctrl+/';
      if (key === 'EXTENSION_ENABLED') return true;
      if (key === 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS') return true;
      return def;
    }),
    onChange: vi.fn(() => vi.fn())
  }
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: mockSendMessage
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessageFormat: {
    create: vi.fn((action, data) => ({ action, data }))
  },
  MessagingContexts: { CONTENT: 'content' }
}));

vi.mock('@/shared/constants/detection.js', () => ({
  INPUT_TYPES: {
    ALL_TEXT_FIELDS: ['text', 'search', 'tel', 'url', 'email', 'password', 'number']
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Field: 'field'
  }
}));

import { FieldShortcutManager } from './FieldShortcutManager.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

describe('FieldShortcutManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Re-apply default mock implementations
    vi.mocked(settingsManager.get).mockImplementation((key, def) => {
      if (key === 'TEXT_FIELD_SHORTCUT') return 'Ctrl+/';
      if (key === 'EXTENSION_ENABLED') return true;
      if (key === 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS') return true;
      return def;
    });
    
    manager = new FieldShortcutManager();
    manager.initialize({ featureManager: {} });
  });

  describe('parseShortcut', () => {
    it('should parse simple shortcut', () => {
      const parsed = manager.parseShortcut('Ctrl+/');
      expect(parsed).toEqual({
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        key: '/'
      });
    });

    it('should parse complex shortcut', () => {
      const parsed = manager.parseShortcut('Ctrl+Alt+Shift+T');
      expect(parsed).toEqual({
        ctrl: true,
        alt: true,
        shift: true,
        meta: false,
        key: 't'
      });
    });

    it('should parse Cmd/Meta shortcut', () => {
      const parsed = manager.parseShortcut('Cmd+T');
      expect(parsed).toEqual({
        ctrl: false,
        alt: false,
        shift: false,
        meta: true,
        key: 't'
      });
    });
  });

  describe('initialize', () => {
    it('should set initialized to true and call updateShortcut', () => {
      const newManager = new FieldShortcutManager();
      const featureManager = { id: 'fm' };
      newManager.initialize({ featureManager });
      
      expect(newManager.initialized).toBe(true);
      expect(newManager.featureManager).toBe(featureManager);
      expect(newManager.currentShortcut).toBe('Ctrl+/');
    });

    it('should subscribe to settings changes', () => {
      const onChangeMock = vi.fn(() => vi.fn());
      vi.mocked(settingsManager.onChange).mockImplementation(onChangeMock);
      
      manager.initialize({ featureManager: {} });
      
      expect(onChangeMock).toHaveBeenCalledWith('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', expect.any(Function), 'field-shortcut-manager');
      expect(onChangeMock).toHaveBeenCalledWith('TEXT_FIELD_SHORTCUT', expect.any(Function), 'field-shortcut-manager');
    });
  });

  describe('updateShortcut', () => {
    it('should update currentShortcut from settings', () => {
      vi.mocked(settingsManager.get).mockImplementation((key, def) => {
        if (key === 'TEXT_FIELD_SHORTCUT') return 'Alt+T';
        return def;
      });
      
      manager.updateShortcut();
      expect(manager.currentShortcut).toBe('Alt+T');
      expect(manager.parsedShortcut.key).toBe('t');
      expect(manager.parsedShortcut.alt).toBe(true);
    });
  });

  describe('isShortcutEvent', () => {
    it('should match Ctrl+/', () => {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: '/'
      });
      expect(manager.isShortcutEvent(event)).toBe(true);
    });

    it('should NOT match if modifier missing', () => {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: false,
        key: '/'
      });
      expect(manager.isShortcutEvent(event)).toBe(false);
    });

    it('should NOT match if key differs', () => {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: 'a'
      });
      expect(manager.isShortcutEvent(event)).toBe(false);
    });

    it('should return false for repeat events', () => {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: '/',
        repeat: true
      });
      expect(manager.isShortcutEvent(event)).toBe(false);
    });

    it('should return false for modifier keys by themselves', () => {
      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: 'Control'
      });
      expect(manager.isShortcutEvent(event)).toBe(false);
    });
  });

  describe('shouldExecute', () => {
    it('should return true for valid event on textarea', async () => {
      const el = document.createElement('textarea');
      el.value = 'test content';
      document.body.appendChild(el);
      el.focus();

      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: '/'
      });

      const result = await manager.shouldExecute(event);
      expect(result).toBe(true);

      document.body.removeChild(el);
    });

    it('should return false if event is not shortcut', async () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      expect(await manager.shouldExecute(event)).toBe(false);
    });

    it('should return false if not initialized', async () => {
      const uninitManager = new FieldShortcutManager();
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: '/' });
      expect(await uninitManager.shouldExecute(event)).toBe(false);
    });

    it('should return false if extension is disabled', async () => {
      vi.mocked(settingsManager.get).mockImplementation((key, def) => {
        if (key === 'EXTENSION_ENABLED') return false;
        return def;
      });
      
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: '/' });
      expect(await manager.shouldExecute(event)).toBe(false);
    });

    it('should return false if shortcut feature is disabled', async () => {
      vi.mocked(settingsManager.get).mockImplementation((key, def) => {
        if (key === 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS') return false;
        return def;
      });
      
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: '/' });
      expect(await manager.shouldExecute(event)).toBe(false);
    });

    it('should return false if active element is not editable', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      el.focus();

      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: '/' });
      expect(await manager.shouldExecute(event)).toBe(false);

      document.body.removeChild(el);
    });

    it('should return false if field is empty', async () => {
      const el = document.createElement('textarea');
      el.value = '';
      document.body.appendChild(el);
      el.focus();

      const event = new KeyboardEvent('keydown', {
        ctrlKey: true,
        key: '/'
      });

      const result = await manager.shouldExecute(event);
      expect(result).toBe(false);

      document.body.removeChild(el);
    });
  });

  describe('execute', () => {
    it('should send translation message and return success', async () => {
      const el = document.createElement('textarea');
      el.value = 'hello';
      document.body.appendChild(el);
      el.focus();

      const result = await manager.execute();
      
      expect(result.success).toBe(true);
      expect(result.type).toBe('ctrl-slash');
      expect(mockSendMessage).toHaveBeenCalled();
      
      document.body.removeChild(el);
    });

    it('should return failure if sendMessage fails', async () => {
      const el = document.createElement('textarea');
      el.value = 'hello';
      document.body.appendChild(el);
      el.focus();

      mockSendMessage.mockResolvedValueOnce({ success: false, error: 'API Error' });

      const result = await manager.execute();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
      
      document.body.removeChild(el);
    });

    it('should handle exceptions and return failure', async () => {
      const el = document.createElement('textarea');
      el.value = 'hello';
      document.body.appendChild(el);
      el.focus();

      mockSendMessage.mockRejectedValueOnce(new Error('Network Error'));

      const result = await manager.execute();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network Error');
      
      document.body.removeChild(el);
    });
  });

  describe('isEditableElement', () => {
    it('should return true for input text', () => {
      const el = document.createElement('input');
      el.type = 'text';
      expect(manager.isEditableElement(el)).toBe(true);
    });

    it('should return true for textarea', () => {
      const el = document.createElement('textarea');
      expect(manager.isEditableElement(el)).toBe(true);
    });

    it('should return true for contentEditable', () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      expect(manager.isEditableElement(el)).toBe(true);
    });

    it('should return false for non-editable elements', () => {
      const el = document.createElement('div');
      expect(manager.isEditableElement(el)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe and reset state', () => {
      const unsubscribe = vi.fn();
      vi.mocked(settingsManager.onChange).mockReturnValue(unsubscribe);
      
      manager.initialize({ featureManager: {} });
      manager.cleanup();
      
      expect(unsubscribe).toHaveBeenCalled();
      expect(manager.initialized).toBe(false);
      expect(manager.featureManager).toBeNull();
    });
  });

  describe('getInfo', () => {
    it('should return info object', () => {
      const info = manager.getInfo();
      expect(info.type).toBe('FieldShortcutManager');
      expect(info.initialized).toBe(true);
    });
  });
});
