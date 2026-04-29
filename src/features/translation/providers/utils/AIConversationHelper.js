/**
 * AI Conversation Helper - Manages session history and prompt preparation for AI providers
 * Optimized for token reduction while maintaining quality for small LLMs.
 */

import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from '@/shared/config/translationConstants.js';
import { 
  getPromptAsync,
  getPromptAutoAsync,
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
   * Internal helper to truncate text intelligently at sentence or word boundaries
   * to maintain meaning while staying under the character limit.
   * @private
   */
  _truncateSmart(text, maxLength) {
    if (!text || typeof text !== 'string' || text.length <= maxLength) return text;

    // 1. Try to find the last sentence end (., !, ?, \n) within the last 25% of the allowed range
    const searchRangeStart = Math.floor(maxLength * 0.75);
    const lastSentenceEnd = Math.max(
      text.lastIndexOf('. ', maxLength),
      text.lastIndexOf('! ', maxLength),
      text.lastIndexOf('? ', maxLength),
      text.lastIndexOf('\n', maxLength)
    );

    let cutIndex = -1;

    if (lastSentenceEnd >= searchRangeStart) {
      // Prioritize sentence ends if they are reasonably close to the limit
      cutIndex = lastSentenceEnd + 1;
    } else {
      // 2. Fallback: Find the last space before the limit to avoid cutting a word
      cutIndex = text.lastIndexOf(' ', maxLength);
    }

    // 3. Last resort: Hard cut if no space or sentence end is found (e.g., very long word)
    if (cutIndex <= 0) cutIndex = maxLength;

    // 4. Clean up trailing punctuation/whitespace and add ellipsis
    // Includes Arabic/Persian comma (U+060C)
    return text.substring(0, cutIndex).replace(/[.,;:\-\s\u060C]+$/, '') + '...';
  },

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
   * @param {string} sessionId - Active session ID
   * @param {string} translateMode - Current translation mode
   * @param {Object} options - Options for history (maxTurns, maxChars)
   */
  async getConversationHistory(sessionId, translateMode = '', options = {}) {
    if (!sessionId) return [];

    // History is primarily used for Select Element to maintain style
    if (translateMode !== TranslationMode.Select_Element) return [];

    const historyEnabled = await getAIConversationHistoryEnabledAsync();
    if (!historyEnabled) return [];

    const { 
      maxTurns = 1, 
      maxChars = TRANSLATION_CONSTANTS.HISTORY_CHARACTER_LIMITS.AI 
    } = options;

    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      const session = translationSessionManager.sessions.get(sessionId);
      if (!session || !session.history || session.history.length === 0) return [];

      const turns = [];
      const messagesToProcess = session.history.slice(-(maxTurns * 2));

      for (let i = 0; i < messagesToProcess.length; i += 2) {
        const userMsg = messagesToProcess[i];
        const assistantMsg = messagesToProcess[i + 1];
        if (userMsg && assistantMsg && userMsg.role === 'user' && assistantMsg.role === 'assistant') {
          turns.push({ 
            user: this._truncateSmart(userMsg.content, maxChars), 
            assistant: this._truncateSmart(assistantMsg.content, maxChars) 
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
      const charLimit = TRANSLATION_CONSTANTS.HISTORY_CHARACTER_LIMITS.DEEPL;
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
            
            contextParts.push(`Last turn reference: [Original: "${this._truncateSmart(userSnippet, charLimit)}" | Translated: "${this._truncateSmart(assistantSnippet, charLimit)}"]`);
          }
        } else if (session && session.history.length > 0) {
          // Fallback for single message
          const lastMsg = session.history[session.history.length - 1];
          const snippet = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
          contextParts.push(`Reference: ${this._truncateSmart(snippet, charLimit + 50)}`);
        }
      } catch { /* ignore */ }
    }

    if (contextParts.length === 0) return undefined;

    // Final safety guard: DeepL API context parameter has a hard limit of 1024 characters.
    // We join and truncate at 1000 for maximum safety while preserving meaning.
    const finalContext = contextParts.join('. ');
    return finalContext.length > 1000 
      ? this._truncateSmart(finalContext, 1000) 
      : finalContext;
  },

  /**
   * Helper to prepare system prompt and user text for AI providers
   */
  async preparePromptAndText(text, sourceLang, targetLang, translateMode, providerType, sessionId = null, isBatch = false, contextMetadata = null) {
    const firstTurn = await this.isFirstTurn(sessionId);
    const [historyEnabled, contextEnabled] = await Promise.all([
      getAIConversationHistoryEnabledAsync(),
      getAIContextTranslationEnabledAsync()
    ]);

    const { getLanguageNameFromCode } = await import('@/shared/config/languageConstants.js');
    const sourceName = sourceLang === 'auto' ? 'automatically detected language' : (getLanguageNameFromCode(sourceLang) || sourceLang);
    const targetName = getLanguageNameFromCode(targetLang) || targetLang;

    let promptTemplate;
    const isDictionary = translateMode === TranslationMode.Dictionary_Translation;

    if (isBatch && !isDictionary) {
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
        promptTemplate += `\n\nCRITICAL: Keep original JSON structure. Result must be ONLY JSON. Target Language: ${targetName}.`;
      }
    } else {
      // For dictionary mode or single segments, use the standard buildPrompt logic
      const promptText = Array.isArray(text) ? text[0] : text;
      promptTemplate = await buildPrompt(promptText, sourceLang, targetLang, translateMode, providerType);
    }

    if (!promptTemplate.includes("$_{TEXT}")) {
      promptTemplate += "\n\nText to translate:\n$_{TEXT}";
    }

    // Resolve instructions from template even for AI batch prompts
    const promptInstructionsTemplate = sourceLang === 'auto' 
      ? await getPromptAutoAsync() 
      : await getPromptAsync();
    
    const promptInstructions = promptInstructionsTemplate
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName);

    // Use project standard placeholders: $_{SOURCE}, $_{TARGET}, $_{TEXT}, $_{PROMPT_INSTRUCTIONS} with global regex
    const systemPrompt = promptTemplate
      .replace(/\$_{SOURCE}/g, sourceName)
      .replace(/\$_{TARGET}/g, targetName)
      .replace(/\$_{PROMPT_INSTRUCTIONS}/g, promptInstructions);

    // Determine if we should wrap the text in a JSON structure
    // We wrap for batch requests (excluding dictionary) or specific modes that use AI batch prompts
    const shouldWrap = (isBatch || translateMode === TranslationMode.Select_Element || translateMode === TranslationMode.Page) && !isDictionary;

    let userText;
    if (shouldWrap) {
      const textsArray = Array.isArray(text) ? text : [text];
      // Wrap into the structured JSON format expected by PROMPT_BASE_AI_BATCH
      // This ensures compatibility with strict AI models that expect 'translations' and 'id'
      userText = JSON.stringify({
        translations: textsArray.map((t, idx) => {
          if (typeof t === 'object' && t !== null) {
            return {
              id: String(t.i || t.id || idx),
              text: t.t || t.text || ''
            };
          }
          return { id: String(idx), text: String(t) };
        })
      });
    } else {
      userText = typeof text === 'string' ? text : JSON.stringify(text);
    }

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

    // History limited to last 1 turn with character capping for token optimization
    if (historyEnabled && translateMode === TranslationMode.Select_Element) {
      const maxHistoryMessages = 2; // Last 1 turn (User + Assistant)
      const rawHistory = session.history.slice(-maxHistoryMessages);
      
      const charLimit = TRANSLATION_CONSTANTS.HISTORY_CHARACTER_LIMITS.AI;
      const history = rawHistory.map(msg => ({
        ...msg,
        content: this._truncateSmart(msg.content, charLimit)
      }));
      
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
    } catch { /* ignore */ }
  }
};
