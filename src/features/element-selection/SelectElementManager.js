// SelectElementManager - Simplified Manager using domtranslator
// Reduced from ~1,265 lines to ~300 lines by using domtranslator library
// Single responsibility: Manage Select Element mode lifecycle and interactions

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getSettingsAsync } from '@/shared/config/config.js';
import { NOTIFICATION_TIME, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { useMobileStore } from '@/store/modules/mobile.js';

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
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleInteraction = this.handleInteraction.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

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
      // Initialize services in parallel
      const [NotificationManagerModule] = await Promise.all([
        import('@/core/managers/core/NotificationManager.js'),
        this.domTranslatorAdapter.initialize(),
        this.elementSelector.initialize()
      ]);

      // Get notification manager instance
      const baseNotificationManager = new NotificationManagerModule.default();
      this.notificationManager = await getSelectElementNotificationManager(baseNotificationManager);

      // Setup keyboard listener for ESC
      this.setupKeyboardListeners();

      // Setup cancel listener
      this.setupCancelListener();

      // Setup cross-frame communication
      this.setupCrossFrameCommunication();

      // Listen for activation from PageEventBus (Mobile Dashboard)
      // Use ResourceTracker's addEventListener for automatic cleanup
      this.addEventListener(pageEventBus, MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, (data) => {
        this.logger.info('Activation requested via PageEventBus');
        this.activateSelectElementMode(data || {}).catch(err => {
          this.logger.error('Failed to activate from PageEventBus:', err);
        });
      });

      // Listen for conflicting features (like Whole Page Translation)
      this.addEventListener(pageEventBus, 'STOP_CONFLICTING_FEATURES', (data) => {
        if (this.isActive && data?.source !== 'select-element') {
          this.logger.info('Stopping Select Element mode due to conflicting feature:', data?.source);
          this.deactivate({ silent: true });
        }
      });

      this.isInitialized = true;      this.logger.debug('SelectElementManager initialized successfully');
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
  async activateSelectElementMode(options = {}) {
    if (this.isActive) {
      this.logger.debug('SelectElement mode already active');
      return { isActive: this.isActive, instanceId: this.instanceId };
    }

    // Clean up options to ensure we only have what we need
    const activationOptions = {
      targetLanguage: options.targetLanguage || null,
      ...options
    };

    this.logger.debug(`SelectElementManager.activateSelectElementMode() instanceId=${this.instanceId}`, activationOptions);

    // Emit event to stop conflicting features (e.g., Whole Page Translation)
    pageEventBus.emit('STOP_CONFLICTING_FEATURES', { source: 'select-element' });

    try {
      // Reset state
      this.isActive = true;
      this.isProcessingClick = false;
      this.hasInitialMovementOccurred = false; 
      this.lastMouseX = undefined; // Reset coordinates
      this.lastMouseY = undefined;
      this.currentOptions = activationOptions; 

      // Ensure highlight is cleared from any previous state
      if (this.elementSelector) {
        this.elementSelector.clearHighlight();
      }

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

        // Show warning for Bing/Lingva providers if needed
        // Load settings and potentially translation strings in parallel
        const [settings, bingWarning, lingvaWarning] = await Promise.all([
          getSettingsAsync(),
          getTranslationString('BING_WPT_WARNING'),
          getTranslationString('LINGVA_WPT_WARNING')
        ]);

        const activeProvider = activationOptions.provider || settings.TRANSLATION_API;
        
        if (activeProvider === ProviderRegistryIds.BING) {
          pageEventBus.emit('show-notification', {
            type: 'warning',
            message: bingWarning || 'Bing may have issues with Select Element. Try another provider.',
            duration: NOTIFICATION_TIME.WARNING_PROVIDER,
            id: `bing-warning-${this.instanceId}`,
          });
        } else if (activeProvider === ProviderRegistryIds.LINGVA) {
          pageEventBus.emit('show-notification', {
            type: 'warning',
            message: lingvaWarning || 'Lingva may have issues with long texts. Try another provider.',
            duration: NOTIFICATION_TIME.WARNING_PROVIDER,
            id: `lingva-warning-${this.instanceId}`,
          });
        }
      }

      // Notify background script
      await this.notifyBackgroundActivation();

      // Final reset of activation time after everything is initialized
      this.activationTime = Date.now();

      // Notify UI (ContentApp.vue) to show mobile exit button
      pageEventBus.emit('select-mode-activated');

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
      preserveTranslations = true, // Default to true: don't revert on deactivation
      silent = false,
    } = options;

    // When deactivating, we almost always want to preserve what's already been translated
    // unless explicitly told otherwise (e.g. for emergency cleanup)
    const shouldPreserve = preserveTranslations;

    this.logger.debug('Deactivating SelectElementManager', {
      fromBackground,
      fromNotification,
      fromCancel,
      preserveTranslations,
      shouldPreserve,
      silent,
      instanceId: this.instanceId,
    });

    try {
      // Set active state immediately
      this.isActive = false;
      this.activationTime = 0; // Reset activation time

      // ALWAYS cancel any ongoing translations to stop background processes
      // The silent option prevents unwanted toast notifications if needed
      this.domTranslatorAdapter.cancelTranslation({ silent });

      // Remove event listeners
      this.removeEventListeners();

      // Deactivate element selector
      this.elementSelector.deactivate();

      // Dismiss notification
      if (window === window.top) {
        this.dismissNotification();
      }

      // Clear translation state only if not preserving
      if (!shouldPreserve) {
        if (this.domTranslatorAdapter.hasTranslation()) {
          await this.domTranslatorAdapter.revertTranslation();
        }
      }

      // Notify background script
      if (!fromBackground) {
        await this.notifyBackgroundDeactivation();
      }

      // Notify UI (ContentApp.vue) to hide mobile exit button
      pageEventBus.emit('select-mode-deactivated');

      this.logger.info('SelectElementManager deactivated successfully');
    } catch (error) {
      this.logger.error('Error deactivating SelectElementManager:', error);
      // Continue with cleanup even if error occurs
      this.isActive = false;
      this.forceCleanup();
    }
  }

  /**
   * Force deactivation (emergency cleanup with revert)
   */
  async forceDeactivate() {
    this.logger.debug('Force deactivating SelectElementManager');
    return this.deactivate({ preserveTranslations: false, silent: true });
  }

  /**
   * Setup event listeners for mouse and keyboard
   */
  /**
   * Setup event listeners for mouse and keyboard
   */
  setupEventListeners() {
    if (this.isActive) {
      // Mouseover/mouseout for highlighting
      window.addEventListener('mouseover', this.handleMouseOver, true);
      window.addEventListener('mouseout', this.handleMouseOut, true);

      // Touch support for highlighting (Mobile Scanner Mode)
      // Use passive: false to allow preventDefault() and smooth scanning
      window.addEventListener('touchstart', this.handleTouchStart, { capture: true, passive: false });
      window.addEventListener('touchmove', this.handleTouchMove, { capture: true, passive: false });
      window.addEventListener('touchend', this.handleTouchEnd, { capture: true, passive: false });

      // Block ALL interaction events in capture phase to prevent any site logic from firing
      // This is the core fix for site navigation/actions interfering with selection
      const interactionEvents = [
        'click', 'dblclick', 'mousedown', 'mouseup', 
        'pointerdown', 'pointerup', 'contextmenu', 
        'dragstart', 'touchstart', 'touchend'
      ];
      
      interactionEvents.forEach(eventType => {
        // Critical: Set passive: false for touch/drag events to allow blocking navigation
        const options = { capture: true, passive: false };
        window.addEventListener(eventType, this.handleInteraction, options);
      });

      // Handle Escape key in capture phase for highest reliability
      window.addEventListener('keydown', this.handleKeyDown, true);

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

      this.logger.debug('Event listeners setup for SelectElementManager (window level)');
    }
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    // Remove mouseover/mouseout
    window.removeEventListener('mouseover', this.handleMouseOver, true);
    window.removeEventListener('mouseout', this.handleMouseOut, true);
    window.removeEventListener('touchstart', this.handleTouchStart, { capture: true, passive: false });
    window.removeEventListener('touchmove', this.handleTouchMove, { capture: true, passive: false });
    window.removeEventListener('touchend', this.handleTouchEnd, { capture: true, passive: false });
    
    // Remove all interaction event blockers
    const interactionEvents = [
      'click', 'dblclick', 'mousedown', 'mouseup', 
      'pointerdown', 'pointerup', 'contextmenu', 
      'dragstart', 'touchstart', 'touchend'
    ];
    
    interactionEvents.forEach(eventType => {
      window.removeEventListener(eventType, this.handleInteraction, { capture: true, passive: false });
    });

    // Remove Escape key handler
    window.removeEventListener('keydown', this.handleKeyDown, true);

    // Remove iframe message listener
    if (window === window.top && this.iframeMessageHandler) {
      window.removeEventListener('message', this.iframeMessageHandler);
      this.iframeMessageHandler = null;
      this.logger.debug('Removed iframe message listener from main frame');
    }

    this.logger.debug('Event listeners removed for SelectElementManager');
  }

  /**
   * Helper to prevent events firing too early after activation
   */
  isCooldownActive() {
    return Date.now() - (this.activationTime || 0) < 500;
  }


  /**
   * Handle mouse over event
   */
  handleMouseOver(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    // Smart Movement Detection:
    // If coordinates have changed since the last event, it's an intentional movement 
    // (either hardware mouse moving or a touch-drag starting).
    if (this.lastMouseX !== undefined && (this.lastMouseX !== currentX || this.lastMouseY !== currentY)) {
      if (!this.hasInitialMovementOccurred) {
        this.hasInitialMovementOccurred = true;
        this.logger.debug('Intentional movement detected via coordinates, enabling highlighter');
      }
    }

    // Update last known coordinates
    this.lastMouseX = currentX;
    this.lastMouseY = currentY;

    // Block highlighting until we are sure the user is intentionally moving/scanning
    if (!this.hasInitialMovementOccurred) {
      return;
    }

    // Skip our own elements
    if (this.elementSelector && this.elementSelector.isOurElement(event.target)) {
      return;
    }

    this.elementSelector.handleMouseOver(event.target);
  }

  /**
   * Handle touch start event - initialize scanning
   */
  handleTouchStart(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;
    
    // Check if it's our own UI
    if (this.elementSelector && this.elementSelector.isOurElement(event.touches[0].target)) {
      return;
    }

    // On mobile touchstart, we DO NOT highlight anything yet.
    // We wait for the first touchmove to confirm the user is intentionally scanning.
    // This is the definitive fix for initial ghost highlights on mobile.

    // Prevent site scrolling ONLY during the selection scan
    event.preventDefault();
  }

  /**
   * Handle touch move - the core of "Scanner Mode"
   */
  handleTouchMove(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;

    // First real movement after activation: enable highlights
    if (!this.hasInitialMovementOccurred) {
      this.hasInitialMovementOccurred = true;
      this.logger.debug('Initial movement detected, enabling Select Element scanner');
    }

    // Prevent scrolling while scanning
    event.preventDefault();

    // Get the element at the current touch point
    const touch = event.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);

    if (!target) return;

    // Skip our own elements
    if (this.elementSelector && this.elementSelector.isOurElement(target)) {
      return;
    }

    // Update highlight
    this.elementSelector.handleMouseOver(target);
  }

  /**
   * Handle touch end - finalize selection
   */
  handleTouchEnd(event) {
    if (!this.isActive || this.isProcessingClick) return;

    const highlighted = this.elementSelector.getHighlightedElement();
    
    if (highlighted) {
      this.logger.info('Scanner Mode: Touchend triggered translation for highlighted element');
      this.handleClick(event).catch(err => {
        this.logger.error('Error in handleClick after touch scanning:', err);
      });
    }
  }

  /**
   * Handle mouse out event
   */
  handleMouseOut(event) {
    if (!this.isActive || this.isProcessingClick) return;

    // Skip our own elements
    if (this.elementSelector && this.elementSelector.isOurElement(event.target)) {
      return;
    }

    this.elementSelector.handleMouseOut(event.target);
  }

  /**
   * Universal interaction handler - blocks all site interactions while mode is active
   */
  handleInteraction(event) {
    if (!this.isActive || this.isCooldownActive()) return;

    // Use composedPath for more reliable detection, especially with Shadow DOM
    const path = event.composedPath ? event.composedPath() : [event.target];
    
    // Check if any element in the path belongs to our UI
    const isOurUI = path.some(el => this.elementSelector && this.elementSelector.isOurElement(el));
    
    if (isOurUI) {
      // Let it pass to our own buttons/UI (Toast, Exit button, etc.)
      return;
    }

    // FIX: During translation processing, allow touch/pointer events to pass through
    // so the user can scroll the page while waiting for the translation to complete.
    // We still allow the rest of the function to block 'click' events for navigation prevention.
    const isScrollRelatedTouch = event.type.startsWith('touch') || event.type.startsWith('pointer');
    if (this.isProcessingClick && isScrollRelatedTouch) {
      return;
    }

    // BLOCK EVERYTHING ELSE to prevent site navigation or other extension handlers from firing
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Trigger translation logic on 'click' OR 'touchend' (for mobile speed)
    const isTriggerEvent = event.type === 'click' || (event.type === 'touchend' && deviceDetector.isMobile());
    
    if (isTriggerEvent && !this.isProcessingClick) {
      this.logger.info(`Triggering selection via ${event.type}`);
      this.handleClick(event).catch(err => {
        this.logger.error('Error in handleClick:', err);
      });
    }
  }

  /**
   * Handle keydown events (specifically Escape) in capture phase
   */
  handleKeyDown(event) {
    if (!this.isActive) return;

    if (event.key === 'Escape' && !window.selectElementHandlingESC) {
      this.logger.debug('ESC key pressed (captured), deactivating SelectElement mode');

      // Set flag to prevent other ESC handlers
      window.selectElementHandlingESC = true;
      setTimeout(() => {
        window.selectElementHandlingESC = false;
      }, 100);

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // ESC deactivation should NOT be silent (show "Cancelled by user")
      this.deactivate({ fromCancel: true, silent: false });
    }
  }

  /**
   * Handle element click - trigger translation
   */
  async handleClick(event) {
    // Blocking is now done by handleInteraction, so we focus on translation logic

    // If already processing, don't start new translation
    if (this.isProcessingClick) {
      this.logger.debug('Already processing a click, ignoring new one');
      return;
    }

    this.logger.debug('Element clicked in SelectElement mode');

    try {
      this.isProcessingClick = true;

      // Get the highlighted element or the clicked target
      const elementToTranslate = this.elementSelector.getHighlightedElement() || event.target;

      // Validate element
      if (!isValidTextElement(elementToTranslate)) {
        this.logger.debug('Element is not valid for translation', {
          tag: elementToTranslate?.tagName,
        });
        return;
      }

      // Extract text
      const text = extractTextFromElement(elementToTranslate);

      if (text && text.trim()) {
        this.logger.debug(`Text extracted successfully: ${text.length} chars from ${elementToTranslate.tagName}`);

        // IMPORTANT: We no longer call removeEventListeners() here.
        // We keep blockers active during translation to prevent accidental navigation.
        // The elementSelector is deactivated just to remove the visual highlight.
        this.elementSelector.deactivate();

        // Start translation
        await this.startTranslation(elementToTranslate, this.currentOptions);
      } else {
        this.logger.debug('No text found in element', {
          element: elementToTranslate.tagName,
        });
      }
    } catch (error) {
      this.logger.error('Error handling element click:', error);
    } finally {
      // Check if any translations were stored (even partial ones) to show Revert button
      if (this.domTranslatorAdapter && this.domTranslatorAdapter.hasTranslation()) {
        const mobileStore = useMobileStore();
        mobileStore.setHasElementTranslations(true);
      }
      this.isProcessingClick = false;
    }
  }

  /**
   * Start translation process
   */
  async startTranslation(targetElement, options = {}) {
    try {
      this.logger.debug('Starting translation process', options);

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
        ...this.currentOptions, // Pass stored activation options (provider, targetLanguage)
        ...options,
        onProgress: async (status) => {
          this.logger.debug('Translation progress:', status);
          // Show Revert button as soon as we start, as state is already stored
          const mobileStore = useMobileStore();
          mobileStore.setHasElementTranslations(true);
          
          // Notify other frames (especially main frame) to show Revert badge
          pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_AVAILABLE);
        },
        onComplete: async (status) => {
          this.logger.debug('Translation completed:', status);
        },
        onError: async (errorData) => {
          const error = errorData.error;
          const errorMsg = error?.message || (typeof error === 'string' ? error : 'Unknown translation error');
          this.logger.info(`Translation error: ${errorMsg}`);
        },
      });

      if (result.success) {
        this.logger.info('Translation completed successfully');

        // Update store to show Revert button (redundant but safe)
        const mobileStore = useMobileStore();
        mobileStore.setHasElementTranslations(true);

        // Hide translation overlay
        pageEventBus.emit('hide-translation', { element: targetElement });

        // Deactivate mode after translation
        this.performPostTranslationCleanup();
      } else if (result.cancelled) {
        this.logger.debug('Translation was cancelled by user, no action needed');
        // Don't show error notification or perform cleanup - already done in deactivate()
      }
    } catch (error) {
      const errorType = matchErrorToType(error);
      const isCancellation = errorType === ErrorTypes.USER_CANCELLED || 
                             error.message === 'Handler cancelled' || 
                             error.type === 'HANDLER_CANCELLED';

      if (isCancellation) {
        this.logger.debug('Translation cancelled by user, performing cleanup');
      } else {
        this.logger.error('Error during translation:', error);
      }

      // Ensure Revert button is shown if any partial translation happened
      if (this.domTranslatorAdapter && this.domTranslatorAdapter.hasTranslation()) {
        const mobileStore = useMobileStore();
        mobileStore.setHasElementTranslations(true);
      }

      // Check for context errors
      const isContextError = ExtensionContextManager.isContextError(error);

      if (isContextError) {
        this.logger.debug('Translation failed: extension context invalidated');
        ExtensionContextManager.handleContextError(error, 'element-translation');
      } else if (!isCancellation) {
        if (!error.alreadyHandled) {
          // If not already handled by ErrorHandler in Adapter, we could handle it here, 
          // but Adapter already handles most cases with showToast: true
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
   * @returns {Promise<number>} Number of translations reverted
   */
  async revertTranslations() {
    this.logger.info('Starting translation revert process in SelectElementManager');

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    // Revert via domtranslator adapter (returns count of reverted translations)
    const revertedCount = await this.domTranslatorAdapter.revertTranslation();

    // Reset store status
    const mobileStore = useMobileStore();
    mobileStore.setHasElementTranslations(false);
    
    // Notify other frames to hide Revert badge
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_CLEARED);

    this.logger.info('Translation revert completed', { revertedCount });

    return revertedCount;
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
      status: TRANSLATION_STATUS.TRANSLATING,
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
    // Note: Escape key is now handled in the capture phase by handleKeyDown
    // which is more reliable for blocking site-specific ESC handlers.
    this.logger.debug('setupKeyboardListeners called (ESC handled via capture phase)');
  }

  setupCancelListener() {
    this.addEventListener(pageEventBus, 'cancel-select-element-mode', (data) => {
      this.logger.debug('cancel-select-element-mode event received', {
        data,
        isActive: this.isActive,
        instanceId: this.instanceId,
      });
      if (this.isActive) {
        this.logger.debug('Cancel requested, deactivating SelectElement mode');
        // Notification cancel button should be silent
        this.deactivate({ fromCancel: true, silent: true });
      } else {
        this.logger.debug('Cancel event received but SelectElement is not active');
      }
    });
  }

  // ========== Cross-frame Communication ==========

  setupCrossFrameCommunication() {
    this.addEventListener(window, 'message', (event) => {
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
