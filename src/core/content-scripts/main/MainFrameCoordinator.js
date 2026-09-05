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
    this.frameSessionOwners = new Map();

    if (this.contentScriptCore) {
      this.contentScriptCore.mainFrameCoordinator = this;
    }
    
    this.initialize();
  }

  /**
   * Initializes trusted runtime and unrelated iframe interaction listeners.
   */
  initialize() {
    this.setupMessageListener();
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
      errorDetails: null,
      terminalErrorDetails: null,
      terminalCauseSequence: 0,
      status: 'translating'
    });
  }

  /**
   * Retires state for a frame whose browser document was replaced.
   * @param {number} frameId - Trusted browser subframe ID
   * @returns {{success: boolean, retired?: boolean, error?: string}}
   */
  retireFrame(frameId) {
    if (!Number.isInteger(frameId) || frameId <= 0) {
      return { success: false, error: 'Invalid frame identity' };
    }

    this.frameSessionOwners.delete(frameId);
    this.aggregator.removeFrame(frameId);
    return { success: true, retired: true };
  }

  /**
   * Sets up the global 'message' listener for unrelated iframe interactions.
   */
  setupMessageListener() {
    window.addEventListener('message', (event) => {
      const type = event.data?.type;

      // Whole Page lifecycle now uses trusted runtime relay only.
      if (typeof type === 'string' && type.startsWith('TRANSLATE_IT_PAGE_')) {
        return;
      }

      // Process unrelated messages from our own lite-iframes.
      if (event.data?.source === 'translate-it-iframe') {
        const { data } = event.data;

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

  handleTrustedPageLifecycle({ frameId, action, data = {} } = {}) {
    if (!Number.isInteger(frameId) || frameId < 0) {
      return { success: false, error: 'Invalid frame identity' };
    }

    if (!this.MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE_ACTIONS.includes(action)) {
      return { success: false, error: 'Unsupported page lifecycle action' };
    }

    if (action === this.MessageActions.PAGE_TRANSLATION_FRAME_RETIRED) {
      const retirementSessionId = data?.sessionId;
      if (typeof retirementSessionId === 'string' && retirementSessionId.length > 0) {
        const ownedSession = this.frameSessionOwners.get(frameId);
        if (ownedSession !== retirementSessionId) {
          return { success: true, ignored: true, reason: 'stale-session' };
        }
      }
      return this.retireFrame(frameId);
    }

    const { sessionId, ...aggregateData } = data || {};
    const hasSessionId = typeof sessionId === 'string' && sessionId.length > 0;
    const ownedSession = this.frameSessionOwners.get(frameId);

    if (!this.MessageActions.PAGE_TRANSLATION_AGGREGATE_ACTIONS.includes(action)) {
      if (!hasSessionId) {
        pageEventBus.emit(action, data);
        return { success: true, aggregated: false };
      }
      if (ownedSession !== sessionId) {
        return { success: true, ignored: true, reason: 'stale-session' };
      }
      pageEventBus.emit(action, data);
      return { success: true, aggregated: false };
    }

    if (action === this.MessageActions.PAGE_TRANSLATE_START) {
      if (!hasSessionId) {
        return { success: true, ignored: true, reason: 'missing-session' };
      }
      this.frameSessionOwners.set(frameId, sessionId);
      this._recordFrameStart(frameId, aggregateData);
      this.aggregator.emitAggregateProgress(action, data);
    } else if (ownedSession !== sessionId || !hasSessionId) {
      if (action === this.MessageActions.PAGE_TRANSLATE_ERROR && !hasSessionId) {
        pageEventBus.emit(action, data);
        return { success: true, aggregated: false, ignored: true, reason: 'missing-session' };
      }
      return { success: true, ignored: true, reason: 'stale-session' };
    } else if (action === this.MessageActions.PAGE_TRANSLATE_PROGRESS) {
      this.aggregator.updateFrameData(frameId, aggregateData);
      this.aggregator.emitAggregateProgress(null, data);
    } else if (action === this.MessageActions.PAGE_TRANSLATE_COMPLETE) {
      const terminalErrorDetails = aggregateData.isFatal !== true
        && isStructuredTranslationError(aggregateData.errorDetails)
        ? aggregateData.errorDetails
        : null;
      this.aggregator.updateFrameData(frameId, {
        ...aggregateData,
        errorDetails: terminalErrorDetails,
        isTranslating: false,
        status: 'idle',
        isTranslated: true,
      });
      this.aggregator.recordTerminalCause(frameId, terminalErrorDetails);
      this.aggregator.emitAggregateProgress(action, data);
    } else if (action === this.MessageActions.PAGE_TRANSLATE_IDLE) {
      this.aggregator.updateFrameData(frameId, {
        ...aggregateData,
        isTranslating: false,
        status: 'idle',
        isTranslated: (data.translatedCount || 0) > 0,
      });
      this.aggregator.emitAggregateProgress(action, data);
    } else if (action === this.MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
      this.aggregator.updateFrameData(frameId, {
        ...aggregateData,
        isTranslating: false,
        status: 'idle',
      });
      this.aggregator.emitAggregateProgress(action, data);
    } else if (action === this.MessageActions.PAGE_RESTORE_COMPLETE) {
      this.frameSessionOwners.delete(frameId);
      this.aggregator.removeFrame(frameId);
      if (this.frameSessionOwners.size === 0) {
        this.aggregator.emitAggregateProgress(action, data);
      } else {
        this.aggregator.emitAggregateProgress();
      }
    } else if (action === this.MessageActions.PAGE_TRANSLATE_ERROR) {
      this.aggregator.updateFrameData(frameId, {
        ...aggregateData,
        isTranslating: false,
        status: 'error',
      });
      if (frameId !== 0 || data.isFatal !== false) {
        this.aggregator.emitAggregateProgress(action, data);
      }
    }

    return { success: true, aggregated: true };
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

}
