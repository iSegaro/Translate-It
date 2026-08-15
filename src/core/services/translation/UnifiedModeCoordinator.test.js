import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedModeCoordinator } from './UnifiedModeCoordinator.js';
import { TranslationMode } from '@/shared/config/config.js';
import { RequestStatus } from './TranslationRequestTracker.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS } from '@/shared/constants/translation.js';

// Mock RateLimitManager
vi.mock('@/features/translation/core/RateLimitManager.js', () => ({
  TranslationPriority: {
    HIGH: 10,
    NORMAL: 5,
    LOW: 1
  }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js');

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

    it('should assign LOW priority to PDF mode and dispatch through the PDF path', async () => {
      const request = {
        mode: TranslationMode.PDF,
        data: { text: JSON.stringify([{ text: 'hello' }]), provider: 'google' },
        messageId: 'm-pdf',
        context: 'pdf-translation'
      };

      coordinator.processPdfTranslation = vi.fn().mockResolvedValue({ success: true });
      await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(request.data.priority).toBe(1);
      expect(coordinator.processPdfTranslation).toHaveBeenCalledWith(request, { translationEngine: mockEngine });
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
    it('returns empty batches without provider or lifecycle work', async () => {
      const request = {
        mode: TranslationMode.Page,
        messageId: 'empty-batch',
        data: { text: JSON.stringify([]), provider: 'google' }
      };

      const result = await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(result).toMatchObject({ success: true, translatedText: '[]' });
      expect(mockEngine.getProvider).not.toHaveBeenCalled();
      expect(mockEngine.lifecycleRegistry.registerRequest).not.toHaveBeenCalled();
      expect(mockEngine.lifecycleRegistry.unregisterRequest).not.toHaveBeenCalled();
    });

    it('does not dispatch provider work when lifecycle registration was pre-cancelled', async () => {
      const request = {
        mode: TranslationMode.Page,
        messageId: 'pre-cancelled',
        data: { text: JSON.stringify([{ text: 'hello' }]), provider: 'google' }
      };
      const provider = { translate: vi.fn() };
      mockEngine.getProvider.mockResolvedValue(provider);
      mockEngine.lifecycleRegistry.registerRequest.mockReturnValue(null);

      const result = await coordinator.processRequest(request, { translationEngine: mockEngine });

      expect(result).toMatchObject({ success: false, cancelled: true });
      expect(mockEngine.getProvider).not.toHaveBeenCalled();
      expect(provider.translate).not.toHaveBeenCalled();
    });

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
      const request = { mode: TranslationMode.Page, data: { text: '["text"]', provider: 'invalid' }, messageId: 'm1' };
      mockEngine.getProvider.mockResolvedValue(null);
      await expect(coordinator.processPageTranslation(request, { translationEngine: mockEngine }))
        .rejects.toThrow("Provider 'invalid' initialization failed");
    });

    it('should handle provider errors and report failure with fallback content', async () => {
      const request = {
        mode: TranslationMode.Page,
        data: { text: [{ text: 'orig' }], provider: 'google' },
        messageId: 'm-err'
      };

      mockEngine.getProvider.mockResolvedValue({
        translate: vi.fn().mockRejectedValue(new Error('API Down'))
      });

      const result = await coordinator.processPageTranslation(request, { translationEngine: mockEngine });

      expect(result.success).toBe(false); // Failed batch reports failure, not fabricated success
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

  describe('per-session auto source-language resolution', () => {
    function pageBatchRequest({ sessionId, messageId, sourceLanguage, provider = 'google' }) {
      return {
        mode: TranslationMode.Page,
        messageId,
        sessionId,
        data: {
          text: JSON.stringify([{ text: 'p1' }, { text: 'p2' }]),
          provider,
          targetLanguage: 'fa',
          ...(sourceLanguage ? { sourceLanguage } : {})
        }
      };
    }

    const flush = () => new Promise(resolve => setTimeout(resolve, 5));

    function deferred() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    }

    // Records each provider source argument and holds its response promise so
    // tests can orchestrate the exact resolution timing of concurrent batches.
    function deferredProvider() {
      return {
        sources: [],
        pending: [],
        translate() {
          this.sources.push(arguments[1]);
          const next = deferred();
          this.pending.push(next);
          return next.promise;
        },
        success(detectedLanguage) {
          return { translatedText: ['ت۱', 'ت۲'], detectedLanguage };
        }
      };
    }

    // Deterministic concurrency oracle: counts how many batches acquired the
    // per-session resolution slot, guaranteeing waiters are seated before tests
    // force a resolution outcome instead of racing against async startup.
    function spyAcquires(coordinator, sessionIds) {
      const original = coordinator._acquirePageSourceResolution.bind(coordinator);
      const counts = new Map(sessionIds.map(key => [key, 0]));
      coordinator._acquirePageSourceResolution = (...args) => {
        const outcome = original(...args);
        if (counts.has(args[0])) counts.set(args[0], counts.get(args[0]) + 1);
        return outcome;
      };
      return {
        countAt: (key) => counts.get(key) || 0,
        restore: () => { coordinator._acquirePageSourceResolution = original; }
      };
    }

    async function waitForAcquires(spy, key, count) {
      for (let i = 0; i < 400 && spy.countAt(key) < count; i++) {
        await flush();
      }
      expect(spy.countAt(key)).toBe(count);
      await flush();
    }

    describe('Concurrency race', () => {
      it('issues exactly one concurrent "auto" call; waiters resume with the resolved language', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1']);

        const raceA = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        const raceB = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });
        const raceC = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm3' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 3);
        expect(provider.sources).toEqual(['auto']);
        expect(provider.pending).toHaveLength(1);

        // Owner resolves with request-local detection.
        provider.pending[0].resolve(provider.success('en'));
        await flush();
        await flush();

        expect(provider.sources).toEqual(['auto', 'en', 'en']);

        provider.pending[1].resolve(provider.success('en'));
        provider.pending[2].resolve(provider.success('en'));
        const results = await Promise.all([raceA, raceB, raceC]);
        results.forEach(r => expect(r.success).toBe(true));

        expect(provider.sources.filter(s => s === 'auto')).toEqual(['auto']);
        spy.restore();
      });
    });

    describe('Ambiguous detection regression', () => {
      it('provides a stable resolved language to sibling batches that would otherwise misdetect', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1']);

        // Owner batch is English; the two siblings would naively detect it/sv.
        const owner = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm-owner' }), { translationEngine: mockEngine });
        const itLike = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm-it' }), { translationEngine: mockEngine });
        const svLike = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm-sv' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 3);
        expect(provider.sources).toEqual(['auto']);
        provider.pending[0].resolve(provider.success('en'));
        await flush();
        await flush();

        expect(provider.sources).toEqual(['auto', 'en', 'en']);
        expect(provider.sources.includes('it')).toBe(false);
        expect(provider.sources.includes('sv')).toBe(false);

        provider.pending[1].resolve(provider.success('en'));
        provider.pending[2].resolve(provider.success('en'));
        await Promise.all([owner, itLike, svLike]);
        spy.restore();
      });
    });

    describe('Resolution failure', () => {
      it('releases concurrent waiters, clears state, and allows a fresh resolver', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1']);

        const owner = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        const waiter = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 2);
        expect(provider.sources).toEqual(['auto']);
        expect(provider.pending).toHaveLength(1);

        // Owner fails -> its resolution rejects and the waiter is released.
        provider.pending[0].reject(new Error('API Down'));
        const [ownerResult, waiterResult] = await Promise.all([owner, waiter]);

        expect(ownerResult.success).toBe(false);
        expect(waiterResult.success).toBe(false);
        expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

        // A later attempt may become resolver again.
        const retry = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm3' }), { translationEngine: mockEngine });
        await flush();
        await flush();
        expect(provider.sources).toEqual(['auto', 'auto']);
        provider.pending[1].resolve(provider.success('en'));
        await retry;
        expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');
        spy.restore();
      });
    });

    describe('Cancellation', () => {
      it('terminates a waiter, clears state, and ignores a late owner result', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1']);

        const owner = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        const waiter = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 2);
        expect(provider.sources).toEqual(['auto']);

        // Terminal lifecycle fires (cancel/restore): waiters must terminate.
        coordinator.clearPageSourceLanguage('s1');
        expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

        // Late owner completion must not resurrect the cleared session lock.
        provider.pending[0].resolve(provider.success('en'));
        await flush();
        expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

        const waiterResult = await waiter;
        expect(waiterResult.success).toBe(false);
        await owner;
        spy.restore();
      });

      it('a waiter resumes with the confirmed language and its own provider call completes after terminal clear', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1']);

        const owner = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        const waiter = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 2);
        expect(provider.sources).toEqual(['auto']);

        // Owner confirms the session language from its request-local detection.
        provider.pending[0].resolve(provider.success('en'));
        await flush();
        await flush();

        // Waiter wakes with 'en' (not 'auto') and issues its own provider call.
        expect(provider.sources).toEqual(['auto', 'en']);
        expect(provider.pending).toHaveLength(2);

        // Terminal lifecycle fires after the waiter's call is already in flight:
        // like any in-flight batch, the call is not retroactively cancelled by the
        // session lock clear; the waiter simply never issues an 'auto' re-issue.
        coordinator.clearPageSourceLanguage('s1');
        expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

        provider.pending[1].resolve(provider.success('en'));
        const [ownerResult, waiterResult] = await Promise.all([owner, waiter]);
        expect(ownerResult.success).toBe(true);
        expect(waiterResult.success).toBe(true);
        expect(provider.sources.filter(s => s === 'auto')).toEqual(['auto']);
        spy.restore();
      });

      it('never emits an unhandled rejection from a cancelled resolution promise', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const unhandled = [];
        const onUnhandled = (event) => unhandled.push(event.reason);
        process.on('unhandledRejection', onUnhandled);

        try {
          // Owner acquires the lock but never spawns a waiter to attach to the
          // resolution promise. The promise is rejected by a terminal clear; the
          // defensive `.catch(() => {})` must swallow it.
          const owner = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
          await flush();
          expect(provider.pending).toHaveLength(1);

          coordinator.clearPageSourceLanguage('s1');
          await flush();

          provider.pending[0].resolve(provider.success('en'));
          await owner.catch(() => {});
          await flush();
        } finally {
          process.off('unhandledRejection', onUnhandled);
        }

        expect(unhandled).toHaveLength(0);
      });
    });

    describe('Session isolation', () => {
      it('resolves two page sessions independently', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);
        const spy = spyAcquires(coordinator, ['s1', 's2']);

        const sessionA = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        const sessionB = coordinator.processRequest(pageBatchRequest({ sessionId: 's2', messageId: 'm2' }), { translationEngine: mockEngine });

        await waitForAcquires(spy, 's1', 1);
        await waitForAcquires(spy, 's2', 1);
        expect(provider.sources).toEqual(['auto', 'auto']);

        provider.pending[0].resolve(provider.success('en'));
        provider.pending[1].resolve(provider.success('sv'));
        await Promise.all([sessionA, sessionB]);

        expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');
        expect(coordinator.pageSourceResolvers.get('s2').language).toBe('sv');
        spy.restore();
      });
    });

    describe('Explicit source language', () => {
      it('passes "de" for every concurrent batch and creates no resolver state', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);

        const batch1 = coordinator.processRequest(
          pageBatchRequest({ sessionId: 's1', messageId: 'm1', sourceLanguage: 'de' }),
          { translationEngine: mockEngine }
        );
        const batch2 = coordinator.processRequest(
          pageBatchRequest({ sessionId: 's1', messageId: 'm2', sourceLanguage: 'de' }),
          { translationEngine: mockEngine }
        );

        await flush();
        await flush();
        expect(provider.sources).toEqual(['de', 'de']);
        expect(coordinator.pageSourceResolvers.size).toBe(0);

        provider.pending[0].resolve(provider.success('de'));
        provider.pending[1].resolve(provider.success('de'));
        await Promise.all([batch1, batch2]);
      });
    });

    describe('Other modes unaffected', () => {
      it('Subtitle batches keep per-batch auto behavior', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);

        const request = { mode: TranslationMode.Subtitle, messageId: 'm1', data: { provider: 'google', sourceLanguage: 'auto', targetLanguage: 'fa' }, items: [{ id: 'A', text: 'A' }] };
        const request2 = { mode: TranslationMode.Subtitle, messageId: 'm2', data: { provider: 'google', sourceLanguage: 'auto', targetLanguage: 'fa' }, items: [{ id: 'A', text: 'A' }] };
        const workload = (req) => coordinator._processGenericBatch(
          { ...req, data: { ...req.data } },
          { translationEngine: mockEngine },
          { mode: TranslationMode.Subtitle, items: req.items, useRawItems: true, transformOutput: (results) => results }
        );

        const r1 = workload(request);
        const r2 = workload(request2);
        await flush();
        await flush();
        expect(provider.sources).toEqual(['auto', 'auto']);

        provider.pending[0].resolve(provider.success('de'));
        provider.pending[1].resolve(provider.success('de'));
        await Promise.all([r1, r2]);

        expect(coordinator.pageSourceResolvers.size).toBe(0);
      });

      it('Select Element, Popup, Field and Selection never create resolver state', async () => {
        mockEngine.handleTranslateMessage.mockResolvedValue({ success: true });

        await coordinator.processSelectElementTranslation(
          { mode: TranslationMode.Select_Element, messageId: 'm-sel', data: { text: 'x' } },
          { translationEngine: mockEngine }
        );
        await coordinator.processFieldTranslation(
          { messageId: 'm-field', data: { text: 'x' } },
          { translationEngine: mockEngine }
        );
        await coordinator.processStandardTranslation(
          { messageId: 'm-pop', data: { text: 'x', mode: TranslationMode.Selection } },
          { translationEngine: mockEngine }
        );

        expect(coordinator.pageSourceResolvers.size).toBe(0);
      });
    });

    describe('Lifecycle cleanup', () => {
      it('a complete page session removes its resolution state', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);

        const first = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
        await flush();
        provider.pending[0].resolve(provider.success('en'));
        await first;
        expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');

        // Terminal completion clears the resolved session.
        coordinator.clearPageSourceLanguage('s1');
        expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

        // Next batch on the same id starts fresh with auto.
        const nextBatch = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });
        await flush();
        await flush();
        expect(provider.sources).toEqual(['auto', 'auto']);
        provider.pending[1].resolve(provider.success('fr'));
        await nextBatch;
      });

      it('a cancelled page session removes its resolution state', async () => {
        const provider = deferredProvider();
        mockEngine.getProvider.mockResolvedValue(provider);

        const batch = coordinator.processRequest(pageBatchRequest({ sessionId: 's2', messageId: 'm1' }), { translationEngine: mockEngine });
        await flush();
        expect(coordinator.pageSourceResolvers.has('s2')).toBe(true);

        coordinator.clearPageSourceLanguage('s2');
        expect(coordinator.pageSourceResolvers.has('s2')).toBe(false);

        // Settle the owner call late; it must not recreate the lock.
        provider.pending[0].resolve(provider.success('fr'));
        await batch;
        expect(coordinator.pageSourceResolvers.size).toBe(0);
      });
    });

    it('reuses the first provider-confirmed language for later auto batches', async () => {
      const provider = deferredProvider();
      mockEngine.getProvider.mockResolvedValue(provider);

      const first = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
      await flush();
      provider.pending[0].resolve(provider.success('en'));
      await first;
      expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');

      const second = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });
      await flush();
      expect(provider.sources).toEqual(['auto', 'en']);
      provider.pending[1].resolve(provider.success('en'));
      await second;
      expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');
    });

    it('does not leak the lock across different sessions', async () => {
      const provider = deferredProvider();
      mockEngine.getProvider.mockResolvedValue(provider);

      const s1 = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
      await flush();
      provider.pending[0].resolve(provider.success('en'));
      await s1;

      const s2 = coordinator.processRequest(pageBatchRequest({ sessionId: 's2', messageId: 'm2' }), { translationEngine: mockEngine });
      await flush();
      expect(provider.sources).toEqual(['auto', 'auto']);
      provider.pending[1].resolve(provider.success('sv'));
      await s2;
      expect(coordinator.pageSourceResolvers.get('s2').language).toBe('sv');
    });

    it('leaves the session unlocked when the owner never confirms a language', async () => {
      const provider = deferredProvider();
      mockEngine.getProvider.mockResolvedValue(provider);

      // Owner resolves with no detectable language -> slot dropped, no lock kept.
      const first = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm1' }), { translationEngine: mockEngine });
      await flush();
      provider.pending[0].resolve({ translatedText: ['ت۱', 'ت۲'] });
      await first;
      expect(coordinator.pageSourceResolvers.has('s1')).toBe(false);

      const second = coordinator.processRequest(pageBatchRequest({ sessionId: 's1', messageId: 'm2' }), { translationEngine: mockEngine });
      await flush();
      expect(provider.sources).toEqual(['auto', 'auto']);
      provider.pending[1].resolve(provider.success('en'));
      await second;
      expect(coordinator.pageSourceResolvers.get('s1').language).toBe('en');
    });
  });

  describe('_processGenericBatch unresolved-result marker', () => {
    function batchOptions(items) {
      return {
        mode: TranslationMode.Subtitle,
        items,
        useRawItems: true,
        transformOutput: (results) => results
      };
    }

    function batchRequest() {
      return {
        mode: TranslationMode.Subtitle,
        messageId: 'm-sub',
        data: { provider: 'google', sourceLanguage: 'en', targetLanguage: 'fa' }
      };
    }

    it('tags only under-returned items with isSkipped', async () => {
      mockEngine.getProvider.mockResolvedValue({
        translate: vi.fn().mockResolvedValue(['ترجمهٔ A'])
      });

      const items = [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }];
      const result = await coordinator._processGenericBatch(
        batchRequest(),
        { translationEngine: mockEngine },
        batchOptions(items)
      );

      expect(result[0]).toEqual({ id: 'A', text: 'ترجمهٔ A' });
      expect(result[1]).toEqual({ id: 'B', text: 'B', isSkipped: true });
      expect(result[0].isSkipped).toBeUndefined();
    });

    it('fires the generic batch guard exactly at the canonical batch execution budget', async () => {
      vi.useFakeTimers();
      try {
        mockEngine.getProvider.mockResolvedValue({
          translate: vi.fn(() => new Promise(() => {}))
        });

        const promise = coordinator._processGenericBatch(
          batchRequest(),
          { translationEngine: mockEngine },
          batchOptions([{ id: 'A', text: 'A' }])
        );
        let rejected = false;
        promise.catch(() => { rejected = true; });

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS - 1);
        expect(rejected).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await expect(promise).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects a batch timeout as TRANSLATION_TIMEOUT, never USER_CANCELLED', async () => {
      vi.useFakeTimers();
      try {
        mockEngine.getProvider.mockResolvedValue({
          translate: vi.fn(() => new Promise(() => {}))
        });

        const items = [{ id: 'A', text: 'A' }];
        const promise = coordinator._processGenericBatch(
          batchRequest(),
          { translationEngine: mockEngine },
          batchOptions(items)
        );

        const assertion = promise.then(
          () => { throw new Error('expected a timeout rejection'); },
          (error) => {
            expect(error.type).toBe(ErrorTypes.TRANSLATION_TIMEOUT);
            expect(error.type).not.toBe(ErrorTypes.USER_CANCELLED);
          }
        );

        await vi.advanceTimersByTimeAsync(301000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a pre-execution cancellation as USER_CANCELLED, never a timeout', async () => {
      mockEngine.lifecycleRegistry.registerRequest.mockReturnValue(undefined);

      const items = [{ id: 'A', text: 'A' }];
      const result = await coordinator._processGenericBatch(
        batchRequest(),
        { translationEngine: mockEngine },
        batchOptions(items)
      );

      expect(result.cancelled).toBe(true);
      expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
      expect(result.error.type).not.toBe(ErrorTypes.TRANSLATION_TIMEOUT);
    });

    it('never adds isSkipped when every item resolves', async () => {
      mockEngine.getProvider.mockResolvedValue({
        translate: vi.fn().mockResolvedValue(['ترجمهٔ A', 'ترجمهٔ B'])
      });

      const items = [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }];
      const result = await coordinator._processGenericBatch(
        batchRequest(),
        { translationEngine: mockEngine },
        batchOptions(items)
      );

      expect(result).toHaveLength(2);
      result.forEach(item => expect(item.isSkipped).toBeUndefined());
      expect(result[0].text).toBe('ترجمهٔ A');
      expect(result[1].text).toBe('ترجمهٔ B');
    });
  });
});