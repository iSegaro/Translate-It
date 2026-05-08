import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    it('should correctly record global and provider stats', () => {
      statsManager.recordRequest('Google', 'session-1', 100, 90);
      
      expect(statsManager.global.totalCalls).toBe(1);
      expect(statsManager.global.totalChars).toBe(100);
      expect(statsManager.global.totalOriginalChars).toBe(90);
      
      const pStats = statsManager.providers.get('Google');
      expect(pStats.calls).toBe(1);
      expect(pStats.chars).toBe(100);
    });

    it('should correctly record session stats', () => {
      const ids = statsManager.recordRequest('DeepL', 's-123', 50, 40);
      
      expect(ids.globalCallId).toBe(1);
      expect(ids.sessionCallId).toBe(1);
      
      const sStats = statsManager.sessions.get('s-123');
      expect(sStats.calls).toBe(1);
      expect(sStats.provider).toBe('DeepL');
    });
  });

  describe('Recording Errors', () => {
    it('should increment error counters across all levels', () => {
      statsManager.recordRequest('P1', 's1', 10, 10);
      statsManager.recordError('P1', 's1');
      
      expect(statsManager.global.totalErrors).toBe(1);
      expect(statsManager.providers.get('P1').errors).toBe(1);
      expect(statsManager.sessions.get('s1').errors).toBe(1);
    });
  });

  describe('Session Summaries', () => {
    it('getSessionSummary should return duration and stats', () => {
      statsManager.recordRequest('P1', 's1', 10, 10);
      
      const summary = statsManager.getSessionSummary('s1');
      expect(summary.calls).toBe(1);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('clearSession should remove session data', () => {
      statsManager.recordRequest('P1', 's1', 10, 10);
      statsManager.clearSession('s1');
      expect(statsManager.sessions.has('s1')).toBe(false);
    });
  });

  describe('Printing and Reporting', () => {
    it('printSummary should call safeConsole.info when debug is on', async () => {
      const { safeConsole } = await import('@/shared/logging/SafeConsole.js');
      
      statsManager.recordRequest('P1', 's1', 100, 100);
      statsManager.printSummary('s1', { status: 'Complete' });
      
      expect(safeConsole.info).toHaveBeenCalledWith(expect.stringContaining('[Complete Summary: s1]'));
    });

    it('showStats should print a table of statistics', async () => {
      const { safeConsole } = await import('@/shared/logging/SafeConsole.js');
      
      statsManager.recordRequest('Google', null, 50, 50);
      statsManager.showStats();
      
      expect(safeConsole.group).toHaveBeenCalled();
      expect(safeConsole.table).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ Provider: 'Google' })
      ]));
    });
  });
});
