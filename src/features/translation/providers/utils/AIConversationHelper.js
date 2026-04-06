/**
 * AI Conversation Helper - Manages session history and prompt preparation for AI providers
 */

import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { 
  getPromptBASEAIBatchAsync, 
  getPromptBASEAIFollowupAsync, 
  TranslationMode,
  getSmartContextTranslationEnabledAsync
} from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIConversationHelper');

export const AIConversationHelper = {
  /**
   * Check if this is the first turn in a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - True if first turn or no session
   */
  async isFirstTurn(sessionId) {
    if (!sessionId) return true;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      const session = translationSessionManager.sessions.get(sessionId);
      return !session || session.history.length === 0;
    } catch {
      return true;
    }
  },

  /**
   * Helper to get conversation history as structured turns
   * @param {string} sessionId - Session identifier
   * @param {string} translateMode - Translation mode
   * @returns {Promise<Array>} - Array of turns {user, assistant}
   */
  async getConversationHistory(sessionId, translateMode = '') {
    if (!sessionId) return [];

    // ONLY apply history logic for Select Element mode.
    // Page Translation and other modes should NOT send previous batch history
    // to prevent token bloat and rate limiting.
    if (translateMode !== TranslationMode.Select_Element) {
      return [];
    }

    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      const session = translationSessionManager.sessions.get(sessionId);
      if (!session || !session.history || session.history.length === 0) return [];

      const turns = [];
      // Group history messages into turns (user + assistant pairs)
      for (let i = 0; i < session.history.length; i += 2) {
        const userMsg = session.history[i];
        const assistantMsg = session.history[i + 1];
        
        if (userMsg && assistantMsg && userMsg.role === 'user' && assistantMsg.role === 'assistant') {
          turns.push({
            user: userMsg.content,
            assistant: assistantMsg.content
          });
        }
      }
      return turns;
    } catch (e) {
      logger.warn('Failed to get conversation history:', e);
      return [];
    }
  },

  /**
   * Helper to prepare system prompt and user text
   * @param {string} text - Input text
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {string} providerType - Provider type (e.g. ProviderTypes.AI)
   * @param {string} sessionId - Session identifier
   * @param {boolean} isBatch - Whether this is a batch request
   * @param {object} contextMetadata - Contextual metadata
   * @returns {Promise<object>} - { systemPrompt, userText }
   */
  async preparePromptAndText(text, sourceLang, targetLang, translateMode, providerType, sessionId = null, isBatch = false, contextMetadata = null) {
    const firstTurn = await this.isFirstTurn(sessionId);
    let systemPrompt;

    if (isBatch) {
      if (firstTurn) {
        const promptTemplate = await getPromptBASEAIBatchAsync();
        systemPrompt = promptTemplate
          .replace("_{SOURCE}", sourceLang)
          .replace("_{TARGET}", targetLang)
          .split("_{TEXT}")[0].trim();
      } else {
        const followUpTemplate = await getPromptBASEAIFollowupAsync();
        systemPrompt = followUpTemplate
          .replace("_{SOURCE}", sourceLang)
          .replace("_{TARGET}", targetLang);
      }
    } else {
      systemPrompt = await buildPrompt("", sourceLang, targetLang, translateMode, providerType);
    }

    // Append context metadata if available and feature enabled
    if (contextMetadata) {
      const isSmartContextEnabled = await getSmartContextTranslationEnabledAsync();
      
      if (isSmartContextEnabled) {
        const contextStr = `\nContext: Page: "${contextMetadata.pageTitle || 'Unknown'}", Section: "${contextMetadata.heading || 'Main'}", Role: "${contextMetadata.role || 'Content'}". Use this context to ensure consistent terminology and tone.`;
        systemPrompt += contextStr;
      }
    }

    return { systemPrompt, userText: text };
  },

  /**
   * Helper to get conversation messages for AI providers
   * @param {string} sessionId - Session identifier
   * @param {string} providerName - Name of the provider
   * @param {string} currentText - New text to translate
   * @param {string} systemPrompt - Base system prompt
   * @param {string} translateMode - Translation mode (Page, Selection, etc.)
   * @returns {Promise<object>} - { messages, session }
   */
  async getConversationMessages(sessionId, providerName, currentText, systemPrompt, translateMode = '') {
    if (!sessionId) {
      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentText }
        ],
        session: null
      };
    }

    const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
    const session = translationSessionManager.getOrCreateSession(sessionId, providerName);

    // Initial turn: Set system prompt
    if (session.history.length === 0) {
      session.systemPrompt = systemPrompt;
      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentText }
        ],
        session
      };
    }

    // Subsequent turns: Send history + instructions reminder + current text
    const messages = [
      { role: 'system', content: session.systemPrompt }
    ];

    // ONLY apply history logic for Select Element mode.
    // Each Page Translation batch is independent content from the page. 
    // Sending history in other modes causes massive token bloat and triggers Rate Limits.
    if (translateMode === TranslationMode.Select_Element) {
      const maxHistoryMessages = 10;
      const history = session.history.slice(-maxHistoryMessages);
      messages.push(...history);
    }

    // Add current text
    messages.push({ role: 'user', content: currentText });

    return { messages, session };
  },

  /**
   * Helper to update session history with results
   * @param {string} sessionId - Session identifier
   * @param {string} userContent - User content
   * @param {string} assistantContent - Assistant content
   */
  async updateSessionHistory(sessionId, userContent, assistantContent) {
    if (!sessionId) return;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      translationSessionManager.addMessage(sessionId, 'user', userContent);
      translationSessionManager.addMessage(sessionId, 'assistant', assistantContent);
      
      const session = translationSessionManager.sessions.get(sessionId);
      if (session) session.batchCount++;
    } catch (e) {
      logger.warn('Failed to update session history:', e);
    }
  }
};
