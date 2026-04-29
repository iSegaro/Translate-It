import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock extension polyfill before anything else
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Mock ErrorMatcher
vi.mock("@/shared/error-management/ErrorMatcher.js", () => ({
  isFatalError: vi.fn((err) => err.message === 'FATAL'),
  matchErrorToType: vi.fn((err) => 'API_ERROR')
}));

import { providerCoordinator } from './ProviderCoordinator.js';
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { isFatalError } from "@/shared/error-management/ErrorMatcher.js";

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/features/translation/providers/LanguageSwappingService.js", () => ({
  LanguageSwappingService: {
    applyLanguageSwapping: vi.fn((text, src, tgt) => Promise.resolve([src, tgt]))
  }
}));

vi.mock("@/shared/services/LanguageDetectionService.js", () => ({
  LanguageDetectionService: {
    detect: vi.fn(() => Promise.resolve('en')),
    registerDetectionResult: vi.fn()
  }
}));

vi.mock("@/features/translation/providers/utils/AIResponseParser.js", () => ({
  AIResponseParser: {
    cleanAIResponse: vi.fn((res) => res)
  }
}));

describe('ProviderCoordinator', () => {
  let mockProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset AIResponseParser to default identity function
    const { AIResponseParser } = await import("@/features/translation/providers/utils/AIResponseParser.js");
    AIResponseParser.cleanAIResponse.mockImplementation(res => res);

    mockProvider = {
      providerName: 'TestAI',
      constructor: { isAI: true, supportsStreaming: false },
      translate: vi.fn().mockResolvedValue('Translated Text'),
      convertLanguage: vi.fn(lang => lang)
    };
  });

  describe('Language Resolution', () => {
    it('should detect language when source is set to auto', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      LanguageDetectionService.detect.mockResolvedValue('fr');

      const result = await providerCoordinator.execute(
        mockProvider, 'Bonjour', AUTO_DETECT_VALUE, 'en'
      );

      expect(LanguageDetectionService.detect).toHaveBeenCalled();
      expect(result.sourceLanguage).toBe('fr');
      expect(mockProvider.translate).toHaveBeenCalledWith(
        expect.anything(), 'fr', 'en', expect.anything()
      );
    });

    it('should register detection feedback when source is auto', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      mockProvider.lastDetectedLanguage = 'de';

      await providerCoordinator.execute(
        mockProvider, 'Guten Tag', AUTO_DETECT_VALUE, 'en'
      );

      expect(LanguageDetectionService.registerDetectionResult).toHaveBeenCalledWith(
        'Guten Tag', 'de', expect.anything()
      );
    });
  });

  describe('Result Normalization', () => {
    it('should clean AI response using AIResponseParser', async () => {
      const { AIResponseParser } = await import("@/features/translation/providers/utils/AIResponseParser.js");
      AIResponseParser.cleanAIResponse.mockReturnValue('Cleaned Result');
      mockProvider.translate.mockResolvedValue('Dirty Result with AI Chatter');

      const result = await providerCoordinator.execute(
        mockProvider, 'Input Text', 'en', 'fa'
      );

      expect(AIResponseParser.cleanAIResponse).toHaveBeenCalledWith(
        'Dirty Result with AI Chatter', expect.anything()
      );
      expect(result.translatedText).toBe('Cleaned Result');
    });

    it('should ensure the final result is a string even if provider returns an object', async () => {
      mockProvider.translate.mockResolvedValue({ t: 'Extracted Text' });

      const result = await providerCoordinator.execute(
        mockProvider, 'Input', 'en', 'fa'
      );

      expect(result.translatedText).toBe('Extracted Text');
    });

    it('should handle array results by joining them if expected format is STRING', async () => {
      mockProvider.translate.mockResolvedValue(['Part 1', 'Part 2']);
      
      const result = await providerCoordinator.execute(
        mockProvider, 'Input', 'en', 'fa', { expectedFormat: ResponseFormat.STRING }
      );

      expect(result.translatedText).toBe('Part 1\nPart 2');
    });
  });

  describe('Error Resilience', () => {
    it('should return original text if provider fails with a non-fatal error', async () => {
      mockProvider.translate.mockRejectedValue(new Error('Temporary API Error'));
      
      const result = await providerCoordinator.execute(
        mockProvider, 'Original Text', 'en', 'fa'
      );

      expect(result).toBe('Original Text');
    });

    it('should throw immediately if provider fails with a fatal error', async () => {
      const fatalError = new Error('FATAL');
      mockProvider.translate.mockRejectedValue(fatalError);

      await expect(providerCoordinator.execute(
        mockProvider, 'Original Text', 'en', 'fa'
      )).rejects.toThrow('FATAL');
    });
  });
});
