import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationCallPurpose } from '../providers/ProviderConstants.js';
import { RecoveryFinalOutcome } from '../ir/TranslationOperation.js';

// Mock extension polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    runtime: { getManifest: () => ({ version: '1.0.0' }) }
  }
}));

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/shared/logging/SafeConsole.js', () => ({
  safeConsole: {
    info: vi.fn(),
    log: vi.fn(),
    table: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn()
  }
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    getCached: vi.fn().mockReturnValue(true) // Debug mode ON
  }
}));

describe('TranslationStatsManager', () => {
  let statsManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./TranslationStatsManager.js');
    statsManager = mod.statsManager;
    statsManager.reset();
  });

  describe('Recording Requests', () => {
    it('aggregates logical recovery quality globally and by final provider without session quality', () => {
      statsManager.recordOperationQuality({
        structuredResponseViolations: 2,
        recoveryPasses: 2,
        hadRecovery: true,
        finalRecoveryOutcome: RecoveryFinalOutcome.SUCCEEDED,
        finalRecoveryProvider: 'ProviderB',
        providerFacts: [
          { provider: 'ProviderA', structuredResponseViolations: 1, recoveryPasses: 1 },
          { provider: 'ProviderB', structuredResponseViolations: 1, recoveryPasses: 1 }
        ]
      });
      expect(statsManager.global.quality).toMatchObject({ structuredResponseViolations: 2, recoveryPasses: 2, operationsWithRecovery: 1, operationsRecovered: 1 });
      expect(statsManager.providers.get('ProviderA').quality).toMatchObject({ recoveryPasses: 1, operationsWithRecovery: 0 });
      expect(statsManager.providers.get('ProviderB').quality).toMatchObject({ recoveryPasses: 1, operationsWithRecovery: 1, operationsRecovered: 1 });
      statsManager.recordRequest('ProviderB', 'session', 1, 1, TranslationCallPurpose.PRIMARY_TRANSLATION);
      expect(statsManager.sessions.get('session')).not.toHaveProperty('quality');
    });
    it('should break physical calls, characters, and errors down by purpose', () => {
      statsManager.recordRequest('Google', 'session-1', 100, 90, TranslationCallPurpose.PRIMARY_TRANSLATION);
      statsManager.recordRequest('Google', 'session-1', 25, 20, TranslationCallPurpose.STRUCTURED_RECOVERY);
      statsManager.recordError('Google', 'session-1', TranslationCallPurpose.STRUCTURED_RECOVERY);

      expect(statsManager.global.callsByPurpose).toEqual({
        PRIMARY_TRANSLATION: 1,
        STRUCTURED_RECOVERY: 1,
        PARENT_RECOVERY: 0
      });
      expect(statsManager.global.charsByPurpose).toEqual({
        PRIMARY_TRANSLATION: 100,
        STRUCTURED_RECOVERY: 25,
        PARENT_RECOVERY: 0
      });
      expect(statsManager.global.errorsByPurpose).toEqual({
        PRIMARY_TRANSLATION: 0,
        STRUCTURED_RECOVERY: 1,
        PARENT_RECOVERY: 0
      });
      expect(statsManager.providers.get('Google').callsByPurpose).not.toBe(statsManager.global.callsByPurpose);
      expect(statsManager.sessions.get('session-1').callsByPurpose).toEqual(statsManager.global.callsByPurpose);
    });

    it('should reset independent purpose maps with existing totals', () => {
      statsManager.recordRequest('P1', 's1', 10, 8, TranslationCallPurpose.STRUCTURED_RECOVERY);
      statsManager.recordError('P1', 's1', TranslationCallPurpose.STRUCTURED_RECOVERY);
      expect(statsManager.global.totalCalls).toBe(1);
      expect(statsManager.global.totalErrors).toBe(1);
      expect(statsManager.providers.get('P1').callsByPurpose).not.toBe(statsManager.sessions.get('s1').callsByPurpose);
      statsManager.reset();
      expect(statsManager.global.callsByPurpose).toEqual({ PRIMARY_TRANSLATION: 0, STRUCTURED_RECOVERY: 0, PARENT_RECOVERY: 0 });
      expect(statsManager.global.charsByPurpose).toEqual({ PRIMARY_TRANSLATION: 0, STRUCTURED_RECOVERY: 0, PARENT_RECOVERY: 0 });
      expect(statsManager.global.errorsByPurpose).toEqual({ PRIMARY_TRANSLATION: 0, STRUCTURED_RECOVERY: 0, PARENT_RECOVERY: 0 });
      expect(statsManager.global.totalCalls).toBe(0);
      expect(statsManager.global.totalErrors).toBe(0);
    });
    it('should correctly record global and provider stats', () => {
      statsManager.recordRequest('Google', 'session-1', 100, 90, TranslationCallPurpose.PRIMARY_TRANSLATION);
      
      expect(statsManager.global.totalCalls).toBe(1);
      expect(statsManager.global.totalChars).toBe(100);
      expect(statsManager.global.totalOriginalChars).toBe(90);
      
      const pStats = statsManager.providers.get('Google');
      expect(pStats.calls).toBe(1);
      expect(pStats.chars).toBe(100);
    });

    it('should correctly record session stats', () => {
      const ids = statsManager.recordRequest('DeepL', 's-123', 50, 40, TranslationCallPurpose.PRIMARY_TRANSLATION);
      
      expect(ids.globalCallId).toBe(1);
      expect(ids.sessionCallId).toBe(1);
      
      const sStats = statsManager.sessions.get('s-123');
      expect(sStats.calls).toBe(1);
      expect(sStats.provider).toBe('DeepL');
    });
  });

  describe('Recording Errors', () => {
    it('should increment error counters across all levels', () => {
      statsManager.recordRequest('P1', 's1', 10, 10, TranslationCallPurpose.PRIMARY_TRANSLATION);
      statsManager.recordError('P1', 's1', TranslationCallPurpose.PRIMARY_TRANSLATION);
      
      expect(statsManager.global.totalErrors).toBe(1);
      expect(statsManager.providers.get('P1').errors).toBe(1);
      expect(statsManager.sessions.get('s1').errors).toBe(1);
    });
  });

  describe('Session Summaries', () => {
    it('getSessionSummary should return duration and stats', () => {
      statsManager.recordRequest('P1', 's1', 10, 10, TranslationCallPurpose.PRIMARY_TRANSLATION);
      
      const summary = statsManager.getSessionSummary('s1');
      expect(summary.calls).toBe(1);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('clearSession should remove session data', () => {
      statsManager.recordRequest('P1', 's1', 10, 10, TranslationCallPurpose.PRIMARY_TRANSLATION);
      statsManager.clearSession('s1');
      expect(statsManager.sessions.has('s1')).toBe(false);
    });
  });

  describe('Printing and Reporting', () => {
    it('printSummary should call safeConsole.info when debug is on', async () => {
      const { safeConsole } = await import('@/shared/logging/SafeConsole.js');
      
      statsManager.recordRequest('P1', 's1', 100, 100, TranslationCallPurpose.PRIMARY_TRANSLATION);
      statsManager.printSummary('s1', { status: 'Complete' });
      
      expect(safeConsole.info).toHaveBeenCalledWith(expect.stringContaining('[Complete Summary: s1]'));
    });

    it('showStats should print a table of statistics', async () => {
      const { safeConsole } = await import('@/shared/logging/SafeConsole.js');
      
      statsManager.recordRequest('Google', null, 50, 50, TranslationCallPurpose.PRIMARY_TRANSLATION);
      statsManager.showStats();
      
      expect(safeConsole.group).toHaveBeenCalled();
      expect(safeConsole.table).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ Provider: 'Google' })
      ]));
    });
  });
});
