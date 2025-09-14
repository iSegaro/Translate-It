/**
 * TextFieldIconManager - Manages text field icon creation and lifecycle
 * Manages visual icons that appear near focused text fields for quick translation access
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { detectPlatform, Platform } from "@/utils/browser/platform.js";
import { state } from "@/shared/config/config.js";
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ExtensionContextManager } from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { PositionCalculator } from '../utils/PositionCalculator.js';
import { ElementAttachment } from '../utils/ElementAttachment.js';
import { textFieldIconConfig } from '../config/positioning.js';

export class TextFieldIconManager extends ResourceTracker {
  constructor(options = {}) {
    super('text-field-icon-manager')
    
    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.strategies = options.strategies;
    this.initialized = false;
    this.loggedInit = false; // Flag to prevent duplicate logging
    
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextFieldIconManager');
    
    // Track active icons and their attachments
    this.activeIcons = new Map();
    this.iconAttachments = new Map();
    this.cleanupTimeouts = new Map();
    
    // Only log once during first initialization
    if (!this.loggedInit) {
      this.logger.init('TextFieldIconManager initialized');
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
  }

  /**
   * Check if element should show text field icon using new field detection system
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element should show text field icon
   */
  async isEditableElement(element) {
    if (!element) return false;
    
    // Use the new FieldDetector system - lazy import to avoid circular dependencies
    try {
      // Try to use fieldDetector if available
      if (typeof window !== 'undefined' && window.fieldDetector) {
        const detection = await window.fieldDetector.detect(element);
        return detection.shouldShowTextFieldIcon;
      }
      
      // Fallback to basic detection if FieldDetector not available
      return this._basicFieldDetection(element);
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
    if (element.isContentEditable || (element.closest && element.closest('[contenteditable="true"]'))) {
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
    // Context validation: Ensure the extension context is valid BEFORE any storage calls
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Skipping icon creation: Extension context is invalid.');
      return null;
    }

    // Get current settings from storage using safe operation
    const settings = await ExtensionContextManager.safeStorageOperation(
      () => storageManager.get([
        'EXTENSION_ENABLED',
        'TRANSLATE_ON_TEXT_FIELDS'
      ]),
      'text-field-icon-settings',
      { EXTENSION_ENABLED: false, TRANSLATE_ON_TEXT_FIELDS: false }
    );

    // Basic validation
    if (!settings?.EXTENSION_ENABLED) {
      this.logger.debug('Skipping icon creation: Extension is disabled.');
      return null;
    }

    // Protocol check
    if (typeof window === 'undefined' || !["http:", "https:"].includes(window.location.protocol)) {
      this.logger.debug('Skipping icon creation: Invalid protocol or no window.');
      return null;
    }

    // Feature flag check
    if (!settings?.TRANSLATE_ON_TEXT_FIELDS) {
      this.logger.debug('Skipping icon creation: TRANSLATE_ON_TEXT_FIELDS feature is disabled.');
      return false;
    }

    // Check if we should prevent text field icon creation
    if (state && state.preventTextFieldIconCreation === true) {
      return false;
    }

    // Check if another icon is already active
    if (state.activeTranslateIcon) {
      this.logger.debug('Skipping icon creation: Another icon is already active.');
      return false;
    }

    // Element validation
    if (!await this.isEditableElement(element)) {
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
    const optimalPosition = PositionCalculator.calculateOptimalPosition(
      element,
      null, // Use default icon size
      { checkCollisions: true }
    );

    this.logger.debug('Calculated optimal position:', {
      placement: optimalPosition.placement,
      position: { top: optimalPosition.top, left: optimalPosition.left },
      isFallback: optimalPosition.isFallback
    });

    // Emit event to UI Host to add the icon with enhanced data
    pageEventBus.emit('add-field-icon', { 
      id: iconId, 
      position: optimalPosition,
      targetElement: element,
      attachmentMode: 'smart'
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

    this.logger.debug('Smart icon created and tracked successfully');
    return { id: iconId, element, position: optimalPosition };
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

    // Delay cleanup to allow user to interact with icon (using ResourceTracker)
    const cleanupTimeout = this.trackTimeout(() => {
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
   * Create attachment for icon to manage its lifecycle
   * @param {string} iconId - Icon ID
   * @param {Element} targetElement - Target element
   */
  createIconAttachment(iconId, targetElement) {
    // Callback function to handle icon position updates
    const iconUpdateCallback = (updateData) => {
      this.handleIconUpdate(updateData);
    };

    const attachment = new ElementAttachment(iconId, targetElement, iconUpdateCallback);
    
    // Attach the icon to the element
    attachment.attach();
    
    // Store the attachment for later cleanup
    this.iconAttachments.set(iconId, attachment);
    
    this.logger.debug('Created attachment for icon:', iconId);
  }

  /**
   * Handle icon position updates from ElementAttachment
   * @param {Object} updateData - Update data from attachment
   */
  handleIconUpdate(updateData) {
    const { iconId, position, visible, reason } = updateData;
    
    this.logger.debug('Received icon update:', {
      iconId,
      reason,
      visible,
      placement: position?.placement
    });

    // Emit update event to UI Host
    if (position) {
      pageEventBus.emit('update-field-icon-position', {
        id: iconId,
        position,
        visible: visible !== false
      });
    } else if (visible !== undefined) {
      pageEventBus.emit('update-field-icon-visibility', {
        id: iconId,
        visible
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
