// SelectElementManager - Simplified Manager using domtranslator
// Reduced from ~1,265 lines to ~300 lines by using domtranslator library
// Single responsibility: Manage Select Element mode lifecycle and interactions

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getSettingsAsync } from '@/shared/config/config.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';

// Import new simplified services
import { DomTranslatorAdapter } from './core/DomTranslatorAdapter.js';
import { ElementSelector } from './core/ElementSelector.js';
import { extractTextFromElement, isValidTextElement } from './utils/elementHelpers.js';

// Import notification manager (keeping as-is)
import { getSelectElementNotificationManager } from './SelectElementNotificationManager.js';

/**
 * Simplified SelectElementManager using domtranslator library
 * Major reduction in complexity by leveraging battle-tested library
 */
class SelectElementManager extends ResourceTracker {
  constructor() {
    super('select-element-manager');

    // Core state
    this.isActive = false;
    this.isProcessingClick = false;
    this.isInitialized = false;
    this.instanceId = Math.random().toString(36).substring(7);
    this.isInIframe = window !== window.top;

    // Logger
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElementManager');

    // New simplified services
    this.domTranslatorAdapter = new DomTranslatorAdapter();
    this.elementSelector = new ElementSelector();

    // Track services for ResourceTracker cleanup
    this.trackResource('dom-translator-adapter', () => {
      if (this.domTranslatorAdapter) {
        this.domTranslatorAdapter.cleanup?.();
        this.domTranslatorAdapter = null;
      }
    }, { isCritical: true });

    this.trackResource('element-selector', () => {
      if (this.elementSelector) {
        this.elementSelector.cleanup?.();
        this.elementSelector = null;
      }
    }, { isCritical: true });

    // Notification manager (singleton)
    this.notificationManager = null;

    // Event handlers (bound)
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.preventNavigationHandler = this.preventNavigationHandler.bind(this);

    // Escape key flag
    window.selectElementHandlingESC = false;

    this.logger.debug('New SelectElementManager instance created', {
      instanceId: this.instanceId,
      isInIframe: this.isInIframe,
    });
  }

  /**
   * Initialize the manager and all services
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.debug('SelectElementManager already initialized, skipping');
      return;
    }

    this.logger.debug('SelectElementManager.initialize() started');

    try {
      // Initialize services
      await this.domTranslatorAdapter.initialize();
      await this.elementSelector.initialize();

      // Get notification manager instance
      const NotificationManagerModule = await import('@/core/managers/core/NotificationManager.js');
      const baseNotificationManager = new NotificationManagerModule.default();
      this.notificationManager = await getSelectElementNotificationManager(baseNotificationManager);

      // Setup keyboard listener for ESC
      this.setupKeyboardListeners();

      // Setup cancel listener
      this.setupCancelListener();

      // Setup cross-frame communication
      this.setupCrossFrameCommunication();

      this.isInitialized = true;
      this.logger.debug('SelectElementManager initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing SelectElementManager:', error);
      throw error;
    }
  }

  /**
   * Activate resources (called by FeatureManager)
   * This only initializes resources, NOT Select Element mode
   */
  async activate() {
    if (this.isInitialized) {
      this.logger.debug('SelectElementManager already initialized');
      return true;
    }

    try {
      await this.initialize();
      this.logger.debug('SelectElementManager activated successfully (resources initialized)');
      return true;
    } catch (error) {
      this.logger.error('Error activating SelectElementManager:', error);
      return false;
    }
  }

  /**
   * Activate Select Element mode
   * This is the main method that starts the interactive selection
   */
  async activateSelectElementMode() {
    if (this.isActive) {
      this.logger.debug('SelectElement mode already active');
      return { isActive: this.isActive, instanceId: this.instanceId };
    }

    this.logger.debug(`SelectElementManager.activateSelectElementMode() instanceId=${this.instanceId}`);

    try {
      // Reset state
      this.isActive = true;
      this.isProcessingClick = false;

      // Setup event listeners
      this.setupEventListeners();

      // Ensure services are available
      const servicesAvailable = await this._ensureServicesAvailable();
      if (!servicesAvailable) {
        this.logger.error('Failed to ensure services availability - cannot activate');
        return { isActive: false, error: 'Services initialization failed' };
      }

      // Activate element selector (cursor, highlighting)
      this.elementSelector.activate();

      // Show notification only in main frame
      if (window === window.top) {
        this.showNotification();

        // Show warning for Bing provider
        const settings = await getSettingsAsync();
        if (settings.TRANSLATION_API === 'bing') {
          const warningMessage = await getTranslationString('SELECT_ELEMENT_BING_WARNING');
          pageEventBus.emit('show-notification', {
            type: 'warning',
            message: warningMessage || 'Bing may have issues with Select Element. Try another provider.',
            duration: 8000,
            id: `bing-warning-${this.instanceId}`,
          });
        }
      }

      // Notify background script
      await this.notifyBackgroundActivation();

      this.logger.info('Select element mode activated successfully');

      return { isActive: this.isActive, instanceId: this.instanceId };
    } catch (error) {
      this.logger.error('Error activating SelectElementManager:', error);
      this.isActive = false;
      throw new Error(`SelectElementManager activation failed: ${error.message}`);
    }
  }

  /**
   * Deactivate Select Element mode
   */
  async deactivate(options = {}) {
    if (!this.isActive) {
      this.logger.debug('SelectElementManager not active');
      return;
    }

    const {
      fromBackground = false,
      fromNotification = false,
      fromCancel = false,
      preserveTranslations = false,
    } = options;

    this.logger.debug('Deactivating SelectElementManager', {
      fromBackground,
      fromNotification,
      fromCancel,
      preserveTranslations,
      instanceId: this.instanceId,
    });

    try {
      // Set active state immediately
      this.isActive = false;

      // Cancel any ongoing translations
      if (!preserveTranslations) {
        this.domTranslatorAdapter.cancelTranslation();
      }

      // Remove event listeners
      this.removeEventListeners();

      // Deactivate element selector
      this.elementSelector.deactivate();

      // Dismiss notification
      if (window === window.top) {
        this.dismissNotification();
      }

      // Clear translation state if not preserving
      if (!preserveTranslations) {
        if (this.domTranslatorAdapter.hasTranslation()) {
          await this.domTranslatorAdapter.revertTranslation();
        }
      }

      // Notify background script
      if (!fromBackground) {
        await this.notifyBackgroundDeactivation();
      }

      this.logger.info('SelectElementManager deactivated successfully');
    } catch (error) {
      this.logger.error('Error deactivating SelectElementManager:', error);
      // Continue with cleanup even if error occurs
      this.isActive = false;
      this.forceCleanup();
    }
  }

  /**
   * Force deactivation (emergency cleanup)
   */
  async forceDeactivate() {
    this.logger.debug('Force deactivating SelectElementManager');

    // Set active state immediately
    this.isActive = false;
    this.isProcessingClick = false;

    try {
      // Cancel translation immediately
      this.domTranslatorAdapter.cancelTranslation();

      // Remove event listeners
      this.removeEventListeners();

      // Deactivate element selector
      this.elementSelector.deactivate();

      // Revert translation
      await this.domTranslatorAdapter.revertTranslation();

      // Dismiss notification
      if (window === window.top) {
        this.dismissNotification();
      }

      this.logger.info('SelectElementManager force deactivated successfully');
    } catch (error) {
      this.logger.error('Error during force deactivation:', error);
      // Ensure state is reset even if cleanup fails
      this.isActive = false;
      this.isProcessingClick = false;
    }
  }

  /**
   * Setup event listeners for mouse and keyboard
   */
  setupEventListeners() {
    if (this.isActive) {
      document.addEventListener('mouseover', this.handleMouseOver, true);
      document.addEventListener('mouseout', this.handleMouseOut, true);
      document.addEventListener('click', this.handleClick, true);

      // Add global click prevention for navigation
      document.addEventListener('click', this.preventNavigationHandler, { capture: true, passive: false });

      // Listen for deactivation requests from iframes (only in main frame)
      if (window === window.top) {
        this.iframeMessageHandler = (event) => {
          if (event.data && event.data.type === 'translate-it-deactivate-select-element') {
            this.logger.debug('Received deactivation request from iframe:', event.data);
            this.deactivate({ fromIframe: true }).catch((error) => {
              this.logger.error('Error deactivating from iframe request:', error);
            });
          }
        };

        window.addEventListener('message', this.iframeMessageHandler);
        this.logger.debug('Added iframe message listener in main frame');
      }

      this.logger.debug('Event listeners setup for SelectElementManager');
    }
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('click', this.preventNavigationHandler, { capture: true, passive: false });

    // Remove iframe message listener
    if (window === window.top && this.iframeMessageHandler) {
      window.removeEventListener('message', this.iframeMessageHandler);
      this.iframeMessageHandler = null;
      this.logger.debug('Removed iframe message listener from main frame');
    }

    this.logger.debug('Event listeners removed for SelectElementManager');
  }

  /**
   * Handle mouse over event
   */
  handleMouseOver(event) {
    if (!this.isActive || this.isProcessingClick) return;

    this.elementSelector.handleMouseOver(event.target);
  }

  /**
   * Handle mouse out event
   */
  handleMouseOut(event) {
    if (!this.isActive || this.isProcessingClick) return;

    this.elementSelector.handleMouseOut(event.target);
  }

  /**
   * Handle element click - trigger translation
   */
  async handleClick(event) {
    if (!this.isActive || this.isProcessingClick) return;

    this.logger.debug('Element clicked in SelectElement mode');

    try {
      this.isProcessingClick = true;

      // Prevent navigation
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Get the highlighted element
      const elementToTranslate = this.elementSelector.getHighlightedElement() || event.target;

      // Validate element
      if (!isValidTextElement(elementToTranslate)) {
        this.logger.debug('Element is not valid for translation', {
          tag: elementToTranslate.tagName,
        });
        return;
      }

      // Extract text
      const text = extractTextFromElement(elementToTranslate);

      this.logger.debug(`Text extraction result: length=${text?.length || 0}, element=${elementToTranslate.tagName}`);

      if (text && text.trim()) {
        this.logger.debug(`Text extracted successfully: ${text.length} chars from ${elementToTranslate.tagName}`);

        // Deactivate selector but keep mode active
        this.elementSelector.deactivate();
        this.removeEventListeners();

        // Start translation
        await this.startTranslation(elementToTranslate);
      } else {
        this.logger.debug('No text found in element', {
          element: elementToTranslate.tagName,
        });
      }
    } catch (error) {
      this.logger.error('Error handling element click:', error);
    } finally {
      this.isProcessingClick = false;
    }
  }

  /**
   * Prevent navigation on interactive elements
   */
  preventNavigationHandler(event) {
    if (!this.isActive || this.isProcessingClick) return;

    const prevented = this.elementSelector.preventNavigation(event);

    if (prevented) {
      this.logger.debug('Navigation prevented on interactive element');
    }
  }

  /**
   * Start translation process
   */
  async startTranslation(targetElement) {
    try {
      this.logger.debug('Starting translation process');

      // Check if still active
      if (!this.isActive) {
        this.logger.debug('SelectElementManager no longer active, aborting translation');
        return;
      }

      // Update notification to show translation in progress
      if (window === window.top) {
        this.updateNotificationForTranslation();
      }

      // Perform translation via domtranslator adapter
      const result = await this.domTranslatorAdapter.translateElement(targetElement, {
        onProgress: async (status) => {
          this.logger.debug('Translation progress:', status);
        },
        onComplete: async (status) => {
          this.logger.debug('Translation completed:', status);
        },
        onError: async (error) => {
          this.logger.error('Translation error:', error);
        },
      });

      if (result.success) {
        this.logger.info('Translation completed successfully');

        // Hide translation overlay
        pageEventBus.emit('hide-translation', { element: targetElement });

        // Deactivate mode after translation
        this.performPostTranslationCleanup();
      }
    } catch (error) {
      this.logger.error('Error during translation:', error);

      // Check for context errors
      const isContextError = ExtensionContextManager.isContextError(error);

      if (isContextError) {
        this.logger.debug('Translation failed: extension context invalidated');
        ExtensionContextManager.handleContextError(error, 'element-translation');
      } else {
        const errorType = matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) {
          this.logger.debug('Translation cancelled by user:', error);
        } else if (!error.alreadyHandled) {
          this.logger.error('Error during translation:', error);
        }
      }

      this.performPostTranslationCleanup();
    }
  }

  /**
   * Post-translation cleanup
   */
  performPostTranslationCleanup() {
    this.logger.debug('Performing post-translation cleanup');

    // Dismiss notification
    if (window === window.top) {
      this.dismissNotification();
    }

    // If this is an iframe, notify main frame
    if (window !== window.top) {
      this.logger.debug('Notifying main frame to deactivate SelectElement mode');
      try {
        window.top.postMessage(
          {
            type: 'translate-it-deactivate-select-element',
            source: 'iframe-translation-complete',
            instanceId: this.instanceId,
          },
          '*'
        );
      } catch (error) {
        this.logger.warn('Failed to notify main frame:', error);
      }
    } else {
      // This is main frame, deactivate directly
      if (this.isActive) {
        this.logger.debug('Deactivating main frame SelectElementManager after translation');
        this.deactivate({ preserveTranslations: true }).catch((error) => {
          this.logger.warn('Error during post-translation cleanup:', error);
        });
      }
    }

    // Reset processing state
    this.isProcessingClick = false;

    this.logger.debug('Post-translation cleanup completed');
  }

  /**
   * Revert translations
   */
  async revertTranslations() {
    this.logger.info('Starting translation revert process in SelectElementManager');

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    // Revert via domtranslator adapter
    const reverted = await this.domTranslatorAdapter.revertTranslation();

    this.logger.info('Translation revert completed', { reverted });

    return reverted ? 1 : 0;
  }

  // ========== Notification Management ==========

  showNotification() {
    pageEventBus.emit('show-select-element-notification', {
      managerId: this.instanceId,
      actions: {
        cancel: () => this.deactivate({ fromNotification: true }),
        revert: () => this.revertTranslations(),
      },
    });

    this.logger.debug('Select Element notification requested');
  }

  updateNotificationForTranslation() {
    pageEventBus.emit('update-select-element-notification', {
      status: 'translating',
    });

    this.logger.debug('Select Element notification updated for translation');
  }

  dismissNotification() {
    this.logger.debug('dismissNotification called with instanceId:', this.instanceId);
    pageEventBus.emit('dismiss-select-element-notification', {
      managerId: this.instanceId,
      isCancelAction: true,
    });

    this.logger.debug('Select Element notification dismissal requested');
  }

  // ========== Keyboard and Cancel Listeners ==========

  setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isActive && !window.selectElementHandlingESC) {
        this.logger.debug('ESC key pressed, deactivating SelectElement mode');

        // Set flag to prevent other ESC handlers
        window.selectElementHandlingESC = true;
        setTimeout(() => {
          window.selectElementHandlingESC = false;
        }, 100);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.deactivate({ fromCancel: true });
      }
    });
  }

  setupCancelListener() {
    pageEventBus.on('cancel-select-element-mode', (data) => {
      this.logger.debug('cancel-select-element-mode event received', {
        data,
        isActive: this.isActive,
        instanceId: this.instanceId,
      });
      if (this.isActive) {
        this.logger.debug('Cancel requested, deactivating SelectElement mode');
        this.deactivate({ fromCancel: true });
      } else {
        this.logger.debug('Cancel event received but SelectElement is not active');
      }
    });
  }

  // ========== Cross-frame Communication ==========

  setupCrossFrameCommunication() {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'DEACTIVATE_ALL_SELECT_MANAGERS') {
        if (event.data.source !== 'translate-it-main') {
          this.deactivate({ fromBackground: true });
        }
      }
    });

    if (window === window.top) {
      const originalDeactivate = this.deactivate.bind(this);
      this.deactivate = async (options = {}) => {
        await originalDeactivate(options);

        // Notify all iframes
        try {
          window.postMessage(
            {
              type: 'DEACTIVATE_ALL_SELECT_MANAGERS',
              source: 'translate-it-main',
            },
            '*'
          );
        } catch {
          // Cross-origin iframe, ignore
        }
      };
    }
  }

  // ========== Background Communication ==========

  async notifyBackgroundActivation() {
    try {
      if (this._isNotifyingBackground) {
        this.logger.debug('Background notification already in progress, skipping duplicate');
        return;
      }

      this._isNotifyingBackground = true;

      await sendMessage({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: true },
      });
      this.logger.debug('Successfully notified background: select element activated');
    } catch (err) {
      this.logger.error('Failed to notify background about activation', err);
    } finally {
      this._isNotifyingBackground = false;
    }
  }

  async notifyBackgroundDeactivation() {
    try {
      await sendMessage({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: false },
      });
      this.logger.debug('Successfully notified background: select element deactivated');
    } catch (err) {
      this.logger.error('Failed to notify background about deactivation', err);
    }
  }

  /**
   * Ensure all required services are available
   */
  async _ensureServicesAvailable() {
    try {
      let servicesRecreated = false;

      if (!this.domTranslatorAdapter) {
        this.logger.debug('DomTranslatorAdapter was cleaned up, recreating...');
        this.domTranslatorAdapter = new DomTranslatorAdapter();
        await this.domTranslatorAdapter.initialize();
        servicesRecreated = true;
      }

      if (!this.elementSelector) {
        this.logger.debug('ElementSelector was cleaned up, recreating...');
        this.elementSelector = new ElementSelector();
        await this.elementSelector.initialize();
        servicesRecreated = true;
      }

      if (servicesRecreated) {
        this.logger.info('SelectElement services recreated successfully');
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to ensure services availability:', error);
      return false;
    }
  }

  // ========== Public API ==========

  isSelectElementActive() {
    return this.isActive;
  }

  getStatus() {
    return {
      serviceActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
      isInitialized: this.isInitialized,
      instanceId: this.instanceId,
      isInIframe: this.isInIframe,
    };
  }

  /**
   * Force cleanup for emergency situations
   */
  forceCleanup() {
    try {
      this.removeEventListeners();
      this.elementSelector.deactivate();

      if (window === window.top) {
        this.dismissNotification();
      }
    } catch (cleanupError) {
      this.logger.error('Critical error during cleanup:', cleanupError);
    }
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    this.logger.info('Cleaning up SelectElement manager');

    try {
      // Deactivate if active
      if (this.isActive) {
        await this.deactivate();
      }

      // Clear instance references
      this.notificationManager = null;

      // ResourceTracker will handle all service cleanup automatically
      super.cleanup();

      this.logger.info('SelectElement manager cleanup completed successfully');
    } catch (error) {
      this.logger.error('Error during SelectElement manager cleanup:', error);
      throw error;
    }
  }
}

// Export class for direct instantiation by FeatureManager
export { SelectElementManager };
