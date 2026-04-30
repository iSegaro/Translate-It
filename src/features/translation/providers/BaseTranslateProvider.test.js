import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Comprehensive logger mock
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  }),
}));

import { BaseTranslateProvider } from './BaseTranslateProvider.js';
import { TranslationMode } from '@/shared/config/config.js';
import { streamingManager } from '@/features/translation/core/StreamingManager.js';
import { TraditionalTextProcessor } from './utils/TraditionalTextProcessor.js';
import { TraditionalStreamManager } from './utils/TraditionalStreamManager.js';

vi.mock('@/features/translation/core/StreamingManager.js', () => ({
  streamingManager: {
    initializeStream: vi.fn(),
  },
}));

vi.mock('./utils/TraditionalTextProcessor.js', () => ({
  TraditionalTextProcessor: {
    createChunks: vi.fn(),
    scrubBidiArtifacts: vi.fn(text => text),
    calculateTraditionalCharCount: vi.fn(texts => texts.reduce((s, t) => s + t.length, 0)),
  },
}));

vi.mock('./utils/TraditionalStreamManager.js', () => ({
  TraditionalStreamManager: {
    streamChunkResults: vi.fn(),
    streamChunkError: vi.fn(),
    sendStreamEnd: vi.fn(),
  },
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100 })),
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Page: 'page',
    Select_Element: 'select_element',
    Popup: 'popup',
  },
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/features/translation/core/ProviderConfigurations.js', () => ({
  PROVIDER_CONFIGURATIONS: {},
  getProviderBatching: vi.fn(() => ({
    strategy: 'character_limit',
    characterLimit: 5000,
    maxChunksPerBatch: 150,
  })),
  getProviderConfiguration: vi.fn(() => ({
    rateLimit: {
      maxConcurrent: 2,
      delayBetweenRequests: 100,
      adaptiveBackoff: { enabled: true }
    },
    batching: {
      strategy: 'character_limit',
      characterLimit: 5000,
      maxChunksPerBatch: 150,
    }
  })),
}));

// Mock dynamic imports
vi.mock('@/utils/translation/TranslationSegmentMapper.js', () => ({
  TranslationSegmentMapper: {
    mapTranslationToOriginalSegments: vi.fn((joined, original) => original.map(t => `mapped-${t}`)),
  },
}));

vi.mock('@/shared/config/translationConstants.js', () => ({
  TRANSLATION_CONSTANTS: {
    TEXT_DELIMITER: '|||',
  },
}));

// Concrete class for testing
class TestProvider extends BaseTranslateProvider {
  constructor() {
    super('TestProvider');
  }
  async _translateChunk(texts) {
    return texts.map(t => `translated-${t}`);
  }
}

describe('BaseTranslateProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TestProvider();
    
    // Default mock behavior for chunking
    TraditionalTextProcessor.createChunks.mockImplementation(texts => [
      { texts: texts }
    ]);
  });

  describe('Streaming Decision Logic', () => {
    it('should use streaming when capabilities and conditions are met', () => {
      const texts = ['text1', 'text2'];
      const engine = { name: 'mockEngine' };
      const messageId = 'msg-1';
      
      const shouldStream = provider._shouldUseStreaming(texts, messageId, engine);
      expect(shouldStream).toBe(true);
    });

    it('should NOT use streaming if messageId is missing', () => {
      const texts = ['text1', 'text2'];
      const engine = { name: 'mockEngine' };
      
      const shouldStream = provider._shouldUseStreaming(texts, null, engine);
      expect(shouldStream).toBe(false);
    });

    it('should NOT use streaming for Page mode', () => {
      const texts = ['text1', 'text2'];
      const engine = { name: 'mockEngine' };
      const messageId = 'msg-1';
      
      const shouldStream = provider._shouldUseStreaming(texts, messageId, engine, TranslationMode.Page);
      expect(shouldStream).toBe(false);
    });

    it('should NOT use streaming if provider does not support it', () => {
      class NonStreamingProvider extends TestProvider {
        static supportsStreaming = false;
      }
      const p = new NonStreamingProvider();
      const texts = ['text1', 'text2'];
      const engine = { name: 'mockEngine' };
      
      const shouldStream = p._shouldUseStreaming(texts, 'id', engine);
      expect(shouldStream).toBe(false);
    });
  });

  describe('_streamingBatchTranslate', () => {
    it('should initialize stream and process chunks', async () => {
      const texts = ['Hello'];
      const engine = { 
        getStreamingSender: vi.fn(() => ({ send: vi.fn() })),
        isCancelled: vi.fn(() => false)
      };
      
      const result = await provider._streamingBatchTranslate(
        texts, 'en', 'fa', TranslationMode.Popup, engine, 'msg-1', null, 1, 'session-1'
      );

      expect(streamingManager.initializeStream).toHaveBeenCalledWith(
        'msg-1', expect.anything(), provider, texts, 'session-1'
      );
      expect(TraditionalStreamManager.streamChunkResults).toHaveBeenCalled();
      expect(TraditionalStreamManager.sendStreamEnd).toHaveBeenCalled();
      expect(result).toEqual(['translated-Hello']);
    });

    it('should throw and cleanup on error during streaming', async () => {
      const texts = ['Fail'];
      const engine = { isCancelled: vi.fn(() => false) };
      
      vi.spyOn(provider, '_translateChunk').mockRejectedValue(new Error('API Fail'));

      await expect(provider._streamingBatchTranslate(
        texts, 'en', 'fa', TranslationMode.Popup, engine, 'msg-1'
      )).rejects.toThrow('API Fail');

      expect(TraditionalStreamManager.streamChunkError).toHaveBeenCalled();
      expect(TraditionalStreamManager.sendStreamEnd).toHaveBeenCalledWith(
        'TestProvider', 'msg-1', expect.objectContaining({ error: expect.anything() })
      );
    });

    it('should detect user cancellation via AbortController', async () => {
      const controller = new AbortController();
      controller.abort();
      
      const texts = ['Test'];
      const engine = { isCancelled: vi.fn(() => false) };

      await expect(provider._streamingBatchTranslate(
        texts, 'en', 'fa', TranslationMode.Popup, engine, 'msg-1', controller
      )).rejects.toThrow('Translation cancelled by user');
    });
  });

  describe('_traditionalBatchTranslate', () => {
    it('should handle ideal case where response count matches request count', async () => {
      const texts = ['A', 'B'];
      const result = await provider._traditionalBatchTranslate(
        texts, 'en', 'fa', TranslationMode.Popup
      );

      expect(result).toEqual(['translated-A', 'translated-B']);
      expect(TraditionalTextProcessor.scrubBidiArtifacts).toHaveBeenCalledTimes(2);
    });

    it('should handle mismatch case using SegmentMapper', async () => {
      const texts = ['A', 'B'];
      // Mock _translateChunk to return a single string (merged result)
      vi.spyOn(provider, '_translateChunk').mockResolvedValue('translated-A|||translated-B');

      const result = await provider._traditionalBatchTranslate(
        texts, 'en', 'fa', TranslationMode.Popup
      );

      // Result comes from SegmentMapper mock
      expect(result).toEqual(['mapped-A', 'mapped-B']);
    });
  });

  describe('Configuration and Chunking', () => {
    it('should resolve batching configuration', async () => {
      const config = await provider.getBatchingConfig('popup');
      expect(config).toBeDefined();
      expect(config.strategy).toBe('character_limit');
    });

    it('should create chunks using TraditionalTextProcessor', async () => {
      const texts = ['a', 'b'];
      await provider._createChunks(texts);
      expect(TraditionalTextProcessor.createChunks).toHaveBeenCalledWith(
        texts, 'TestProvider', 'character_limit', 5000, 150
      );
    });

    it('should calculate char count correctly', () => {
      const texts = ['123', '45'];
      const count = provider._calculateTraditionalCharCount(texts);
      expect(count).toBe(5);
      expect(TraditionalTextProcessor.calculateTraditionalCharCount).toHaveBeenCalledWith(texts);
    });
  });

  describe('Metadata and Helpers', () => {
    it('should update lastDetectedLanguage correctly', () => {
      provider._setDetectedLanguage('  FR  ');
      expect(provider.lastDetectedLanguage).toBe('fr');
    });

    it('should ignore empty or invalid detected language', () => {
      provider.lastDetectedLanguage = 'en';
      provider._setDetectedLanguage('');
      expect(provider.lastDetectedLanguage).toBe('en');
      provider._setDetectedLanguage(null);
      expect(provider.lastDetectedLanguage).toBe('en');
    });
  });
});
