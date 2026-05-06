/**
 * TTS Queue Manager - Orchestrates text chunking and sequential playback
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { handleGoogleTTSSpeak } from '@/features/tts/handlers/handleGoogleTTS.js';
import { handleEdgeTTSSpeak } from '@/features/tts/handlers/handleEdgeTTS.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { TTS_ENGINES } from '@/shared/constants/tts.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSQueueManager');

class TTSQueueManager {
  constructor() {
    this.chunks = [];
    this.currentIndex = -1;
    this.language = 'en';
    this.engine = null;
    this.currentSender = null;
    this.originalMessage = null;
    this.isStopping = false;
  }

  /**
   * Start a new TTS session with chunking
   * @param {string} text - Full text to play
   * @param {string} language - Detected language
   * @param {string} engine - Selected TTS engine
   * @param {object} message - Original message object
   * @param {object} sender - Requester info
   */
  async start(text, language, engine, message, sender) {
    logger.debug(`Starting queue for engine: ${engine}, lang: ${language}`);
    
    this.isStopping = false;
    this.language = language;
    this.engine = engine;
    this.currentSender = sender;
    this.originalMessage = message;
    
    // 1. Chunking text into logical segments (sentences)
    this.chunks = this._splitIntoChunks(text, 200); // 200 is safe for Google and good for Edge TTFB
    this.currentIndex = 0;

    if (this.chunks.length === 0) {
      return { success: false, error: 'No chunks generated' };
    }

    logger.debug(`Text split into ${this.chunks.length} chunks`);

    // 2. Play first chunk
    return await this._playCurrentChunk();
  }

  /**
   * Play the next chunk in the queue
   */
  async playNext() {
    if (this.isStopping) return;

    this.currentIndex++;
    if (this.currentIndex < this.chunks.length) {
      logger.debug(`Playing next chunk: ${this.currentIndex + 1}/${this.chunks.length}`);
      await this._playCurrentChunk();
    } else {
      logger.debug('Queue completed');
      await ttsStateManager.notifyTTSEnded('completed');
      this.reset();
    }
  }

  /**
   * Internal method to trigger playback of the current chunk
   * @private
   */
  async _playCurrentChunk() {
    if (this.currentIndex < 0 || this.currentIndex >= this.chunks.length) return;

    const chunkText = this.chunks[this.currentIndex];
    const chunkMessage = {
      ...this.originalMessage,
      data: {
        ...this.originalMessage.data,
        text: chunkText,
        language: this.language
      }
    };

    const handler = this.engine === TTS_ENGINES.EDGE ? handleEdgeTTSSpeak : handleGoogleTTSSpeak;
    
    // We pass the resolved language directly to the handler to bypass redundant detection
    const response = await handler(chunkMessage, this.currentSender, this.language);
    
    if (!response.success) {
      logger.warn(`Chunk playback failed at index ${this.currentIndex}:`, response.error);
      this.reset();
      // Error will be notified by the handler or state manager
    }
    
    return response;
  }

  /**
   * Handle audio completion signal to trigger next chunk
   */
  async onChunkEnded(reason) {
    if (reason === 'completed') {
      await this.playNext();
    } else {
      // If stopped, interrupted, or error - clear queue
      logger.debug(`Queue interrupted by reason: ${reason}`);
      this.reset();
    }
  }

  /**
   * Stop all playback and clear queue
   */
  stop() {
    this.isStopping = true;
    this.reset();
  }

  /**
   * Reset internal state
   */
  reset() {
    this.chunks = [];
    this.currentIndex = -1;
    this.engine = null;
    this.currentSender = null;
    this.originalMessage = null;
  }

  /**
   * Split text into chunks at sentence boundaries
   * @private
   */
  _splitIntoChunks(text, limit) {
    if (!text) return [];
    
    // Use Intl.Segmenter if available (supported in modern Chrome/Edge/Firefox)
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(this.language, { granularity: 'sentence' });
        const segments = segmenter.segment(text);
        const sentences = Array.from(segments).map(s => s.segment.trim()).filter(Boolean);
        return this._groupSentences(sentences, limit);
      } catch (error) {
        logger.debug('Intl.Segmenter failed, falling back to regex splitting', error.message);
      }
    }

    // Fallback: Regex splitting for sentences
    const sentences = text.split(/(?<=[.!?。！？])\s+/).map(s => s.trim()).filter(Boolean);
    return this._groupSentences(sentences, limit);
  }

  /**
   * Group sentences into chunks that don't exceed the character limit
   * @private
   */
  _groupSentences(sentences, limit) {
    const grouped = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      // If a single sentence is larger than the limit, split it by words
      if (sentence.length > limit) {
        if (currentChunk) {
          grouped.push(currentChunk);
          currentChunk = '';
        }
        
        const words = sentence.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + ' ' + word).length > limit) {
            if (wordChunk) grouped.push(wordChunk.trim());
            wordChunk = word;
          } else {
            wordChunk += (wordChunk ? ' ' : '') + word;
          }
        }
        if (wordChunk) currentChunk = wordChunk;
        continue;
      }

      if ((currentChunk + ' ' + sentence).length > limit) {
        grouped.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      grouped.push(currentChunk.trim());
    }

    return grouped;
  }
}

export const ttsQueueManager = new TTSQueueManager();
