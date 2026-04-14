/**
 * AI Conversation Helper - Manages session history and prompt preparation for AI providers
 * Optimized for token reduction while maintaining quality for small LLMs.
 */

import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { 
  getPromptBASEAIBatchAsync, 
  getPromptBASEAIBatchAutoAsync,
  getPromptBASEAIFollowupAsync, 
  getPromptBASEAIFollowupAutoAsync,
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
  async prepareDeepLContext(sessionId, contextMetadata, translateMode = null) {
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

    // 2. Compact History (Last full turn: User + Assistant)
    // History is only included for Select Element to maintain style/consistency
    if (historyEnabled && sessionId && translateMode === TranslationMode.Select_Element) {
      try {
        const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
        const session = translationSessionManager.sessions.get(sessionId);
        if (session && session.history.length >= 2) {
          const lastTwo = session.history.slice(-2);
          const userPart = lastTwo.find(m => m.role === 'user');
          const assistantPart = lastTwo.find(m => m.role === 'assistant');
          
          if (userPart && assistantPart) {
            const userSnippet = typeof userPart.content === 'string' ? userPart.content : JSON.stringify(userPart.content);
            const assistantSnippet = typeof assistantPart.content === 'string' ? assistantPart.content : JSON.stringify(assistantPart.content);
            
            contextParts.push(`Last turn reference: [Original: "${userSnippet.substring(0, 150)}..." | Translated: "${assistantSnippet.substring(0, 150)}..."]`);
          }
        } else if (session && session.history.length > 0) {
          // Fallback for single message
          const lastMsg = session.history[session.history.length - 1];
          const snippet = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
          contextParts.push(`Reference: ${snippet.substring(0, 200)}`);
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
      
      if (sourceLang === 'auto') {
        promptTemplate = useFollowup 
          ? await getPromptBASEAIFollowupAutoAsync() 
          : await getPromptBASEAIBatchAutoAsync();
      } else {
        promptTemplate = useFollowup 
          ? await getPromptBASEAIFollowupAsync() 
          : await getPromptBASEAIBatchAsync();
      }
        
      if (useFollowup) {
        promptTemplate += `\n\nCRITICAL: Keep original JSON structure. Result must be ONLY JSON. Target Language: ${targetLang}.`;
      }
    } else {
      promptTemplate = await buildPrompt("$_{TEXT}", sourceLang, targetLang, translateMode, providerType);
    }

    if (!promptTemplate.includes("$_{TEXT}")) {
      promptTemplate += "\n\nText to translate:\n$_{TEXT}";
    }

    const { getLanguageNameFromCode } = await import('@/shared/config/languageConstants.js');
    const sourceName = sourceLang === 'auto' ? 'automatically detected language' : (getLanguageNameFromCode(sourceLang) || sourceLang);
    const targetName = getLanguageNameFromCode(targetLang) || targetLang;

    // Use project standard placeholders: $_{SOURCE}, $_{TARGET}, $_{TEXT} with global regex
    const systemPrompt = promptTemplate
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName);

    const userText = typeof text === 'string' ? text : JSON.stringify(text);

    let finalSystemPrompt = systemPrompt;

    // Inject context only for DOM-related modes if enabled
    const contextSupportedMode = translateMode === TranslationMode.Select_Element || 
                                translateMode === TranslationMode.Page || 
                                translateMode === TranslationMode.Selection;

    if (contextMetadata && contextEnabled && contextSupportedMode) {
      finalSystemPrompt += `\nContext: Page: "${contextMetadata.pageTitle || 'Unknown'}", Section: "${contextMetadata.heading || 'Main'}", Role: "${contextMetadata.role || 'Content'}".`;
    }

    // Replace text placeholder according to project standard $_{TEXT} with global regex
    const resultPrompt = finalSystemPrompt
      .replace(/\$_{TEXT}/g, "the text provided in the user message")
      .trim();

    return {
      systemPrompt: resultPrompt,
      userText
    };  },

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
