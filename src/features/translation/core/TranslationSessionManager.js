/**
 * Translation Session Manager - Manages AI provider conversation states
 * This allows maintaining context between translation batches (Page, Select Element)
 * reducing duplicate instructions (tokens) and increasing quality.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationSessionManager');

class TranslationSessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> session object
    this.sessionTtl = 30 * 60 * 1000; // 30 minutes
    this.maxSessions = 50;
  }

  /**
   * Get an existing session or create a new one
   */
  getOrCreateSession(id, provider) {
    if (this.sessions.has(id)) {
      const session = this.sessions.get(id);
      session.lastActivity = Date.now();
      return session;
    }

    // Limit number of active sessions (LRU-ish)
    if (this.sessions.size >= this.maxSessions) {
      this._evictOldest();
    }

    const session = {
      id,
      provider,
      history: [],
      systemPrompt: null,
      batchCount: 0,
      turnCounter: 0, // Logical counter for logs
      startTime: Date.now(),
      lastActivity: Date.now()
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Add a message pair to history
   */
  addMessage(id, role, content) {
    const session = this.sessions.get(id);
    if (!session) return;

    session.history.push({ role, content, timestamp: Date.now() });
    session.lastActivity = Date.now();

    // Trim history if too long (keep last 20 messages / 10 turns)
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }
  }

  /**
   * Get logical turn number and increment it.
   * Ensures the session exists before incrementing.
   */
  claimNextTurn(id, provider = 'Unknown') {
    let session = this.sessions.get(id);
    if (!session) {
      session = this.getOrCreateSession(id, provider);
    }
    session.turnCounter++;
    session.lastActivity = Date.now();
    return session.turnCounter;
  }

  /**
   * Get current turn number without incrementing
   */
  getTurnNumber(id) {
    const session = this.sessions.get(id);
    return session ? (session.turnCounter || 1) : 1;
  }

  /**
   * Evict the oldest session
   */
  _evictOldest() {
    let oldestId = null;
    let oldestTime = Date.now();

    for (const [id, session] of this.sessions.entries()) {
      if (session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
      logger.debug(`LRU: Removed oldest session: ${oldestId}`);
    }
  }

  /**
   * Clear a specific session by ID
   * @param {string} id - Session ID to clear
   */
  clearSession(id) {
    if (this.sessions.has(id)) {
      this.sessions.delete(id);
      logger.debug(`Manual: Cleared session: ${id}`);
    }
  }

  /**
   * Cleanup expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTtl) {
        this.sessions.delete(id);
        logger.debug(`Cleanup: Removed expired session: ${id}`);
      }
    }
  }
}

// Singleton instance
export const translationSessionManager = new TranslationSessionManager();
