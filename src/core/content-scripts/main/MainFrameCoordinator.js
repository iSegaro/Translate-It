/**
 * MainFrameCoordinator.js
 * Handles cross-frame communication and synchronization between the main frame and iframes.
 */
import { pageEventBus } from '@/core/PageEventBus.js';
import { reconstructTranslationError, isStructuredTranslationError } from '@/shared/messaging/core/MessagingCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.IFRAME, 'MainFrameCoordinator');
const MOUSE_HOVER_TRANSLATION_ERROR = 'MOUSE_HOVER_TRANSLATION_ERROR';

function normalizeHoverErrorData(type, data) {
  if (type !== MOUSE_HOVER_TRANSLATION_ERROR || !isStructuredTranslationError(data?.errorDetails)) {
    return data;
  }

  return {
    ...data,
    error: reconstructTranslationError(data.errorDetails)
  };
}

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

  _recordFrameStart(frameId, data = {}) {
    this.aggregator.updateFrameData(frameId, {
      ...data,
      isTranslating: true,
      isTranslated: false,
      isAutoTranslating: data.isAutoTranslating === true,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
      failed: 0,
      status: 'translating'
    });
  }

  /**
   * Sets up the global 'message' listener to handle events from child iframes.
   */
  setupMessageListener() {
    window.addEventListener('message', (event) => {
      // 1. Process messages from our own lite-iframes
      if (event.data?.source === 'translate-it-iframe') {
        const { type, data, action } = event.data;
        // frameUrl is inside data object, not at the top level
        const frameUrl = data?.frameUrl;

        // Use frameUrl as unique identifier instead of event.source (which is always window.top)
        const frameId = frameUrl || event.source;

        logger.debug(`Received iframe message: type=${type}, action=${action}, frameUrl=${frameUrl}`);

        // Generic page events (NEW: forwards all events from IFrame)
        if (type === 'TRANSLATE_IT_PAGE_EVENT' && action) {
          logger.debug(`Processing TRANSLATE_IT_PAGE_EVENT: action=${action}, data=`, data);
          
          // Update frame data based on action type
          if (action === this.MessageActions.PAGE_TRANSLATE_START) {
            this._recordFrameStart(frameId, data);
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_START, data);
          } else if (action === this.MessageActions.PAGE_TRANSLATE_PROGRESS) {
            this.aggregator.updateFrameData(frameId, data);
            this.aggregator.emitAggregateProgress();
          } else if (action === this.MessageActions.PAGE_TRANSLATE_COMPLETE) {
            this.aggregator.updateFrameData(frameId, {
              ...data,
              isTranslating: false,
              status: 'idle',
              isTranslated: true
            });
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_COMPLETE, data);
          } else if (action === this.MessageActions.PAGE_TRANSLATE_IDLE) {
            this.aggregator.updateFrameData(frameId, {
              ...data,
              isTranslating: false,
              status: 'idle',
              isTranslated: (data.translatedCount || 0) > 0
            });
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_IDLE, data);
          } else if (action === this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
            this.aggregator.updateFrameData(frameId, {
              ...data,
              isTranslating: false,
              status: 'idle'
            });
            // Emit aggregated progress so UI state is updated correctly across all contexts
            // This prevents iframe data from directly overwriting main frame state
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
          } else if (action === this.MessageActions.PAGE_RESTORE_COMPLETE) {
            // Clear frame data on restore to ensure clean state
            this.aggregator.updateFrameData(frameId, {
              isTranslating: false,
              isTranslated: false,
              isAutoTranslating: false,
              status: 'idle',
              translatedCount: 0,
              failedCount: 0,
              totalCount: 0
            });
            // Emit aggregated restore complete to update UI state
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_RESTORE_COMPLETE, data);
          } else if (action === this.MessageActions.PAGE_TRANSLATE_ERROR) {
            this.aggregator.updateFrameData(frameId, {
              ...data,
              isTranslating: false,
              status: 'error'
            });
            this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_ERROR, data);
          }
          return;
        }

        // Legacy progress updates (backward compatibility)
        if (type === 'TRANSLATE_IT_PAGE_PROGRESS') {
          this.aggregator.updateFrameData(frameId, data);
          this.aggregator.emitAggregateProgress();
          return;
        }

        // Completion signals
        if (type === 'TRANSLATE_IT_PAGE_COMPLETE') {
          this.aggregator.updateFrameData(frameId, {
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
          this.aggregator.updateFrameData(frameId, {
            ...data,
            isTranslating: false,
            status: 'idle'
          });
          // Emit aggregated progress so UI state is updated correctly
          this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
          return;
        }

        // Forward other events to the local PageEventBus
        if (type && pageEventBus) {
          const eventData = normalizeHoverErrorData(type, data);

          // Special handling for positions from iframes:
          // Transform iframe-relative coordinates to top-frame coordinates
          if (eventData && eventData.position && !eventData.position._isTransformed) {
            const iframeElement = this._getIframeElement(event.source);
            if (iframeElement) {
              const rect = iframeElement.getBoundingClientRect();
              eventData.position.x += rect.left;
              eventData.position.y += rect.top;
              eventData.position._isTransformed = true; // Avoid double transformation
              
              logger.debug(`Transformed iframe position for ${type}:`, eventData.position);
            }
          }
          
          pageEventBus.emit(type, eventData);
        }
      }

      // 2. Handle specific UI/Interaction signals from iframes
      this.handleInteractionSignals(event.data);
    });
  }

  /**
   * Helper to find the <iframe> element associated with a window source.
   * @param {Window} sourceWindow - The contentWindow of the iframe.
   * @returns {HTMLIFrameElement|null}
   */
  _getIframeElement(sourceWindow) {
    try {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        if (iframe.contentWindow === sourceWindow) {
          return iframe;
        }
      }
    } catch (error) {
      logger.warn('Failed to find iframe element for coordinate transformation', error);
    }
    return null;
  }

  /**
   * Handles interaction-specific messages like selection and clicks.
   * @param {Object} messageData - Data from the message event.
   */
  handleInteractionSignals(messageData) {
    if (!messageData) return;

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
   * Synchronizes main-frame lifecycle events with aggregate state.
   */
  setupBusSynchronizers() {
    if (!pageEventBus) return;

    // Page Translation start (Main Frame)
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_START, (data) => {
      if (data.isAggregated) return;

      this._recordFrameStart('main', data);
      this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_START, data);
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

    // Page Translation error (Main Frame)
    pageEventBus.on(this.MessageActions.PAGE_TRANSLATE_ERROR, (data) => {
      if (!data.isAggregated) {
        this.aggregator.updateFrameData('main', {
          ...data,
          isTranslating: false,
          status: 'error'
        });

        if (data.isFatal !== false) {
          this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_TRANSLATE_ERROR, data);
        }
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
        // Emit aggregated event so everyone knows the main state has been reset/stopped
        this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
      }
    });

    // Page Restore complete - clear aggregator data
    pageEventBus.on(this.MessageActions.PAGE_RESTORE_COMPLETE, (data) => {
      if (!data.isAggregated) {
        this.aggregator.clearAll();
        // Emit aggregated event to ensure all contexts get clean state
        this.aggregator.emitAggregateProgress(this.MessageActions.PAGE_RESTORE_COMPLETE, {
          isTranslating: false,
          isTranslated: false,
          isAutoTranslating: false,
          translatedCount: 0,
          failedCount: 0,
          totalCount: 0
        });
      }
    });

  }
}
