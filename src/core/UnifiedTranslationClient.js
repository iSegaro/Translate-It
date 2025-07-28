/**
 * Unified Translation Client - Enhanced communication client
 * Handles both direct messaging and port-based communication
 * Fixes Firefox connection issues with robust handshake
 */

import browser from 'webextension-polyfill';

export class UnifiedTranslationClient {
  constructor(context) {
    if (!context) {
      throw new Error('Context is required');
    }
    
    this.context = context;
    this.port = null;
    this.messageCallbacks = new Map();
    this.messageIdCounter = 0;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
    
    // Start connection process
    this.initializeConnection();
  }

  /**
   * Initialize connection with retry logic
   */
  async initializeConnection() {
    console.log(`[UnifiedTranslationClient:${this.context}] Initializing connection...`);
    
    try {
      await this.establishConnection();
    } catch (error) {
      console.error(`[UnifiedTranslationClient:${this.context}] Initial connection failed:`, error);
      await this.attemptReconnection();
    }
  }

  /**
   * Establish port connection with proper handshake
   */
  async establishConnection() {
    return new Promise((resolve, reject) => {
      console.log(`[UnifiedTranslationClient:${this.context}] Establishing port connection...`);
      
      // Create port connection
      this.port = browser.runtime.connect({ name: `translation-port-${this.context}` });
      
      // Setup connection timeout
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout - no ACK received'));
      }, 5000);

      // Setup message handlers
      this.port.onMessage.addListener(this.handleMessage.bind(this));
      this.port.onDisconnect.addListener(this.handleDisconnect.bind(this));

      // Setup one-time ACK listener
      const ackListener = (message) => {
        if (message.action === 'CONNECTION_ACK' && message.context === this.context) {
          console.log(`[UnifiedTranslationClient:${this.context}] Connection ACK received`);
          clearTimeout(connectionTimeout);
          this.port.onMessage.removeListener(ackListener);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        }
      };

      this.port.onMessage.addListener(ackListener);

      // Send connection ready signal
      this.port.postMessage({
        action: 'CONNECTION_READY',
        context: this.context,
        timestamp: Date.now()
      });

      console.log(`[UnifiedTranslationClient:${this.context}] CONNECTION_READY sent, waiting for ACK...`);
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    console.log(`[UnifiedTranslationClient:${this.context}] Received message:`, message);
    
    const { messageId, success, error, ...data } = message;
    
    if (this.messageCallbacks.has(messageId)) {
      const { resolve, reject, timeoutId } = this.messageCallbacks.get(messageId);
      clearTimeout(timeoutId);
      this.messageCallbacks.delete(messageId);
      
      if (success) {
        resolve(data);
      } else {
        const errorObj = new Error(error?.message || 'Unknown error');
        errorObj.type = error?.type;
        errorObj.code = error?.code;
        reject(errorObj);
      }
    } else {
      console.warn(`[UnifiedTranslationClient:${this.context}] Received message with unknown messageId: ${messageId}`);
    }
  }

  /**
   * Handle port disconnection
   */
  handleDisconnect() {
    console.warn(`[UnifiedTranslationClient:${this.context}] Port disconnected`);
    this.isConnected = false;
    
    // Reject all pending callbacks
    for (const [messageId, { reject, timeoutId }] of this.messageCallbacks.entries()) {
      clearTimeout(timeoutId);
      reject(new Error('Port disconnected'));
    }
    this.messageCallbacks.clear();
    
    // Attempt reconnection if needed
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => this.attemptReconnection(), this.reconnectDelay);
    }
  }

  /**
   * Attempt to reconnect
   */
  async attemptReconnection() {
    this.reconnectAttempts++;
    console.log(`[UnifiedTranslationClient:${this.context}] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    try {
      await this.establishConnection();
      console.log(`[UnifiedTranslationClient:${this.context}] Reconnection successful`);
    } catch (error) {
      console.error(`[UnifiedTranslationClient:${this.context}] Reconnection failed:`, error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectDelay *= 2; // Exponential backoff
        setTimeout(() => this.attemptReconnection(), this.reconnectDelay);
      } else {
        console.error(`[UnifiedTranslationClient:${this.context}] Max reconnection attempts reached`);
      }
    }
  }

  /**
   * Send message with automatic connection handling
   */
  async sendMessage(message, timeout = 30000) {
    // Ensure connection is established
    if (!this.isConnected) {
      console.log(`[UnifiedTranslationClient:${this.context}] Not connected, attempting to establish connection...`);
      await this.ensureConnection();
    }

    return new Promise((resolve, reject) => {
      const messageId = `${this.context}-${++this.messageIdCounter}-${Date.now()}`;
      const messageWithId = { ...message, messageId };

      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.messageCallbacks.delete(messageId);
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);

      // Store callback
      this.messageCallbacks.set(messageId, { resolve, reject, timeoutId });

      // Send message
      try {
        console.log(`[UnifiedTranslationClient:${this.context}] Sending message:`, messageWithId);
        this.port.postMessage(messageWithId);
      } catch (error) {
        this.messageCallbacks.delete(messageId);
        clearTimeout(timeoutId);
        reject(new Error(`Failed to send message: ${error.message}`));
      }
    });
  }

  /**
   * Ensure connection is available
   */
  async ensureConnection() {
    if (this.isConnected) return;

    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !this.isConnected) {
      try {
        await this.establishConnection();
        return;
      } catch (error) {
        attempts++;
        console.warn(`[UnifiedTranslationClient:${this.context}] Connection attempt ${attempts}/${maxAttempts} failed:`, error);
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
    
    throw new Error(`Failed to establish connection after ${maxAttempts} attempts`);
  }

  /**
   * Translation-specific methods
   */
  async translate(sourceText, targetLanguage, options = {}) {
    try {
      console.log(`[UnifiedTranslationClient:${this.context}] Requesting translation...`);
      
      // Format according to translation protocol
      const response = await this.sendMessage({
        action: 'TRANSLATE',
        context: this.context,
        data: {
          text: sourceText,
          provider: targetLanguage.provider || 'google',
          sourceLanguage: targetLanguage.sourceLanguage || 'auto',
          targetLanguage: targetLanguage.targetLanguage || targetLanguage,
          mode: targetLanguage.mode || 'simple',
          options: options
        }
      });

      console.log(`[UnifiedTranslationClient:${this.context}] Translation response received:`, response);
      return response;
      
    } catch (error) {
      console.error(`[UnifiedTranslationClient:${this.context}] Translation error:`, error);
      throw new Error(`Translation failed in ${this.context}: ${error.message}`);
    }
  }

  async getProviders() {
    return this.sendMessage({ action: 'GET_PROVIDERS' });
  }

  async getHistory() {
    return this.sendMessage({ action: 'GET_HISTORY' });
  }

  async clearHistory() {
    return this.sendMessage({ action: 'CLEAR_HISTORY' });
  }

  async speak(text, language, options = {}) {
    return this.sendMessage({
      action: 'TTS_SPEAK',
      text,
      language,
      ...options
    });
  }

  async stopSpeaking() {
    return this.sendMessage({ action: 'TTS_STOP' });
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      context: this.context,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.messageCallbacks.size,
      portName: this.port?.name
    };
  }

  /**
   * Cleanup and disconnect
   */
  disconnect() {
    console.log(`[UnifiedTranslationClient:${this.context}] Disconnecting...`);
    
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (error) {
        console.warn(`[UnifiedTranslationClient:${this.context}] Error disconnecting port:`, error);
      }
    }
    
    // Clear all pending callbacks
    for (const [messageId, { reject, timeoutId }] of this.messageCallbacks.entries()) {
      clearTimeout(timeoutId);
      reject(new Error('Client disconnected'));
    }
    this.messageCallbacks.clear();
    
    this.isConnected = false;
    this.port = null;
  }
}

// Factory function for creating clients
export function createTranslationClient(context) {
  return new UnifiedTranslationClient(context);
}

// Export singleton instances for common contexts
export const popupClient = new UnifiedTranslationClient('popup');
export const sidepanelClient = new UnifiedTranslationClient('sidepanel');
export const optionsClient = new UnifiedTranslationClient('options');