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
import { createTranslationOperation } from '@/features/translation/ir/TranslationOperation.js';

vi.mock('@/features/translation/core/StreamingManager.js', () => ({
  streamingManager: {
    initializeStream: vi.fn(),
  },
}));

vi.mock('./utils/TraditionalTextProcessor.js', () => ({
  getTextInfo: vi.fn((item) => {
    if (typeof item === 'string') return { text: item, length: item.length };
    const text = item?.t || item?.text || '';
    return { text: String(text), length: String(text).length };
  }),
  TraditionalTextProcessor: {
    createChunks: vi.fn(),
    scrubBidiArtifacts: vi.fn(text => text),
    calculateTraditionalCharCount: vi.fn(texts => texts.reduce((s, t) => s + (t?.length || 0), 0)),
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
    PDF: 'pdf-translation',
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
  async _translateChunk(texts, ...args) {
    const options = args[8] || {};
    if (options.providerMetadataRef) {
      options.providerMetadataRef.metadata.chunk = texts[0];
    }
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

    it('should NOT use streaming for PDF mode', () => {
      const texts = ['text1', 'text2'];
      const engine = { name: 'mockEngine' };
      const messageId = 'msg-1';

      const shouldStream = provider._shouldUseStreaming(texts, messageId, engine, TranslationMode.PDF);
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
    it('forwards request-local callPurpose through streaming chunks', async () => {
      const translateChunk = vi.spyOn(provider, '_translateChunk');

      await provider._streamingBatchTranslate(
        ['Hello'], 'en', 'fa', TranslationMode.Popup, null, null, null, 1, 'session-1', undefined,
        { callPurpose: 'PARENT_RECOVERY', someUnrelatedField: 'must-not-propagate' }
      );

      expect(translateChunk.mock.calls[0][9]).toMatchObject({ callPurpose: 'PARENT_RECOVERY' });
      expect(translateChunk.mock.calls[0][9]).not.toHaveProperty('someUnrelatedField');
      expect(provider).not.toHaveProperty('callPurpose');
    });

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
    it('forwards request-local callPurpose through traditional chunks', async () => {
      const translateChunk = vi.spyOn(provider, '_translateChunk');
      TraditionalTextProcessor.createChunks.mockReturnValue([
        { texts: ['A'] },
        { texts: ['B'] },
      ]);

      await provider._batchTranslate(
        ['A', 'B'], 'en', 'fa', TranslationMode.Popup, null, null, null, null, null, undefined,
        { callPurpose: 'PARENT_RECOVERY', someUnrelatedField: 'must-not-propagate' }
      );

      expect(translateChunk.mock.calls).toHaveLength(2);
      expect(translateChunk.mock.calls.every((call) => call[9].callPurpose === 'PARENT_RECOVERY')).toBe(true);
      expect(translateChunk.mock.calls.every((call) => !('someUnrelatedField' in call[9]))).toBe(true);
      expect(provider).not.toHaveProperty('callPurpose');
    });

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

    it('publishes separate metadata slots for separate physical chunks', async () => {
      TraditionalTextProcessor.createChunks.mockReturnValue([
        { texts: ['A'] },
        { texts: ['B'] },
      ]);
      const operation = createTranslationOperation('traditional-slots');

      await provider._traditionalBatchTranslate(
        ['A', 'B'], 'en', 'fa', TranslationMode.Popup, null, null, null, null, null, undefined,
        { executionContext: { operation }, callPurpose: 'PRIMARY_TRANSLATION' },
      );

      const records = operation.snapshotProviderExecutionMetadata();
      expect(records).toHaveLength(2);
      expect(records.map(({ metadata }) => metadata.chunk)).toEqual(['A', 'B']);
      expect(records[0].metadata).not.toBe(records[1].metadata);
    });

    it('does not publish metadata when a physical chunk fails', async () => {
      const operation = createTranslationOperation('traditional-failure');
      vi.spyOn(provider, '_translateChunk').mockImplementation(async (_texts, ...args) => {
        const options = args[8];
        options.providerMetadataRef.metadata.chunk = 'failed';
        throw new Error('physical failure');
      });

      await expect(provider._traditionalBatchTranslate(
        ['A'], 'en', 'fa', TranslationMode.Popup, null, null, null, null, null, undefined,
        { executionContext: { operation }, callPurpose: 'PRIMARY_TRANSLATION' },
      )).rejects.toThrow('physical failure');

      expect(operation.snapshotProviderExecutionMetadata()).toEqual([]);
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
