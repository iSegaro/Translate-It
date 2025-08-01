// src/components/core/__tests__/EnhancedUnifiedMessenger.test.js
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedUnifiedMessenger } from '@/core/EnhancedUnifiedMessenger.js';

// Mock browser API
const mockBrowser = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

// Mock isFirefox function
vi.mock('@/utils/browserCompat.js', () => ({
  isFirefox: vi.fn().mockResolvedValue(false)
}));

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: mockBrowser
}));

describe('EnhancedUnifiedMessenger', () => {
  let messenger;
  let mockSendMessage;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock sendMessage
    mockSendMessage = vi.fn();
    mockBrowser.runtime.sendMessage = mockSendMessage;
    
    // Create messenger instance
    messenger = new EnhancedUnifiedMessenger('test-context');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct context', () => {
      expect(messenger.context).toBe('test-context');
      expect(messenger.specialized).toBeDefined();
      expect(messenger.specialized.tts).toBeDefined();
      expect(messenger.specialized.capture).toBeDefined();
      expect(messenger.specialized.selection).toBeDefined();
      expect(messenger.specialized.translation).toBeDefined();
    });

    test('should initialize Firefox compatibility properties', () => {
      expect(messenger.isFirefox).toBe(false);
      expect(messenger.isMV3).toBe(true);
      expect(messenger.firefoxCompatibilityMode).toBe(false);
    });

    test('should have enhanced version', () => {
      const info = messenger.getInfo();
      expect(info.version).toBe('2.0');
      expect(info.enhanced).toBe(true);
      expect(info.specialized).toEqual(['tts', 'capture', 'selection', 'translation']);
    });
  });

  describe('Enhanced Message Sending', () => {
    test('should send enhanced message with metadata', async () => {
      const mockResponse = { success: true, data: 'test response' };
      mockSendMessage.mockResolvedValue(mockResponse);

      const result = await messenger.sendMessage({
        action: 'TEST_ACTION',
        data: { test: 'data' }
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TEST_ACTION',
          data: { test: 'data' },
          context: 'test-context',
          version: '2.0',
          timestamp: expect.any(Number),
          messageId: expect.any(String),
          browserInfo: {
            isFirefox: false,
            isMV3: true,
            compatibilityMode: false
          }
        }),
        10000
      );

      expect(result).toEqual(mockResponse);
    });

    test('should generate unique message IDs', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.sendMessage({ action: 'TEST1' });
      await messenger.sendMessage({ action: 'TEST2' });

      const calls = mockSendMessage.mock.calls;
      expect(calls[0][0].messageId).not.toBe(calls[1][0].messageId);
    });

    test('should handle errors with enhanced error info', async () => {
      const originalError = new Error('Test error');
      mockSendMessage.mockRejectedValue(originalError);

      try {
        await messenger.sendMessage({ action: 'FAIL_ACTION' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.context).toBe('test-context');
        expect(error.action).toBe('FAIL_ACTION');
        expect(error.originalError).toBe(originalError);
        expect(error.isFirefox).toBe(false);
        expect(error.firefoxCompatibilityMode).toBe(false);
      }
    });
  });

  describe('Specialized TTS Messenger', () => {
    test('should speak text with proper options', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.specialized.tts.speak('Hello world', 'en-US', {
        rate: 1.2,
        pitch: 1.1,
        volume: 0.8
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TTS_SPEAK',
          target: 'offscreen',
          data: {
            text: 'Hello world',
            language: 'en-US',
            rate: 1.2,
            pitch: 1.1,
            volume: 0.8,
            voice: null
          }
        }),
        10000
      );
    });

    test('should throw error for empty text', async () => {
      await expect(messenger.specialized.tts.speak('')).rejects.toThrow(
        'Text to speak cannot be empty'
      );
    });

    test('should stop TTS', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.specialized.tts.stop();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TTS_STOP',
          target: 'offscreen'
        }),
        10000
      );
    });

    test('should get voices', async () => {
      const mockVoices = [{ name: 'Voice 1' }, { name: 'Voice 2' }];
      mockSendMessage.mockResolvedValue({ voices: mockVoices });

      const voices = await messenger.specialized.tts.getVoices();

      expect(voices).toEqual(mockVoices);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TTS_GET_VOICES',
          target: 'offscreen'
        }),
        10000
      );
    });
  });

  describe('Specialized Capture Messenger', () => {
    test('should capture screen with options', async () => {
      mockSendMessage.mockResolvedValue({ success: true, imageData: 'base64data' });

      await messenger.specialized.capture.captureScreen({
        mode: 'selection',
        format: 'png',
        quality: 0.9
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SCREEN_CAPTURE',
          target: 'offscreen',
          data: {
            mode: 'selection',
            format: 'png',
            quality: 0.9
          }
        }),
        10000
      );
    });

    test('should capture visible tab', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.specialized.capture.captureVisibleTab();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SCREEN_CAPTURE',
          data: expect.objectContaining({
            mode: 'visible'
          })
        }),
        10000
      );
    });

    test('should process image OCR', async () => {
      mockSendMessage.mockResolvedValue({ success: true, text: 'Extracted text' });

      await messenger.specialized.capture.processImageOCR('base64imagedata', {
        targetLanguage: 'fa',
        sourceLanguage: 'en'
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROCESS_IMAGE_OCR',
          data: {
            imageData: 'base64imagedata',
            targetLanguage: 'fa',
            sourceLanguage: 'en'
          }
        }),
        10000
      );
    });

    test('should throw error for missing image data in OCR', async () => {
      await expect(messenger.specialized.capture.processImageOCR('')).rejects.toThrow(
        'Image data is required for OCR processing'
      );
    });
  });

  describe('Specialized Selection Messenger', () => {
    test('should activate selection mode', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.specialized.selection.activateMode('translate', {
        tabId: 123,
        highlightColor: '#ff0000'
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'activateSelectElementMode',
          data: {
            mode: 'translate',
            tabId: 123,
            highlightColor: '#ff0000',
            showTooltip: true
          }
        }),
        10000
      );
    });

    test('should deactivate selection mode', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      await messenger.specialized.selection.deactivateMode();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deactivateSelectElementMode'
        }),
        10000
      );
    });

    test('should get selection state', async () => {
      const mockState = { active: true, mode: 'translate' };
      mockSendMessage.mockResolvedValue(mockState);

      const state = await messenger.specialized.selection.getSelectionState();

      expect(state).toEqual(mockState);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'getSelectElementState'
        }),
        10000
      );
    });

    test('should process selected element', async () => {
      mockSendMessage.mockResolvedValue({ success: true, translation: 'translated' });

      const elementInfo = { id: 'element1', text: 'text to translate' };
      await messenger.specialized.selection.processSelectedElement(elementInfo, {
        targetLanguage: 'fa'
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'processSelectedElement',
          data: {
            elementInfo,
            targetLanguage: 'fa',
            sourceLanguage: 'auto'
          }
        }),
        10000
      );
    });

    test('should throw error for missing element info', async () => {
      await expect(messenger.specialized.selection.processSelectedElement(null)).rejects.toThrow(
        'Element information is required'
      );
    });
  });

  describe('Specialized Translation Messenger', () => {
    test('should translate text', async () => {
      mockSendMessage.mockResolvedValue({ success: true, translatedText: 'متن ترجمه شده' });

      await messenger.specialized.translation.translate('Hello world', {
        provider: 'google',
        from: 'en',
        to: 'fa'
      });

      // Should call the parent translate method which uses TRANSLATE action
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRANSLATE',
          data: expect.objectContaining({
            text: 'Hello world',
            provider: 'google',
            sourceLanguage: 'en',
            targetLanguage: 'fa'
          })
        }),
        10000
      );
    });

    test('should throw error for empty text translation', async () => {
      await expect(messenger.specialized.translation.translate('')).rejects.toThrow(
        'Text to translate cannot be empty'
      );
    });

    test('should get translation history', async () => {
      const mockHistory = [{ text: 'Hello', translation: 'سلام' }];
      mockSendMessage.mockResolvedValue({ history: mockHistory });

      const history = await messenger.specialized.translation.getHistory({ limit: 50 });

      expect(history).toEqual(mockHistory);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GET_HISTORY',
          data: {
            limit: 50,
            offset: 0
          }
        }),
        10000
      );
    });

    test('should get providers', async () => {
      const mockProviders = ['google', 'bing', 'yandex'];
      mockSendMessage.mockResolvedValue({ providers: mockProviders });

      const providers = await messenger.specialized.translation.getProviders();

      expect(providers).toEqual(mockProviders);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GET_PROVIDERS'
        }),
        10000
      );
    });

    test('should test provider connection', async () => {
      mockSendMessage.mockResolvedValue({ success: true, connected: true });

      await messenger.specialized.translation.testProvider('google');

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TEST_PROVIDER',
          data: { provider: 'google' }
        }),
        10000
      );
    });

    test('should throw error for missing provider name in test', async () => {
      await expect(messenger.specialized.translation.testProvider('')).rejects.toThrow(
        'Provider name is required'
      );
    });

    test('should batch translate texts', async () => {
      const texts = ['Hello', 'World'];
      const mockResults = [{ text: 'Hello', translation: 'سلام' }, { text: 'World', translation: 'جهان' }];
      mockSendMessage.mockResolvedValue(mockResults);

      const results = await messenger.specialized.translation.batchTranslate(texts, {
        provider: 'google',
        from: 'en',
        to: 'fa'
      });

      expect(results).toEqual(mockResults);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BATCH_TRANSLATE',
          data: {
            texts,
            provider: 'google',
            sourceLanguage: 'en',
            targetLanguage: 'fa'
          }
        }),
        10000
      );
    });

    test('should throw error for empty texts array in batch translate', async () => {
      await expect(messenger.specialized.translation.batchTranslate([])).rejects.toThrow(
        'Array of texts is required for batch translation'
      );
    });
  });

  describe('Ping Functionality', () => {
    test('should send ping message', async () => {
      mockSendMessage.mockResolvedValue({ success: true, message: 'pong' });

      const result = await messenger.ping();

      expect(result).toEqual({ success: true, message: 'pong' });
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ping',
          data: { from: 'test-context' }
        }),
        10000
      );
    });
  });

  describe('Specialized Messengers Testing', () => {
    test('should test all specialized messengers', async () => {
      mockSendMessage.mockResolvedValue({ success: true, message: 'pong' });

      const results = await messenger.testSpecializedMessengers();

      expect(results.success).toBe(true);
      expect(results.context).toBe('test-context');
      expect(results.results.ping).toEqual({ success: true, message: 'pong' });
      expect(results.results.tts.available).toBe(true);
      expect(results.results.capture.available).toBe(true);
      expect(results.results.selection.available).toBe(true);
      expect(results.results.translation.available).toBe(true);
    });

    test('should handle test failure gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Connection failed'));

      const results = await messenger.testSpecializedMessengers();

      expect(results.success).toBe(false);
      expect(results.error).toBe('Connection failed');
      expect(results.context).toBe('test-context');
    });
  });
});