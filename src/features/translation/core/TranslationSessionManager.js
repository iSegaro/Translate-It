/**
 * Translation Session Manager - Manages AI provider conversation states
 * This allows maintaining context between translation batches (Page, Select Element)
 * reducing duplicate instructions (tokens) and increasing quality.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationSessionManager');

export class TranslationSessionManager {
  constructor() {
    this.sessions = new Map();
    this.maxSessions = 10;
    this.sessionTtl = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get or create a session
   * @param {string} sessionId - Unique identifier (e.g., Tab ID + mode)
   * @param {string} providerName - Name of the AI provider
   * @returns {object} - Session object
   */
  getOrCreateSession(sessionId, providerName) {
    if (!sessionId) return null;

    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.lastUsed = Date.now();
      return session;
    }

    // LRU: If too many sessions, remove oldest
    if (this.sessions.size >= this.maxSessions) {
      this._removeOldestSession();
    }

    const newSession = {
      id: sessionId,
      provider: providerName,
      history: [], // Array of {role, content}
      systemPrompt: null,
      batchCount: 0,
      lastUsed: Date.now(),
      createdAt: Date.now()
    };

    this.sessions.set(sessionId, newSession);
    logger.debug(`Created new translation session: ${sessionId} for provider: ${providerName}`);
    return newSession;
  }

  /**
   * Add message to session history with rolling window
   * @param {string} sessionId - Session identifier
   * @param {string} role - Message role ('user' or 'assistant')
   * @param {string} content - Message content
   * @param {number} maxHistoryTurns - Maximum number of turns to keep for context
   */
  addMessage(sessionId, role, content, maxHistoryTurns = 2) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.history.push({ role, content });
    session.lastUsed = Date.now();

    // Rolling window: Keep only last N turns (user + assistant = 1 turn)
    // We keep 2x maxHistoryTurns messages
    if (session.history.length > maxHistoryTurns * 2) {
      session.history = session.history.slice(-(maxHistoryTurns * 2));
    }
  }

  /**
   * Store system prompt for the session
   */
  setSystemPrompt(sessionId, prompt) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.systemPrompt = prompt;
    }
  }

  /**
   * Clear a specific session
   */
  clearSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      logger.debug(`Cleared translation session: ${sessionId}`);
    }
  }

  /**
   * Remove oldest session based on lastUsed
   */
  _removeOldestSession() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions.entries()) {
      if (session.lastUsed < oldestTime) {
        oldestTime = session.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
      logger.debug(`LRU: Removed oldest session: ${oldestId}`);
    }
  }

  /**
   * Cleanup expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastUsed > this.sessionTtl) {
        this.sessions.delete(id);
        logger.debug(`Cleanup: Removed expired session: ${id}`);
      }
    }
  }
}

// Singleton instance
export const translationSessionManager = new TranslationSessionManager();
