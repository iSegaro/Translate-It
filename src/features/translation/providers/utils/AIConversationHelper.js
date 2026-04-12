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
  getAIContextTranslationEnabledAsync,
  getAIConversationHistoryEnabledAsync
} from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIConversationHelper');

export const AIConversationHelper = {
  /**
   * Check if this is the first turn in a session
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
   * Helper to get conversation history as structured turns
   */
  async getConversationHistory(sessionId, translateMode = '') {
    if (!sessionId) return [];

    // History is primarily used for Select Element to maintain style
    if (translateMode !== TranslationMode.Select_Element) return [];

    const historyEnabled = await getAIConversationHistoryEnabledAsync();
    if (!historyEnabled) return [];

    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      const session = translationSessionManager.sessions.get(sessionId);
      if (!session || !session.history || session.history.length === 0) return [];

      const turns = [];
      for (let i = 0; i < session.history.length; i += 2) {
        const userMsg = session.history[i];
        const assistantMsg = session.history[i + 1];
        if (userMsg && assistantMsg && userMsg.role === 'user' && assistantMsg.role === 'assistant') {
          turns.push({ user: userMsg.content, assistant: assistantMsg.content });
        }
      }
      return turns;
    } catch (e) {
      logger.warn('Failed to get conversation history:', e);
      return [];
    }
  },

  /**
   * Prepares a compact context string for DeepL
   */
  async prepareDeepLContext(sessionId, contextMetadata) {
    let contextParts = [];

    const [contextEnabled, historyEnabled] = await Promise.all([
      getAIContextTranslationEnabledAsync(),
      getAIConversationHistoryEnabledAsync()
    ]);

    // 1. Structural Context (Site Title, Section Heading)
    if (contextEnabled && contextMetadata) {
      if (contextMetadata.pageTitle) contextParts.push(`Site: ${contextMetadata.pageTitle}`);
      if (contextMetadata.heading) contextParts.push(`Section: ${contextMetadata.heading}`);
      if (contextMetadata.role) contextParts.push(`Context: ${contextMetadata.role}`);
    }

    // 2. Compact History (Last successful translation snippet)
    if (historyEnabled && sessionId) {
      try {
        const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
        const session = translationSessionManager.sessions.get(sessionId);
        if (session && session.history.length > 0) {
          const lastAssistantMsg = [...session.history].reverse().find(m => m.role === 'assistant');
          if (lastAssistantMsg) {
            const snippet = typeof lastAssistantMsg.content === 'string' 
              ? lastAssistantMsg.content.substring(0, 300) 
              : JSON.stringify(lastAssistantMsg.content).substring(0, 300);
            contextParts.push(`Last translation reference: ${snippet}`);
          }
        }
      } catch (e) {}
    }

    return contextParts.length > 0 ? contextParts.join('. ') : undefined;
  },

  /**
   * Helper to prepare system prompt and user text for AI providers
   */
  async preparePromptAndText(text, sourceLang, targetLang, translateMode, providerType, sessionId = null, isBatch = false, contextMetadata = null) {
    const providerName = providerType; 
    
    const firstTurn = await this.isFirstTurn(sessionId);
    const [historyEnabled, contextEnabled] = await Promise.all([
      getAIConversationHistoryEnabledAsync(),
      getAIContextTranslationEnabledAsync()
    ]);

    let promptTemplate;

    if (isBatch) {
      const useFollowup = !firstTurn && historyEnabled && translateMode === TranslationMode.Select_Element;
      
      promptTemplate = useFollowup 
        ? await getPromptBASEAIFollowupAsync() 
        : await getPromptBASEAIBatchAsync();
        
      if (useFollowup) {
        promptTemplate += `\n\nCRITICAL: Keep original JSON structure. Result must be ONLY JSON. Target Language: ${targetLang}.`;
      }
    } else {
      promptTemplate = await buildPrompt("_{TEXT}", sourceLang, targetLang, translateMode, providerType);
    }

    if (!promptTemplate.includes("_{TEXT}")) {
      promptTemplate += "\n\nText to translate:\n_{TEXT}";
    }

    const systemPrompt = promptTemplate
      .replace("_{SOURCE}", sourceLang)
      .replace("_{TARGET}", targetLang);

    const userText = typeof text === 'string' ? text : JSON.stringify(text);

    let finalSystemPrompt = systemPrompt;

    // Inject context only for DOM-related modes if enabled
    const contextSupportedMode = translateMode === TranslationMode.Select_Element || 
                                translateMode === TranslationMode.Page || 
                                translateMode === TranslationMode.Selection;

    if (contextMetadata && contextEnabled && contextSupportedMode) {
      finalSystemPrompt += `\nContext: Page: "${contextMetadata.pageTitle || 'Unknown'}", Section: "${contextMetadata.heading || 'Main'}", Role: "${contextMetadata.role || 'Content'}".`;
    }

    return { 
      systemPrompt: finalSystemPrompt.replace("_{TEXT}", "the text provided in the next message").trim(), 
      userText 
    };
  },

  /**
   * Helper to get conversation messages for AI providers
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
    const historyEnabled = await getAIConversationHistoryEnabledAsync();

    if (session.turnCounter <= 1) {
      session.systemPrompt = systemPrompt;
      return {
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: currentText }],
        session
      };
    }

    const messages = [
      { role: 'system', content: systemPrompt || session.systemPrompt }
    ];

    // History limited to last 2 messages (1 turn) only for Select Element
    if (historyEnabled && translateMode === TranslationMode.Select_Element) {
      const maxHistoryMessages = 2; // Last 1 turn (User + Assistant)
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
