// src/background/handlers/tts/handleTTSSpeakContent.js
// Handler for content script TTS fallback requests

import browser from 'webextension-polyfill';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeTTSContentHandler = (handler) => {
  errorHandlerInstance = handler;
};

/**
 * Handle TTS speak request through content script fallback
 * @param {Object} request - Message request
 * @returns {Promise<Object>} Response
 */
export const handleTTSSpeakContent = async (request) => {
  try {
    console.log('[TTSContentHandler] Processing content script TTS request:', request);

    if (!request.data || !request.data.text) {
      throw new Error('Text to speak is required for content script TTS');
    }

    
    // Get active tab for content script injection
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs || tabs.length === 0) {
      throw new Error('No active tab found for content script TTS');
    }

    const tab = tabs[0];
    
    // Send TTS message directly to content script
    const response = await Promise.race([
      browser.tabs.sendMessage(tab.id, {
        action: 'TTS_SPEAK_CONTENT',
        data: request.data
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Content script TTS timeout')), 5000)
      )
    ]);

    if (response && response.success) {
      console.log('[TTSContentHandler] Content script TTS successful');
      return { success: true };
    } else {
      throw new Error(response?.error || 'Content script TTS failed');
    }

  } catch (error) {
    console.error('[TTSContentHandler] Error handling content script TTS:', error);
    
    if (errorHandlerInstance) {
      return errorHandlerInstance.handle(error, {
        type: ErrorTypes.TTS_ERROR,
        message: error.message || 'Content script TTS failed',
        context: 'handleTTSSpeakContent'
      });
    } else {
      return {
        success: false,
        error: error.message || 'Content script TTS handler failed'
      };
    }
  }
};