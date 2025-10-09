/**
 * TextFieldIconManager - Manages text field icon creation and lifecycle
 * Manages visual icons that appear near focused text fields for quick translation access
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { state } from "@/shared/config/config.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ExtensionContextManager } from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { PositionCalculator } from '../utils/PositionCalculator.js';
import { ElementAttachment } from '../utils/ElementAttachment.js';
import { textFieldIconConfig } from '../config/positioning.js';
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';


import ElementDetectionService from '@/shared/services/ElementDetectionService.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

// Singleton instance for TextFieldIconManager
let textFieldIconManagerInstance = null;

export class TextFieldIconManager extends ResourceTracker {
  constructor(options = {}) {
    super('text-field-icon-manager')

    // Initialize logger first
    this.logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldIconManager');

    // Enforce singleton pattern
    if (textFieldIconManagerInstance) {
      this.logger.debug('TextFieldIconManager singleton already exists, returning existing instance');
      return textFieldIconManagerInstance;
    }

    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.strategies = options.strategies;
    this.initialized = false;
    this.loggedInit = false; // Flag to prevent duplicate logging
    this._settingsListenersSetup = false; // Flag to prevent duplicate listeners

    // Mark this instance as critical to prevent cleanup during memory management
    this.trackResource('text-field-icon-manager-critical', () => {
      // This is the core text field icon manager - should not be cleaned up
      this.logger.debug('Critical TextFieldIconManager cleanup skipped');
    }, { isCritical: true });

    // Track active icons and their attachments
    this.activeIcons = new Map();
    this.iconAttachments = new Map();
    this.cleanupTimeouts = new Map();

    // Element detection service
    this.elementDetection = ElementDetectionService;

    // Only log once during first initialization
    if (!this.loggedInit) {
      this.logger.init('TextFieldIconManager initialized');
      this.loggedInit = true;
    }

    // Store singleton instance
    textFieldIconManagerInstance = this;
    this.logger.debug('TextFieldIconManager singleton created');
  }

  // Static method to get singleton instance
  static getInstance(options = {}) {
    if (!textFieldIconManagerInstance) {
      textFieldIconManagerInstance = new TextFieldIconManager(options);
    }
    return textFieldIconManagerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (textFieldIconManagerInstance) {
      textFieldIconManagerInstance.destroy();
      textFieldIconManagerInstance = null;
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

    // Listen for icon click events from the UI Host (using ResourceTracker)
    this.addEventListener(pageEventBus, 'text-field-icon-clicked', (detail) => {
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

    // Setup settings listeners (only once)
    this.setupSettingsListeners();

    // Listen for WindowsManager icon events to prevent conflicts
    this.addEventListener(pageEventBus, 'windows-manager-show-icon', (detail) => {
      this.logger.debug('WindowsManager icon shown, preventing TextFieldIcon creation');
      this._windowsManagerIconActive = true;
      // Clean up any existing TextFieldIcon when WindowsManager shows an icon
      this.cleanup();
    });

    this.addEventListener(pageEventBus, 'windows-manager-dismiss-icon', (detail) => {
      this.logger.debug('WindowsManager icon dismissed, allowing TextFieldIcon creation');
      this._windowsManagerIconActive = false;
    });
  }

  /**
   * Setup settings change listeners (only once)
   */
  setupSettingsListeners() {
    // Only setup listeners once
    if (this._settingsListenersSetup) {
      this.logger.debug('Settings listeners already setup, skipping');
      return;
    }

    this._settingsListeners = [
      // Note: EXTENSION_ENABLED listener is handled by FeatureManager
      // We don't need to duplicate it here as FeatureManager will handle activation/deactivation

      settingsManager.onChange('TRANSLATE_ON_TEXT_SELECTION', (newValue) => {
        this.logger.debug('TRANSLATE_ON_TEXT_SELECTION changed:', newValue);
        if (!newValue) {
          // Clean up all icons when text selection feature is disabled
          this.cleanup();
        }
      }, 'text-field-icon-manager')
    ];

    this._settingsListenersSetup = true;
    this.logger.debug('Settings listeners setup complete');
  }

  /**
   * Check if element should show text field icon using new field detection system
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element should show text field icon
   */
  async isEditableElement(element) {
    if (!element) return false;

    // Use the local TextFieldDetector
    try {
      // Import the local detector
      const { textFieldDetector } = await import('../utils/TextFieldDetector.js');

      const detection = await textFieldDetector.detect(element);
      // TextFieldDetector result - logged at TRACE level for detailed debugging
      // this.logger.trace('TextFieldDetector result:', {
      //   tagName: element.tagName,
      //   fieldType: detection.fieldType,
      //   shouldShowTextFieldIcon: detection.shouldShowTextFieldIcon
      // });
      return detection.shouldShowTextFieldIcon;
    } catch (error) {
      this.logger.debug('Error in field detection, using fallback:', error);
      return this._basicFieldDetection(element);
    }
  }

  /**
   * Basic field detection fallback
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is editable
   */
  _basicFieldDetection(element) {
    if (!element) return false;
    
    // Check for contenteditable elements
    if (element.isContentEditable ||
        element.contentEditable === 'true' ||
        (element.closest && element.closest('[contenteditable="true"]'))) {
      return true;
    }
    
    // Check for textarea elements
    if (element.tagName === "TEXTAREA") {
      return true;
    }
    
    // Check for input elements, but only text-based types
    if (element.tagName === "INPUT") {
      const inputType = (element.type || '').toLowerCase();
      
      // List of text-based input types that should show the translation icon
      const textInputTypes = [
        'text',
        'search',
        'textarea'
      ];
      
      // If no type specified, default to text
      const effectiveType = inputType || 'text';
      
      // Check if it's a text-based type
      if (!textInputTypes.includes(effectiveType)) {
        return false;
      }
      
      // Additional filtering: Exclude authentication-related fields
      const name = (element.name || '').toLowerCase();
      const placeholder = (element.placeholder || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const autocomplete = (element.autocomplete || '').toLowerCase();
      
      // List of authentication-related keywords to exclude (from config)
      const authKeywords = textFieldIconConfig.detection.authKeywords;
      
      // Check if any authentication keyword is present in element attributes
      const hasAuthKeyword = authKeywords.some(keyword => 
        name.includes(keyword) || 
        placeholder.includes(keyword) || 
        id.includes(keyword) ||
        autocomplete.includes(keyword)
      );
      
      if (hasAuthKeyword) {
        return false;
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Check if text field icon creation should be processed
   * @param {Element} element - Target element
   * @returns {boolean|null} Whether to process (null = skip silently)
   */
  async shouldProcessTextField(element) {
    // Context validation: Ensure the extension context is valid BEFORE any settings calls
    if (!ExtensionContextManager.isValidSync()) {
      // Skipping icon creation - Extension context is invalid (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Extension context is invalid.');
      return null;
    }

    // Get settings from SettingsManager
    const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', false);
    const isTextFieldFeatureEnabled = settingsManager.get('TRANSLATE_ON_TEXT_FIELDS', false);

    // Basic validation
    if (!isExtensionEnabled) {
      // Skipping icon creation - Extension is disabled (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Extension is disabled.');
      return null;
    }

    // Protocol check
    if (typeof window === 'undefined' || !["http:", "https:"].includes(window.location.protocol)) {
      // Skipping icon creation - Invalid protocol or no window (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Invalid protocol or no window.');
      return null;
    }

    // Exclusion check for text field icons
    const exclusionChecker = ExclusionChecker.getInstance();
    const isFeatureAllowed = await exclusionChecker.isFeatureAllowed('textFieldIcon');
    if (!isFeatureAllowed) {
      // Skipping icon creation - Site excluded for text field icons (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Site excluded for text field icons.');
      return false;
    }

    // Feature flag check
    if (!isTextFieldFeatureEnabled) {
      // Skipping icon creation - TRANSLATE_ON_TEXT_FIELDS feature is disabled (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: TRANSLATE_ON_TEXT_FIELDS feature is disabled.');
      return false;
    }

    // Check if we should prevent text field icon creation
    if (state && state.preventTextFieldIconCreation === true) {
      return false;
    }

    // Check if WindowsManager currently has an active icon
    if (this._windowsManagerIconActive) {
      this.logger.debug('Skipping icon creation: WindowsManager icon is currently active');
      return false;
    }

    // Check if another icon is already active
    if (state.activeTranslateIcon) {
      // Additional check: Verify if the active icon is a WindowsManager icon
      // WindowsManager icons have IDs starting with 'translation-icon-'
      const activeIcon = state.activeTranslateIcon;
      const isWindowsManagerIcon = activeIcon && (
        activeIcon.id?.startsWith('translation-icon-') ||
        activeIcon.className?.includes('translation-icon') ||
        activeIcon.getAttribute?.('data-translate-icon')
      );

      if (isWindowsManagerIcon) {
        this.logger.debug('Skipping icon creation: WindowsManager icon is active');
        return false;
      }

      this.logger.debug('Another icon is active, skipping TextFieldIcon creation');
      return false;
    }

    // Element validation
    if (!await this.isEditableElement(element)) {
      // Skipping icon creation - Element is not editable (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Element is not editable.');
      return false;
    }

    // Platform-specific filtering
    if (!this.applyPlatformFiltering(element)) {
      // Skipping icon creation - Platform filtering rules applied (logged at TRACE level)
      // this.logger.trace('Skipping icon creation: Platform filtering rules applied.');
      return false;
    }

    return true;
  }  /**
   * Apply platform-specific filtering for special fields
   * @param {Element} element - Target element
   * @returns {boolean} Whether element should be processed (false = skip)
   */
  async applyPlatformFiltering(element) {
    // Get browser utils from factory
    const { detectPlatform, Platform } = await utilsFactory.getBrowserUtils();

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
  async processEditableElement(element) {
    // Check if processing should continue
    const shouldProcess = await this.shouldProcessTextField(element);
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

    // Calculate optimal position using the new positioning system
    const positioningMode = textFieldIconConfig.positioning.defaultPositioningMode;
    const optimalPosition = PositionCalculator.calculateOptimalPosition(
      element,
      null, // Use default icon size
      {
        checkCollisions: true,
        positioningMode: positioningMode
      }
    );

    // Position calculation details - logged at TRACE level for detailed debugging
    // this.logger.trace('Calculated optimal position:', {
    //   placement: optimalPosition.placement,
    //   position: { top: optimalPosition.top, left: optimalPosition.left },
    //   isFallback: optimalPosition.isFallback
    // });

    // Emit event to UI Host to add the icon with enhanced data
    pageEventBus.emit('add-field-icon', {
      id: iconId,
      position: optimalPosition,
      targetElement: element,
      attachmentMode: 'smart',
      positioningMode: positioningMode
    });

    // Track the created icon with enhanced data
    this.trackIcon({ 
      id: iconId, 
      element, 
      position: optimalPosition,
      created: Date.now()
    }, element);

    // Create attachment for position management
    this.createIconAttachment(iconId, element);

    // Add info log for successful icon creation - this is useful to track actual usage
    this.logger.info(`[TextField] Icon created for ${element.tagName}${element.type ? `(${element.type})` : ''}`);
    return { id: iconId, element, position: optimalPosition };
  }

  /**
   * Handle focus event on editable element
   * @param {Element} element - Focused element
   * @returns {Element|null} Created icon or null
   */
  handleEditableFocus(element) {
    // Check if WindowsManager currently has an active icon
    if (this._windowsManagerIconActive) {
      this.logger.debug('WindowsManager icon is active, skipping TextFieldIcon creation on focus');
      return null;
    }

    if (state.activeTranslateIcon) {
      // Check if the active icon is from WindowsManager
      const activeIcon = state.activeTranslateIcon;
      const isWindowsManagerIcon = activeIcon && (
        activeIcon.id?.startsWith('translation-icon-') ||
        activeIcon.className?.includes('translation-icon') ||
        activeIcon.getAttribute?.('data-translate-icon')
      );

      if (isWindowsManagerIcon) {
        this.logger.debug('WindowsManager icon is active, skipping TextFieldIcon creation');
        return null;
      }

      this.logger.debug('Icon already active, skipping focus handling');
      return null;
    }

    if (!this.featureManager?.isOn("TEXT_FIELDS")) {
      return null;
    }

    // Handling editable focus - logged at TRACE level for detailed debugging
    // this.logger.trace('Handling editable focus for:', element.tagName);
    return this.processEditableElement(element);
  }

  /**
   * Handle blur event on editable element
   * @param {Element} element - Blurred element
   */
  handleEditableBlur(element) {
    // Handling editable blur - logged at TRACE level for detailed debugging
  // this.logger.trace('Handling editable blur for:', element.tagName);

    // Use microtask for faster response while maintaining execution order
    const cleanupTimeout = this.trackTimeout(() => {
      Promise.resolve().then(() => {
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

        // Don't cleanup if WindowsManager is processing a translation operation
        if (this.state && this.state.preventTextFieldIconCreation) {
          this.logger.debug('WindowsManager is processing translation, keeping icons active');
          return;
        }

        // Don't cleanup if focus moved to any translation-related element
        if (activeElement?.isConnected && this.elementDetection.isUIElement(activeElement)) {
          this.logger.debug('Focus moved to translation element, keeping active');
          return;
        }

        // Cleanup if no active element or focus moved away from icon/translation area
        if (
          !activeElement?.isConnected ||
          !this.elementDetection.isUIElement(activeElement)
        ) {
          this.logger.debug('Cleaning up after blur');
          this.cleanup();
        }
      });
    }, 10); // Minimal delay to ensure microtask scheduling works properly

    // Track timeout for potential cancellation
    this.cleanupTimeouts.set(element, cleanupTimeout);
  }

  /**
   * Create attachment for icon to manage its lifecycle
   * @param {string} iconId - Icon ID
   * @param {Element} targetElement - Target element
   */
  createIconAttachment(iconId, targetElement) {
    // Callback function to handle icon position updates
    const iconUpdateCallback = (updateData) => {
      this.handleIconUpdate(updateData);
    };

    const positioningMode = textFieldIconConfig.positioning.defaultPositioningMode;
    const attachment = new ElementAttachment(iconId, targetElement, iconUpdateCallback, positioningMode);

    // Attach the icon to the element
    attachment.attach();

    // Store the attachment for later cleanup
    this.iconAttachments.set(iconId, attachment);

    this.logger.debug('Created attachment for icon:', iconId, {
      positioningMode: positioningMode
    });
  }

  /**
   * Handle icon position updates from ElementAttachment
   * @param {Object} updateData - Update data from attachment
   */
  handleIconUpdate(updateData) {
    const { iconId, position, visible, reason } = updateData;

    // Handle scroll dismissal immediately
    if (updateData.dismiss && reason === 'scroll-started') {
      // Find and remove the icon
      for (const [element, iconData] of this.activeIcons.entries()) {
        if (iconData.id === iconId) {
          this.cleanupElement(element);
          break;
        }
      }

      return;
    }

    // Emit position update events
    if (position) {
      pageEventBus.emit('update-field-icon-position', {
        id: iconId,
        position,
        visible: visible !== false
      });
    }

    // Also emit visibility changes if explicitly provided
    if (visible !== undefined) {
      pageEventBus.emit('update-field-icon-visibility', {
        id: iconId,
        visible: visible
      });
    }
  }

  /**
   * Track created icon for lifecycle management
   * @param {Object} iconData - Icon data
   * @param {Element} targetElement - Target element the icon is for
   */
  trackIcon(iconData, targetElement) {
    this.activeIcons.set(targetElement, {
      id: iconData.id,
      created: iconData.created || Date.now(),
      position: iconData.position,
      targetElement
    });

    this.logger.debug('Tracking new icon', {
      targetTag: targetElement.tagName,
      iconId: iconData.id || 'no-id',
      placement: iconData.position?.placement,
      totalTracked: this.activeIcons.size
    });
  }

  /**
   * Cleanup all icons and attachments
   */
  cleanup() {
    this.logger.debug('Starting enhanced cleanup');

    // Clear all cleanup timeouts (ResourceTracker will handle this)
    this.cleanupTimeouts.clear();

    // Cleanup all attachments
    for (const [iconId, attachment] of this.iconAttachments.entries()) {
      this.logger.debug('Cleaning up attachment for icon:', iconId);
      attachment.detach();
    }
    this.iconAttachments.clear();

    // Emit event to UI Host to remove all icons
    pageEventBus.emit('remove-all-field-icons');

    // Clear tracked icons
    this.activeIcons.clear();

    // Call parent cleanup to handle ResourceTracker resources
    super.cleanup();

    this.logger.debug('Enhanced cleanup completed');
  }

  /**
   * Cleanup all resources including settings listeners
   */
  destroy() {
    this.logger.debug('Destroying TextFieldIconManager');

    // Cleanup settings listeners
    if (this._settingsListeners) {
      this._settingsListeners.forEach(unsubscribe => unsubscribe());
      this._settingsListeners = null;
    }
    this._settingsListenersSetup = false;

    // Clean up all icons and attachments
    this.cleanup();

    // Reset singleton instance
    if (textFieldIconManagerInstance === this) {
      textFieldIconManagerInstance = null;
    }

    this.logger.debug('TextFieldIconManager destroyed');
  }

  /**
   * Cleanup specific element's icon and attachment
   * @param {Element} element - Element to cleanup
   */
  cleanupElement(element) {
    // Clear any pending timeout for this element (ResourceTracker will handle this)
    this.cleanupTimeouts.delete(element);

    // Remove from tracking
    const iconData = this.activeIcons.get(element);
    if (iconData) {
      // Cleanup attachment first
      const attachment = this.iconAttachments.get(iconData.id);
      if (attachment) {
        this.logger.debug('Cleaning up attachment for element:', element.tagName);
        attachment.detach();
        this.iconAttachments.delete(iconData.id);
      }

      // Emit event to UI Host to remove specific icon
      pageEventBus.emit('remove-field-icon', { id: iconData.id });
      this.activeIcons.delete(element);
      this.logger.debug('Cleaned up element:', element.tagName);
    }
  }

  /**
   * Get information about tracked icons and attachments
   * @returns {Object} Icon information
   */
  getIconsInfo() {
    const icons = [];
    for (const [element, data] of this.activeIcons.entries()) {
      const attachment = this.iconAttachments.get(data.id);
      icons.push({
        id: data.id,
        targetTag: element.tagName,
        targetId: element.id || 'no-id',
        created: data.created,
        age: Date.now() - data.created,
        position: data.position,
        placement: data.position?.placement,
        iconConnected: true, // Always true as it's managed by Vue
        attachmentStatus: attachment ? attachment.getStatus() : null
      });
    }

    return {
      initialized: this.initialized,
      activeIconsCount: this.activeIcons.size,
      activeAttachmentsCount: this.iconAttachments.size,
      pendingTimeoutsCount: this.cleanupTimeouts.size,
      icons,
      dependencies: {
        translationHandler: !!this.translationHandler,
        notifier: !!this.notifier,
        strategies: !!this.strategies,
        featureManager: !!this.featureManager
      },
      positioningSystem: {
        positionCalculator: 'PositionCalculator',
        attachmentSystem: 'ElementAttachment',
        smartPositioning: true
      }
    };
  }

  /**
   * Force update all icon positions (useful after layout changes)
   */
  forceUpdateAllPositions() {
    this.logger.debug('Force updating all icon positions');
    
    for (const [, attachment] of this.iconAttachments.entries()) {
      attachment.forceUpdate();
    }
  }

  /**
   * Get debug information for positioning system
   * @param {Element} element - Optional specific element to debug
   * @returns {Object} Debug information
   */
  getPositioningDebugInfo(element = null) {
    if (element) {
      return PositionCalculator.getDebugInfo(element);
    }

    const debugInfo = {
      activeIcons: this.activeIcons.size,
      activeAttachments: this.iconAttachments.size,
      elements: []
    };

    for (const [targetElement, iconData] of this.activeIcons.entries()) {
      debugInfo.elements.push({
        iconId: iconData.id,
        elementDebug: PositionCalculator.getDebugInfo(targetElement),
        attachmentStatus: this.iconAttachments.get(iconData.id)?.getStatus()
      });
    }

    return debugInfo;
  }

  /**
   * Get manager description
   * @returns {string} Description
   */
  getDescription() {
    return 'Enhanced text field translate icon manager with smart positioning and attachment system';
  }
}
