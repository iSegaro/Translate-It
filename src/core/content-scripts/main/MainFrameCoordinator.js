/**
 * MainFrameCoordinator.js
 * Handles cross-frame communication and synchronization between the main frame and iframes.
 */
import { pageEventBus } from '@/core/PageEventBus.js';

export class MainFrameCoordinator {
  constructor(aggregator, MessageActions, contentScriptCore) {
    this.aggregator = aggregator;
    this.MessageActions = MessageActions;
    this.contentScriptCore = contentScriptCore;
    
    this.initialize();
  }

  /**
   * Initializes message listeners and bus synchronizers.
   */
  initialize() {
    this.setupMessageListener();
    this.setupBusSynchronizers();
  }

  /**
   * Broadcasts a deactivation signal to all child iframes.
   */
  broadcastDeactivation() {
    const broadcastMessage = { 
      type: 'DEACTIVATE_ALL_SELECT_MANAGERS', 
      source: 'translate-it-main' 
    };
    
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        iframe.contentWindow.postMessage(broadcastMessage, '*');
      } catch (e) {
        // Cross-origin restrictions are expected for some iframes
      }
    });
  }

  /**
   * Broadcasts a specific page translation action to all iframes.
   * @param {string} action - MessageAction constant.
   * @param {Object} data - Payload data.
   */
  broadcastPageAction(action, data = {}) {
    if (action === this.MessageActions.PAGE_TRANSLATE || 
        action === this.MessageActions.PAGE_RESTORE) {
      this.aggregator.clearAll();
    }

    const broadcastMessage = { 
      type: 'TRANSLATE_IT_PAGE_ACTION', 
      source: 'translate-it-main',
      action,
      data
    };

    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        iframe.contentWindow.postMessage(broadcastMessage, '*');
      } catch (e) {
        // Silently skip iframes with strict cross-origin policies
      }
    });
  }

  /**
   * Sets up the global 'message' listener to handle events from child iframes.
   */
  setupMessageListener() {
    window.addEventListener('message', (event) => {
      // 1. Process messages from our own lite-iframes
      if (event.data?.source === 'translate-it-iframe') {
        const { type, data } = event.data;
        
        // Progress updates
        if (type === 'TRANSLATE_IT_PAGE_PROGRESS') {
          this.aggregator.updateFrameData(event.source, data);
          this.aggregator.emitAggregateProgress();
          return;
        }

        // Completion signals
        if (type === 'TRANSLATE_IT_PAGE_COMPLETE') {
          this.aggregator.updateFrameData(event.source, { 
            ...data, 
            isTranslating: false, 
            status: 'idle', 
            isTranslated: true 
          });
          this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_COMPLETE, data);
          return;
        }

        // Stopped (Auto-Restore) signals
        if (type === 'TRANSLATE_IT_PAGE_STOPPED') {
          this.aggregator.updateFrameData(event.source, { 
            ...data, 
            isTranslating: false, 
            status: 'idle' 
          });
          this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
          return;
        }

        // Forward other events to the local PageEventBus
        if (type && pageEventBus) {
          pageEventBus.emit(type, data);
        }
      }

      // 2. Handle specific UI/Interaction signals from iframes
      this.handleInteractionSignals(event.data);
    });
  }

  /**
   * Handles interaction-specific messages like deactivation, selection, and clicks.
   * @param {Object} messageData - Data from the message event.
   */
  handleInteractionSignals(messageData) {
    if (!messageData) return;

    // Deactivation request
    if (messageData.type === 'translate-it-deactivate-select-element') {
      if (window.selectElementManagerInstance) {
        window.selectElementManagerInstance.deactivate({ 
          fromIframe: true, 
          reason: 'manual' 
        }).catch(() => {});
      }
    }

    // Text selection detection (to show UI in main frame)
    if (messageData.type === 'TRANSLATE_IT_TEXT_SELECTION_DETECTED') {
      const { text } = messageData.data || {};
      if (text && this.contentScriptCore) {
        this.contentScriptCore.loadFeature('windowsManager').then(() => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[MainFrameCoordinator] Showing UI for selection detected in iframe');
          }
        });
      }
    }

    // Global click detection for UI dismissal
    if (messageData.type === 'TRANSLATE_IT_IFRAME_CLICK_DETECTED') {
      if (window.windowsManagerInstance) {
        window.windowsManagerInstance.dismiss();
      }
    }
  }

  /**
   * Synchronizes PageEventBus actions with cross-frame broadcasts.
   */
  setupBusSynchronizers() {
    if (!pageEventBus) return;

    // Select Element deactivation sync
    pageEventBus.on('select-mode-deactivated', () => {
      this.broadcastDeactivation();
    });

    // Page Translation start
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE, (options) => {
      this.aggregator.updateFrameData('main', { 
        isAutoTranslating: true, 
        isTranslating: true, 
        status: 'translating' 
      });
      this.broadcastPageAction(this.MessageActions.PAGE_TRANSLATE, options);
    });

    // Main frame local progress tracking
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
      if (!data.isAggregated) {
        this.aggregator.updateFrameData('main', data);
        this.aggregator.emitAggregateProgress(null, data);
      }
    });

    // Page Translation complete (Main Frame)
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => {
      if (!data.isAggregated) {
        this.aggregator.updateFrameData('main', { 
          ...data, 
          isTranslating: false, 
          status: 'idle', 
          isTranslated: true 
        });
        this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_COMPLETE, data);
      }
    });

    // Page Translation idle (Main Frame)
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_IDLE, (data) => {
      if (!data.isAggregated) {
        this.aggregator.updateFrameData('main', { 
          ...data, 
          isTranslating: false, 
          status: 'idle' 
        });
        this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_IDLE, data);
      }
    });

    // Auto-Restore complete (Main Frame)
    pageEventBus.on(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (data) => {
      if (!data.isAggregated) {
        this.aggregator.updateFrameData('main', { 
          ...data, 
          isTranslating: false, 
          status: 'idle' 
        });
        this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
      }
    });

    // General commands to broadcast
    pageEventBus.on(this.MessageActions.PAGE_RESTORE, () => {
      this.broadcastPageAction(this.MessageActions.PAGE_RESTORE);
    });

    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_STOP_AUTO, () => {
      this.broadcastPageAction(this.MessageActions.PAGE_TRANSLATE_STOP_AUTO);
    });
  }
}
