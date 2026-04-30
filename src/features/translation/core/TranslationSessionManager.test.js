import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}));

describe('TranslationSessionManager', () => {
  let sessionManager;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./TranslationSessionManager.js');
    sessionManager = mod.translationSessionManager;
    
    // Reset internal state since it's a singleton
    sessionManager.sessions.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be a singleton', async () => {
    const { translationSessionManager } = await import('./TranslationSessionManager.js');
    const mod2 = await import('./TranslationSessionManager.js');
    expect(translationSessionManager).toBe(mod2.translationSessionManager);
  });

  describe('getOrCreateSession', () => {
    it('should create a new session if it does not exist', () => {
      const id = 'session-1';
      const provider = 'Gemini';
      const session = sessionManager.getOrCreateSession(id, provider);

      expect(session).toBeDefined();
      expect(session.id).toBe(id);
      expect(session.provider).toBe(provider);
      expect(session.history).toEqual([]);
      expect(sessionManager.sessions.has(id)).toBe(true);
    });

    it('should return existing session and update lastActivity', () => {
      const id = 'session-1';
      const session1 = sessionManager.getOrCreateSession(id, 'Gemini');
      const firstActivity = session1.lastActivity;

      vi.advanceTimersByTime(1000);

      const session2 = sessionManager.getOrCreateSession(id, 'Gemini');
      expect(session1).toBe(session2);
      expect(session2.lastActivity).toBeGreaterThan(firstActivity);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict the oldest session when maxSessions is reached', () => {
      // Set a smaller max for easier testing if possible, 
      // but the class has a hardcoded 50. Let's fill 50.
      
      for (let i = 0; i < 50; i++) {
        sessionManager.getOrCreateSession(`s-${i}`, 'P');
        vi.advanceTimersByTime(10); // Ensure different activity times
      }

      expect(sessionManager.sessions.size).toBe(50);
      
      // s-0 is the oldest. Let's add s-50.
      sessionManager.getOrCreateSession('s-50', 'P');
      
      expect(sessionManager.sessions.size).toBe(50);
      expect(sessionManager.sessions.has('s-0')).toBe(false);
      expect(sessionManager.sessions.has('s-50')).toBe(true);
    });
  });

  describe('Message History', () => {
    it('should add messages to history', () => {
      const id = 'msg-test';
      sessionManager.getOrCreateSession(id, 'P');
      sessionManager.addMessage(id, 'user', 'hello');
      sessionManager.addMessage(id, 'assistant', 'سلام');

      const session = sessionManager.sessions.get(id);
      expect(session.history.length).toBe(2);
      expect(session.history[0]).toMatchObject({ role: 'user', content: 'hello' });
    });

    it('should trim history to the last 20 messages', () => {
      const id = 'trim-test';
      sessionManager.getOrCreateSession(id, 'P');
      
      for (let i = 0; i < 25; i++) {
        sessionManager.addMessage(id, 'role', `content-${i}`);
      }

      const session = sessionManager.sessions.get(id);
      expect(session.history.length).toBe(20);
      expect(session.history[0].content).toBe('content-5');
      expect(session.history[19].content).toBe('content-24');
    });
  });

  describe('Turn Management', () => {
    it('should claim turns and increment counter', () => {
      const id = 'turn-test';
      expect(sessionManager.claimNextTurn(id, 'P')).toBe(1);
      expect(sessionManager.claimNextTurn(id, 'P')).toBe(2);
      expect(sessionManager.getTurnNumber(id)).toBe(2);
    });

    it('should create session automatically on claimNextTurn if missing', () => {
      const id = 'auto-create';
      const turn = sessionManager.claimNextTurn(id, 'AutoProvider');
      expect(turn).toBe(1);
      expect(sessionManager.sessions.has(id)).toBe(true);
      expect(sessionManager.sessions.get(id).provider).toBe('AutoProvider');
    });
  });

  describe('Cleanup and Manual Clear', () => {
    it('clearSession should remove the session', () => {
      const id = 'clear-me';
      sessionManager.getOrCreateSession(id, 'P');
      sessionManager.clearSession(id);
      expect(sessionManager.sessions.has(id)).toBe(false);
    });

    it('cleanup should remove sessions older than TTL (30 mins)', () => {
      const id1 = 'expired';
      const id2 = 'active';
      
      sessionManager.getOrCreateSession(id1, 'P');
      
      vi.advanceTimersByTime(20 * 60 * 1000); // 20 mins passed
      sessionManager.getOrCreateSession(id2, 'P');
      
      vi.advanceTimersByTime(15 * 60 * 1000); // 15 mins more passed (id1 is 35m old, id2 is 15m old)
      
      sessionManager.cleanup();
      
      expect(sessionManager.sessions.has(id1)).toBe(false);
      expect(sessionManager.sessions.has(id2)).toBe(true);
    });
  });
});
