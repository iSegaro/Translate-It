/**
 * TextFieldManager - Manages text field icon creation and lifecycle
 * Extracted from EventHandler for better separation of concerns
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { isUrlExcluded_TEXT_FIELDS_ICON } from "@/utils/ui/exclusion.js";
import { detectPlatform, Platform } from "@/utils/browser/platform.js";
import { state } from "@/shared/config/config.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ExtensionContextManager } from "@/core/extensionContext.js";

export class TextFieldManager {
  constructor(options = {}) {
    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.strategies = options.strategies;
    this.featureManager = options.featureManager;
    this.initialized = false;
    this.loggedInit = false; // Flag to prevent duplicate logging
    
    // Initialize logger
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextFieldManager');
    
    // Track active icons and timeouts
    this.activeIcons = new Map();
    this.cleanupTimeouts = new Map();
    
    // Only log once during first initialization
    if (!this.loggedInit) {
      this.logger.init('TextFieldManager initialized');
      this.loggedInit = true;
    }
  }

  /**
   * Initialize the text field manager
   * @param {Object} dependencies - Required dependencies
   */
  initialize(dependencies = {}) {
    if (this.initialized) {
      this.logger.debug('Already initialized, skipping');
      return;
    }

    // Update dependencies if provided
    if (dependencies.translationHandler) this.translationHandler = dependencies.translationHandler;
    if (dependencies.notifier) this.notifier = dependencies.notifier;
    if (dependencies.strategies) this.strategies = dependencies.strategies;
    if (dependencies.featureManager) this.featureManager = dependencies.featureManager;

    this.initialized = true;
    this.logger.debug('Initialized with dependencies');

    // Listen for icon click events from the UI Host
    pageEventBus.on('text-field-icon-clicked', (detail) => {
      this.logger.debug('Received text-field-icon-clicked event:', detail);
      // Find the element associated with this icon ID
      const iconData = Array.from(this.activeIcons.values()).find(icon => icon.id === detail.id);
      if (iconData && iconData.targetElement) {
        this.logger.debug('Triggering translation for element:', iconData.targetElement.tagName);
        
        // Debug: Check if translationHandler exists and has the method
        if (!this.translationHandler) {
          this.logger.error('Translation handler is not available!');
          return;
        }
        
        if (typeof this.translationHandler.processTranslation_with_CtrlSlash !== 'function') {
          this.logger.error('processTranslation_with_CtrlSlash method not found on translation handler!');
          return;
        }
        
        // Call the translation handler
        this.translationHandler.processTranslation_with_CtrlSlash({
          text: iconData.targetElement.value || iconData.targetElement.textContent,
          target: iconData.targetElement,
        });
        // Immediately clean up the icon after click
        this.cleanupElement(iconData.targetElement);
      }
    });
  }

  /**
   * Check if element is editable (input, textarea, contenteditable)
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is editable
   */
  isEditableElement(element) {
    if (!element) return false;
    
    return (
      element.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(element.tagName) ||
      (element.closest && element.closest('[contenteditable="true"]'))
    );
  }

  /**
   * Check if text field icon creation should be processed
   * @param {Element} element - Target element
   * @returns {boolean|null} Whether to process (null = skip silently)
   */
  shouldProcessTextField(element) {
    // Basic validation
    if (!this.featureManager?.isOn("EXTENSION_ENABLED")) {
      this.logger.debug('Skipping icon creation: Extension is disabled.');
      return null;
    }

    // Context validation: Ensure the extension context is valid
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Skipping icon creation: Extension context is invalid.');
      return null;
    }

    // Protocol check
    if (!["http:", "https:"].includes(window.location.protocol)) {
      this.logger.debug('Skipping icon creation: Invalid protocol.');
      return null;
    }

    // URL exclusion check
    if (isUrlExcluded_TEXT_FIELDS_ICON(window.location.href)) {
      this.logger.debug('Skipping icon creation: URL is excluded.');
      return null;
    }

    // Feature flag check
    if (!this.featureManager?.isOn("TEXT_FIELDS")) {
      this.logger.debug('Skipping icon creation: TEXT_FIELDS feature is disabled.');
      return false;
    }

    // **FIX FOR DISCORD**: Check if we should prevent text field icon creation
    // This prevents conflicts when transitioning from selection icon to translation window
    if (state && state.preventTextFieldIconCreation === true) {
      this.logger.debug('Skipping icon creation: preventTextFieldIconCreation flag is true.');
      return false;
    }

    // Check if another icon is already active
    if (state.activeTranslateIcon) {
      this.logger.debug('Skipping icon creation: Another icon is already active.');
      return false;
    }

    // Element validation
    if (!this.isEditableElement(element)) {
      this.logger.debug('Skipping icon creation: Element is not editable.');
      return false;
    }

    // Platform-specific filtering
    if (!this.applyPlatformFiltering(element)) {
      this.logger.debug('Skipping icon creation: Platform filtering rules applied.');
      return false;
    }

    return true;
  }  /**
   * Apply platform-specific filtering for special fields
   * @param {Element} element - Target element
   * @returns {boolean} Whether element should be processed (false = skip)
   */
  applyPlatformFiltering(element) {
    // YouTube platform-specific handling
    if (detectPlatform() === Platform.Youtube) {
      const youtubeStrategy = this.strategies?.["youtube"];
      
      // Skip processing for recognized special fields on YouTube (search query, etc.)
      // This is a temporary implementation - may need more robust handling in the future
      if (youtubeStrategy?.isYoutube_ExtraField?.(element)) {
        this.logger.debug('Skipping YouTube special field:', element);
        return false;
      }
    }

    // Future: Add other platform-specific filters here
    // if (detectPlatform() === Platform.Twitter) { ... }
    // if (detectPlatform() === Platform.WhatsApp) { ... }

    return true;
  }

  /**
   * Process editable element for text field icon creation
   * @param {Element} element - Target element
   * @returns {Element|null} Created icon element or null
   */
  processEditableElement(element) {
    // Check if processing should continue
    const shouldProcess = this.shouldProcessTextField(element);
    if (shouldProcess === null || shouldProcess === false) {
      return null;
    }

    this.logger.debug('Processing editable element:', element.tagName);

    // Clean up any existing icons first
    this.cleanup();

    // Apply platform-specific filtering
    if (!this.applyPlatformFiltering(element)) {
      return null;
    }

    // Generate a unique ID for the icon
    const iconId = `text-field-icon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Calculate icon position - use fixed positioning relative to viewport  
    const rect = element.getBoundingClientRect();
    const position = {
      top: rect.top + 5,
      left: rect.left + rect.width - 5,
    };


    // Emit event to UI Host to add the icon
    pageEventBus.emit('add-field-icon', { id: iconId, position });

    // Track the created icon
    this.trackIcon({ id: iconId, element, position }, element);

    this.logger.debug('Icon event emitted and tracked successfully');
    return { id: iconId, element, position };
  }

  /**
   * Handle focus event on editable element
   * @param {Element} element - Focused element
   * @returns {Element|null} Created icon or null
   */
  handleEditableFocus(element) {
    if (state.activeTranslateIcon) {
      this.logger.debug('Icon already active, skipping focus handling');
      return null;
    }

    if (!this.featureManager?.isOn("TEXT_FIELDS")) {
      return null;
    }

    this.logger.debug('Handling editable focus for:', element.tagName);
    return this.processEditableElement(element);
  }

  /**
   * Handle blur event on editable element
   * @param {Element} element - Blurred element
   */
  handleEditableBlur(element) {
    this.logger.debug('Handling editable blur for:', element.tagName);

    // Delay cleanup to allow user to interact with icon
    const cleanupTimeout = setTimeout(() => {
      const activeElement = document.activeElement;
      
      // Don't cleanup if focus moved to the translate icon or its children
      if (
        activeElement?.isConnected &&
        (activeElement === state.activeTranslateIcon ||
         activeElement.closest(".AIWritingCompanion-translation-icon-extension"))
      ) {
        this.logger.debug('Focus moved to translate icon, keeping active');
        return;
      }

      // Cleanup if no active element or focus moved away from icon area
      if (
        !activeElement?.isConnected ||
        !activeElement.closest(".AIWritingCompanion-translation-icon-extension")
      ) {
        this.logger.debug('Cleaning up after blur');
        this.cleanup();
      }
    }, 100);

    // Track timeout for potential cancellation
    this.cleanupTimeouts.set(element, cleanupTimeout);
  }

  /**
   * Track created icon for lifecycle management
   * @param {Element} icon - Created icon element
   * @param {Element} targetElement - Target element the icon is for
   */
  trackIcon(iconData, targetElement) {
    this.activeIcons.set(targetElement, {
      id: iconData.id,
      created: Date.now(),
      targetElement
    });

    this.logger.debug('Tracking new icon', {
      targetTag: targetElement.tagName,
      iconId: iconData.id || 'no-id',
      totalTracked: this.activeIcons.size
    });
  }

  /**
   * Cleanup all icons and timeouts
   */
  cleanup() {
    this.logger.debug('Starting cleanup');

    // Clear all cleanup timeouts
    for (const timeout of this.cleanupTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.cleanupTimeouts.clear();

    // Emit event to UI Host to remove all icons
    pageEventBus.emit('remove-all-field-icons');

    // Clear tracked icons
    this.activeIcons.clear();

    this.logger.debug('Cleanup completed');
  }

  /**
   * Cleanup specific element's icon
   * @param {Element} element - Element to cleanup
   */
  cleanupElement(element) {
    // Clear any pending timeout for this element
    const timeout = this.cleanupTimeouts.get(element);
    if (timeout) {
      clearTimeout(timeout);
      this.cleanupTimeouts.delete(element);
    }

    // Remove from tracking
    const iconData = this.activeIcons.get(element);
    if (iconData) {
      // Emit event to UI Host to remove specific icon
      pageEventBus.emit('remove-field-icon', { id: iconData.id });
      this.activeIcons.delete(element);
      this.logger.debug('Cleaned up element:', element.tagName);
    }
  }

  /**
   * Get information about tracked icons
   * @returns {Object} Icon information
   */
  getIconsInfo() {
    const icons = [];
    for (const [element, data] of this.activeIcons.entries()) {
      icons.push({
        id: data.id,
        targetTag: element.tagName,
        targetId: element.id || 'no-id',
        created: data.created,
        age: Date.now() - data.created,
        iconConnected: true // Always true as it's managed by Vue
      });
    }

    return {
      initialized: this.initialized,
      activeIconsCount: this.activeIcons.size,
      pendingTimeoutsCount: this.cleanupTimeouts.size,
      icons,
      dependencies: {
        translationHandler: !!this.translationHandler,
        notifier: !!this.notifier,
        strategies: !!this.strategies,
        featureManager: !!this.featureManager
      }
    };
  }

  /**
   * Get manager description
   * @returns {string} Description
   */
  getDescription() {
    return 'Manages text field translate icon creation and lifecycle';
  }
}
