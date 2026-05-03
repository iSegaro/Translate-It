import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedModeCoordinator } from './UnifiedModeCoordinator.js';
import { TranslationMode } from '@/shared/config/config.js';
import { RequestStatus } from './TranslationRequestTracker.js';

// Mock RateLimitManager
vi.mock('@/features/translation/core/RateLimitManager.js', () => ({
  TranslationPriority: {
    HIGH: 10,
    NORMAL: 5,
    LOW: 1
  }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(err => 'UNKNOWN'),
  isFatalError: vi.fn(err => false)
}));

describe('UnifiedModeCoordinator', () => {
  let coordinator;
  let mockEngine;

  beforeEach(() => {
    coordinator = new UnifiedModeCoordinator();
    mockEngine = {
      getProvider: vi.fn(),
      handleTranslateMessage: vi.fn(),
      lifecycleRegistry: {
        registerRequest: vi.fn(() => new AbortController()),
        unregisterRequest: vi.fn()
      }
    };
  });

  describe('processRequest', () => {
    it('should set status to PROCESSING and assign priority', async () => {
      const request = {
        mode: TranslationMode.Field,
        data: {}
      };

      // Mock processFieldTranslation to avoid further depth in this test
      coordinator.processFieldTranslation = vi.fn().mockResolvedValue({ success: true });

      await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(request.status).toBe(RequestStatus.PROCESSING);
      expect(request.data.priority).toBe(10); // HIGH for Field mode
    });

    it('should assign LOW priority to Page and Select_Element modes', async () => {
      const request = { mode: TranslationMode.Page, data: {} };
      coordinator.processPageTranslation = vi.fn().mockResolvedValue({ success: true });
      await coordinator.processRequest(request, { translationEngine: mockEngine });
      expect(request.data.priority).toBe(1); // LOW
    });

    it('should delegate to processFieldTranslation for Field mode', async () => {
      const request = {
        mode: TranslationMode.Field,
        data: {},
        messageId: 'm1',
        sender: { tab: { id: 1 } }
      };
      
      const expectedResult = { success: true, translatedText: 'hi' };
      mockEngine.handleTranslateMessage.mockResolvedValue(expectedResult);

      const result = await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(mockEngine.handleTranslateMessage).toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });

    it('should delegate to processPageTranslation for Page mode', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { text: JSON.stringify([{ text: 'hello' }]), provider: 'google' },
        messageId: 'm1'
      };

      const mockProvider = {
        translate: vi.fn().mockResolvedValue(['bonjour'])
      };
      mockEngine.getProvider.mockResolvedValue(mockProvider);

      const result = await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(result.success).toBe(true);
      expect(JSON.parse(result.translatedText)[0].text).toBe('bonjour');
    });

    it('should delegate to processStandardTranslation for other modes', async () => {
      const request = { mode: TranslationMode.Selection, data: { text: 'test' }, messageId: 'm1' };
      await coordinator.processRequest(request, { translationEngine: mockEngine });
      expect(mockEngine.handleTranslateMessage).toHaveBeenCalled();
    });
  });

  describe('processPageTranslation', () => {
    it('should handle array of segments correctly', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { 
          text: [{ text: 'p1' }, { text: 'p2' }], 
          provider: 'openai',
          sourceLanguage: 'en',
          targetLanguage: 'fa'
        },
        messageId: 'm-page'
      };

      const mockProvider = {
        translate: vi.fn().mockResolvedValue(['ت۱', 'ت۲'])
      };
      mockEngine.getProvider.mockResolvedValue(mockProvider);

      const result = await coordinator.processPageTranslation(request, { translationEngine: mockEngine });

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.translatedText);
      expect(parsed[0].text).toBe('ت۱');
      expect(parsed[1].text).toBe('ت۲');
      expect(mockProvider.translate).toHaveBeenCalledWith(
        ['p1', 'p2'], 'en', 'fa', expect.any(Object)
      );
    });

    it('should fallback to "auto" for source language in Page mode', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { text: [{ text: 'p1' }], provider: 'google', targetLanguage: 'fa' },
        messageId: 'm1'
      };
      const mockProvider = { translate: vi.fn().mockResolvedValue(['ت۱']) };
      mockEngine.getProvider.mockResolvedValue(mockProvider);

      await coordinator.processPageTranslation(request, { translationEngine: mockEngine });

      expect(mockProvider.translate).toHaveBeenCalledWith(
        ['p1'], 'auto', 'fa', expect.any(Object)
      );
    });

    it('should handle non-array response from provider', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { text: [{ text: 'p1' }], provider: 'google' },
        messageId: 'm1'
      };
      mockEngine.getProvider.mockResolvedValue({
        translate: vi.fn().mockResolvedValue({ translatedText: 'single' })
      });

      const result = await coordinator.processPageTranslation(request, { translationEngine: mockEngine });
      expect(JSON.parse(result.translatedText)[0].text).toBe('single');
    });

    it('should throw if no text provided', async () => {
      const request = { mode: TranslationMode.Page, data: {}, messageId: 'm1' };
      await expect(coordinator.processPageTranslation(request, { translationEngine: mockEngine }))
        .rejects.toThrow('No text provided');
    });

    it('should handle provider initialization failure', async () => {
      const request = { mode: TranslationMode.Page, data: { text: '[]', provider: 'invalid' }, messageId: 'm1' };
      mockEngine.getProvider.mockResolvedValue(null);
      await expect(coordinator.processPageTranslation(request, { translationEngine: mockEngine }))
        .rejects.toThrow("Provider 'invalid' initialization failed");
    });

    it('should handle provider errors gracefully and return fallback', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { text: [{ text: 'orig' }], provider: 'google' },
        messageId: 'm-err'
      };

      mockEngine.getProvider.mockResolvedValue({
        translate: vi.fn().mockRejectedValue(new Error('API Down'))
      });

      const result = await coordinator.processPageTranslation(request, { translationEngine: mockEngine });

      expect(result.success).toBe(true); // Should return success true for Page mode partial failure
      expect(result.hasError).toBe(true);
      expect(JSON.parse(result.translatedText)[0].text).toBe('orig');
    });
  });

  describe('processSelectElementTranslation', () => {
    it('should enhance data with forceStreaming', async () => {
      const request = {
        mode: TranslationMode.Select_Element,
        data: { text: 'some text' },
        messageId: 'm-sel',
        sender: { tab: { id: 1 } }
      };

      await coordinator.processSelectElementTranslation(request, { translationEngine: mockEngine });

      expect(mockEngine.handleTranslateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            options: expect.objectContaining({ forceStreaming: true })
          })
        }),
        request.sender
      );
    });
  });

  describe('processFieldTranslation', () => {
    it('should call handleTranslateMessage with Field mode', async () => {
      const request = { mode: TranslationMode.Field, data: { text: 'hi' }, messageId: 'm1' };
      await coordinator.processFieldTranslation(request, { translationEngine: mockEngine });
      expect(mockEngine.handleTranslateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: TranslationMode.Field })
        }),
        undefined
      );
    });
  });
});
