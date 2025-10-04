// ToastIntegration - Main toast integration system
// Centralized management of Vue Sonner toast integration for Select Element mode

import { ToastElementDetector } from './ToastElementDetector.js';
import { ToastEventHandler } from './ToastEventHandler.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export class ToastIntegration {
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.logger = getScopedLogger(LOG_COMPONENTS.NOTIFICATIONS, 'ToastIntegration');
    this.eventHandler = new ToastEventHandler(eventBus);
    this.isInitialized = false;
  }
  
  /**
   * Initialize the toast integration system
   * @param {Object} options - Configuration options
   * @param {Function} options.onCancelClick - Callback for cancel button clicks
   * @param {Function} options.onToastClick - Callback for general toast clicks
   */
  initialize(options = {}) {
    if (this.isInitialized) {
      this.logger.debug('ToastIntegration already initialized');
      return;
    }
    
    this.logger.info('[Toast] Initializing toast integration system');
    this.logger.debug('Initialization options', {
      hasCancelCallback: !!options.onCancelClick,
      hasToastCallback: !!options.onToastClick
    });
    
    try {
      // Initialize event handler with callbacks
      this.eventHandler.enable({
        onCancelClick: options.onCancelClick || this.defaultCancelHandler.bind(this),
        onToastClick: options.onToastClick || this.defaultToastHandler.bind(this)
      });
      
      this.isInitialized = true;
      this.logger.info('[Toast] Integration system initialized successfully');
    } catch (error) {
      this.logger.error('[Toast] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Shutdown the toast integration system
   */
  shutdown() {
    if (!this.isInitialized) {
      return;
    }
    
    this.logger.info('[Toast] Shutting down toast integration system');
    
    this.eventHandler.disable();
    this.isInitialized = false;
    
    this.logger.info('[Toast] Integration system shut down successfully');
  }
  
  /**
   * Default cancel button handler
   * @param {Event} event - Click event
   */
  defaultCancelHandler() {
    this.logger.info('[Toast] Cancel button clicked - triggering default handler');

    if (this.eventBus) {
      this.eventBus.emit('cancel-select-element-mode');
    }
  }
  
  /**
   * Default toast click handler
   * @param {Event} event - Click event
   */
  defaultToastHandler() {
    this.logger.debug('[Toast] Default toast click handler triggered');
    // By default, just prevent the click from propagating
  }
  
  /**
   * Check if an element should be excluded from selection
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded
   */
  shouldExcludeFromSelection(element) {
    return ToastElementDetector.shouldExcludeFromSelection(element);
  }
  
  /**
   * Check if an event is within a toast
   * @param {Event} event - Event to check
   * @returns {boolean} Whether event is within toast
   */
  isEventWithinToast(event) {
    return ToastElementDetector.isEventWithinToast(event);
  }
  
  /**
   * Check if an event is a cancel button click
   * @param {Event} event - Event to check
   * @returns {boolean} Whether event is cancel button click
   */
  isCancelButtonClick(event) {
    return ToastElementDetector.isCancelButtonClick(event);
  }
  
  /**
   * Get current system state
   * @returns {Object} Current state information
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      eventHandler: this.eventHandler.getState(),
      hasEventBus: !!this.eventBus
    };
  }
  
  /**
   * Create a singleton instance for global use
   * @param {Object} eventBus - Event bus instance
   * @returns {ToastIntegration} Singleton instance
   */
  static createSingleton(eventBus = null) {
    if (!ToastIntegration._instance) {
      ToastIntegration._instance = new ToastIntegration(eventBus);
    }
    return ToastIntegration._instance;
  }
  
  /**
   * Get the singleton instance
   * @returns {ToastIntegration|null} Singleton instance or null if not created
   */
  static getInstance() {
    return ToastIntegration._instance || null;
  }
}

// Static property for singleton
ToastIntegration._instance = null;