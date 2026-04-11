/**
 * AI Conversation Helper - Manages session history and prompt preparation for AI providers
 * Optimized for token reduction while maintaining quality for small LLMs.
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
      return !session || session.turnCounter <= 1;
    } catch {
      return true;
    }
  },

  /**
   * Reserve and get the next turn number for a session
   * @param {string} sessionId 
   * @param {string} providerName
   * @returns {Promise<number>}
   */
  async claimNextTurn(sessionId, providerName = 'Unknown') {
    if (!sessionId) return 1;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      return translationSessionManager.claimNextTurn(sessionId, providerName);
    } catch {
      return 1;
    }
  },

  /**
   * Get current turn number for a session
   * @param {string} sessionId 
   * @returns {Promise<number>}
   */
  async getTurnNumber(sessionId) {
    if (!sessionId) return 1;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      return translationSessionManager.getTurnNumber(sessionId);
    } catch {
      return 1;
    }
  },

  /**
   * Helper to prepare system prompt and user text.
   * Optimized to switch between Full and Follow-up prompts based on turn and mode.
   */
  async preparePromptAndText(text, sourceLang, targetLang, translateMode, providerType, sessionId = null, isBatch = false, contextMetadata = null) {
    const firstTurn = await this.isFirstTurn(sessionId);
    let promptTemplate;

    if (isBatch) {
      // Logic: Select Element uses Follow-up for Turn 2+. Page Translate always uses Full.
      const canUseFollowup = translateMode === TranslationMode.Select_Element && !firstTurn;
      
      promptTemplate = canUseFollowup 
        ? await getPromptBASEAIFollowupAsync() 
        : await getPromptBASEAIBatchAsync();
        
      // Reinforce the contract for Follow-up prompts to prevent LLM confusion
      if (canUseFollowup) {
        promptTemplate += `\n\nCRITICAL: Keep original JSON structure. Result must be ONLY JSON. Target Language: ${targetLang}.`;
      }
    } else {
      promptTemplate = await buildPrompt("_{TEXT}", sourceLang, targetLang, translateMode, providerType);
    }

    // Standard placeholder replacement
    if (!promptTemplate.includes("_{TEXT}")) {
      promptTemplate += "\n\nText to translate:\n_{TEXT}";
    }

    const systemPrompt = promptTemplate
      .replace("_{SOURCE}", sourceLang)
      .replace("_{TARGET}", targetLang);

    const userText = typeof text === 'string' ? text : JSON.stringify(text);

    let finalSystemPrompt = systemPrompt;
    if (contextMetadata) {
      const isSmartContextEnabled = await getSmartContextTranslationEnabledAsync();
      if (isSmartContextEnabled) {
        finalSystemPrompt += `\nContext: Page: "${contextMetadata.pageTitle || 'Unknown'}", Section: "${contextMetadata.heading || 'Main'}", Role: "${contextMetadata.role || 'Content'}".`;
      }
    }

    return { 
      systemPrompt: finalSystemPrompt.replace("_{TEXT}", "the text provided in the next message").trim(), 
      userText 
    };
  },

  /**
   * Helper to get conversation messages for AI providers.
   * Manages history injection based on the translation mode.
   */
  async getConversationMessages(sessionId, providerName, currentText, systemPrompt, translateMode = '') {
    if (!sessionId) {
      return {
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: currentText }],
        session: null
      };
    }

    const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
    const session = translationSessionManager.getOrCreateSession(sessionId, providerName);

    // Turn 1: Always send System Prompt + User Text
    if (session.turnCounter <= 1) {
      session.systemPrompt = systemPrompt;
      return {
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: currentText }],
        session
      };
    }

    // Turn 2+: Optimized Context
    const messages = [
      { role: 'system', content: systemPrompt || session.systemPrompt }
    ];

    // Enable history ONLY for Select Element to maintain contextual consistency
    // Limit to last 2 turns (4 messages) to prevent token bloat
    if (translateMode === TranslationMode.Select_Element) {
      const maxHistoryMessages = 4; 
      const history = session.history.slice(-maxHistoryMessages);
      messages.push(...history);
    }

    messages.push({ role: 'user', content: currentText });

    return { messages, session };
  },

  /**
   * Helper to update session history with results
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
