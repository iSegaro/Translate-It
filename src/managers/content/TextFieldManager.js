/**
 * TextFieldManager - Manages text field icon creation and lifecycle
 * Extracted from EventHandler for better separation of concerns
 */

import { logME } from "../../utils/core/helpers.js";
import { isUrlExcluded_TEXT_FIELDS_ICON } from "../../utils/ui/exclusion.js";
import { detectPlatform, Platform } from "../../utils/browser/platform.js";
import setupIconBehavior from "../IconBehavior.js";
import { state } from "../../config.js";

export class TextFieldManager {
  constructor(options = {}) {
    this.iconManager = options.iconManager;
    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.strategies = options.strategies;
    this.featureManager = options.featureManager;
    this.initialized = false;
    
    // Track active icons and timeouts
    this.activeIcons = new Map();
    this.cleanupTimeouts = new Map();
    
    logME('[TextFieldManager] Initialized');
  }

  /**
   * Initialize the text field manager
   * @param {Object} dependencies - Required dependencies
   */
  initialize(dependencies = {}) {
    if (this.initialized) {
      logME('[TextFieldManager] Already initialized');
      return;
    }

    // Update dependencies if provided
    if (dependencies.iconManager) this.iconManager = dependencies.iconManager;
    if (dependencies.translationHandler) this.translationHandler = dependencies.translationHandler;
    if (dependencies.notifier) this.notifier = dependencies.notifier;
    if (dependencies.strategies) this.strategies = dependencies.strategies;
    if (dependencies.featureManager) this.featureManager = dependencies.featureManager;

    this.initialized = true;
    logME('[TextFieldManager] ✅ Initialized with dependencies');
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
    if (!this.iconManager || !this.featureManager?.isOn("EXTENSION_ENABLED")) {
      return null;
    }

    if (!this.iconManager) {
      return null;
    }

    // Protocol check
    if (!["http:", "https:"].includes(window.location.protocol)) {
      return null;
    }

    // URL exclusion check
    if (isUrlExcluded_TEXT_FIELDS_ICON(window.location.href)) {
      return null;
    }

    // Feature flag check
    if (!this.featureManager?.isOn("TEXT_FIELDS")) {
      return false;
    }

    // Check if another icon is already active
    if (state.activeTranslateIcon) {
      return false;
    }

    // Element validation
    if (!this.isEditableElement(element)) {
      return false;
    }

    return true;
  }

  /**
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
        logME('[TextFieldManager] Skipping YouTube special field:', element);
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

    logME('[TextFieldManager] Processing editable element:', element);

    // Clean up any existing icons first
    this.cleanup();

    // Apply platform-specific filtering
    if (!this.applyPlatformFiltering(element)) {
      return null;
    }

    // Create the translate icon
    const icon = this.iconManager.createTranslateIcon(element);
    if (!icon) {
      logME('[TextFieldManager] Failed to create translate icon');
      return null;
    }

    // Setup icon behavior
    try {
      setupIconBehavior(
        icon,
        element,
        this.translationHandler,
        this.notifier,
        this.strategies
      );

      // Track the created icon
      this.trackIcon(icon, element);

      logME('[TextFieldManager] ✅ Icon created and configured successfully');
      return icon;

    } catch (error) {
      logME('[TextFieldManager] ❌ Error setting up icon behavior:', error);
      
      // Cleanup failed icon
      if (icon && icon.parentNode) {
        icon.parentNode.removeChild(icon);
      }
      
      return null;
    }
  }

  /**
   * Handle focus event on editable element
   * @param {Element} element - Focused element
   * @returns {Element|null} Created icon or null
   */
  handleEditableFocus(element) {
    if (state.activeTranslateIcon) {
      logME('[TextFieldManager] Icon already active, skipping focus handling');
      return null;
    }

    if (!this.featureManager?.isOn("TEXT_FIELDS")) {
      return null;
    }

    logME('[TextFieldManager] Handling editable focus for:', element);
    return this.processEditableElement(element);
  }

  /**
   * Handle blur event on editable element
   * @param {Element} element - Blurred element
   */
  handleEditableBlur(element) {
    logME('[TextFieldManager] Handling editable blur for:', element);

    // Delay cleanup to allow user to interact with icon
    const cleanupTimeout = setTimeout(() => {
      const activeElement = document.activeElement;
      
      // Don't cleanup if focus moved to the translate icon or its children
      if (
        activeElement?.isConnected &&
        (activeElement === state.activeTranslateIcon ||
         activeElement.closest(".AIWritingCompanion-translation-icon-extension"))
      ) {
        logME('[TextFieldManager] Focus moved to translate icon, keeping active');
        return;
      }

      // Cleanup if no active element or focus moved away from icon area
      if (
        !activeElement?.isConnected ||
        !activeElement.closest(".AIWritingCompanion-translation-icon-extension")
      ) {
        logME('[TextFieldManager] Cleaning up after blur');
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
  trackIcon(icon, targetElement) {
    this.activeIcons.set(targetElement, {
      icon,
      created: Date.now(),
      targetElement
    });

    logME('[TextFieldManager] Tracking new icon:', {
      targetTag: targetElement.tagName,
      iconId: icon.id || 'no-id',
      totalTracked: this.activeIcons.size
    });
  }

  /**
   * Cleanup all icons and timeouts
   */
  cleanup() {
    logME('[TextFieldManager] Starting cleanup');

    // Clear all cleanup timeouts
    for (const timeout of this.cleanupTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.cleanupTimeouts.clear();

    // Use IconManager cleanup if available
    if (this.iconManager) {
      this.iconManager.cleanup();
    }

    // Clear tracked icons
    this.activeIcons.clear();

    logME('[TextFieldManager] ✅ Cleanup completed');
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
      this.activeIcons.delete(element);
      logME('[TextFieldManager] Cleaned up element:', element.tagName);
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
        targetTag: element.tagName,
        targetId: element.id || 'no-id',
        created: data.created,
        age: Date.now() - data.created,
        iconConnected: data.icon.isConnected
      });
    }

    return {
      initialized: this.initialized,
      activeIconsCount: this.activeIcons.size,
      pendingTimeoutsCount: this.cleanupTimeouts.size,
      icons,
      dependencies: {
        iconManager: !!this.iconManager,
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