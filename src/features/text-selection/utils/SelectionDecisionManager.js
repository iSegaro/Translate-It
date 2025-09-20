import { fieldDetector } from './text/core/FieldDetector.js';
import { FieldTypes } from './text/core/types.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getActiveSelectionIconOnTextfieldsAsync } from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionDecisionManager');

/**
 * Central decision maker for text selection icon display
 * Coordinates between different detection systems to provide consistent behavior
 */
export class SelectionDecisionManager {
  /**
   * Determine if a selection icon should be shown based on the selection context
   * @param {Selection} selection - The current selection
   * @param {Object} context - Additional context for decision making
   * @param {Element} context.element - The context element
   * @param {boolean} context.isFromDoubleClick - Whether selection is from double-click
   * @param {boolean} context.isDragging - Whether user is currently dragging
   * @returns {Object} Decision result with details including detection data
   */
  static async shouldShowSelectionIcon(selection, context) {
    if (!selection || !selection.toString().trim()) {
      return {
        shouldShow: false,
        reason: 'empty-selection',
        details: 'Selection is empty or whitespace only',
        detection: null
      };
    }

    try {
      // Get the current setting for text field selection icon
      const activeSelectionIconOnTextfields = await getActiveSelectionIconOnTextfieldsAsync();
      logger.debug('Active selection icon on textfields setting:', activeSelectionIconOnTextfields);

      // Use the existing FieldDetector system
      let detection;

      // Try to use fieldDetector if available, otherwise use fallback
      if (typeof fieldDetector !== 'undefined' && fieldDetector && typeof fieldDetector.detect === 'function') {
        detection = await fieldDetector.detect(context.element);
        logger.debug('Using fieldDetector for selection decision');
      } else {
        logger.debug('FieldDetector not available, using fallback detection');
        detection = await this._fallbackFieldDetection(context.element);
      }

      // Log the detection details for debugging
      logger.debug('Selection decision analysis', {
        elementType: context.element?.tagName,
        fieldType: detection.fieldType,
        selectionStrategy: detection.selectionStrategy,
        isFromDoubleClick: context.isFromDoubleClick,
        isDragging: context.isDragging,
        textPreview: selection.toString().substring(0, 30)
      });

      // 1. Non-processable fields: never show
      if (detection.fieldType === FieldTypes.NON_PROCESSABLE) {
        return {
          shouldShow: false,
          reason: 'non-processable-field',
          details: {
            fieldType: detection.fieldType,
            elementTag: context.element?.tagName
          },
          detection: detection
        };
      }

      // 2. Regular content (UNKNOWN type): always allow
      if (detection.fieldType === FieldTypes.UNKNOWN) {
        return {
          shouldShow: true,
          reason: 'regular-content',
          details: {
            fieldType: detection.fieldType,
            note: 'Regular webpage content always shows selection icon'
          },
          detection: detection
        };
      }

      // 3. For all text fields, check if selection icon is enabled
      if (!activeSelectionIconOnTextfields) {
        return {
          shouldShow: false,
          reason: 'text-field-feature-disabled',
          details: {
            fieldType: detection.fieldType,
            elementTag: context.element?.tagName,
            note: 'Selection icon disabled for text fields'
          },
          detection: detection
        };
      }

      // 4. Handle text field specific strategies
      const needsDoubleClick = detection.selectionStrategy === 'double-click-required';
      if (needsDoubleClick && !context.isFromDoubleClick) {
        return {
          shouldShow: false,
          reason: 'double-click-required',
          details: {
            fieldType: detection.fieldType,
            selectionStrategy: detection.selectionStrategy,
            isFromDoubleClick: context.isFromDoubleClick
          },
          detection: detection
        };
      }

      // 5. Allow the selection for text fields
      return {
        shouldShow: true,
        reason: 'text-field-allowed',
        details: {
          fieldType: detection.fieldType,
          selectionStrategy: detection.selectionStrategy,
          isFromDoubleClick: context.isFromDoubleClick,
          note: 'Selection icon enabled for text fields'
        },
        detection: detection
      };

    } catch (error) {
      logger.warn('Error in selection decision making:', error);

      // Default to showing icon if detection fails
      return {
        shouldShow: true,
        reason: 'detection-failed-fallback',
        details: {
          error: error.message,
          note: 'Defaulting to show icon due to detection error'
        },
        detection: null
      };
    }
  }

  /**
   * Enhanced element detection that properly handles form fields
   * @param {Selection} selection - The current selection
   * @returns {Element} The most appropriate context element
   */
  static getSelectionContextElement(selection) {
    if (!selection || !selection.rangeCount) return null;

    let originalContainer = document.body;

    try {
      const range = selection.getRangeAt(0);
      let container = range.commonAncestorContainer;

      // If the container is a text node, get its parent element
      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
      }

      // Store the original container for fallback
      originalContainer = container || document.body;

      // Check if the selection is within a form field by traversing up
      let currentElement = container;
      while (currentElement && currentElement !== document.body) {
        // Check for textarea elements
        if (currentElement.tagName === 'TEXTAREA') {
          logger.debug('Found textarea context element:', currentElement);
          return currentElement;
        }

        // Check for input elements (including non-processable ones)
        if (currentElement.tagName === 'INPUT') {
          logger.debug('Found input context element:', currentElement);
          return currentElement;
        }

        // Check for contenteditable elements
        if (currentElement.isContentEditable ||
            currentElement.contentEditable === 'true' ||
            currentElement.hasAttribute('contenteditable')) {
          logger.debug('Found contenteditable context element:', currentElement);
          return currentElement;
        }

        // Check if within a contenteditable container
        if (currentElement.closest && currentElement.closest('[contenteditable="true"]')) {
          const editableContainer = currentElement.closest('[contenteditable="true"]');
          logger.debug('Found parent contenteditable context element:', editableContainer);
          return editableContainer;
        }

        currentElement = currentElement.parentElement;
      }

      // More aggressive detection: Check if selection is inside a form field
      // Method 1: Check if any input is currently focused
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        logger.debug('Found active form field:', activeElement.tagName);
        return activeElement;
      }

      // Method 2: Check anchor and focus nodes directly
      const checkNodeInFormFields = (node) => {
        if (!node) return null;

        // For text nodes, get the parent
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (!element) return null;

        // Traverse up to find form fields
        let current = element;
        while (current && current !== document.body) {
          if (current.tagName === 'TEXTAREA' || current.tagName === 'INPUT') {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      };

      // Debug: Log selection details
      logger.debug('Selection details:', {
        anchorNode: selection.anchorNode,
        anchorNodeType: selection.anchorNode?.nodeType,
        anchorParent: selection.anchorNode?.parentElement,
        focusNode: selection.focusNode,
        focusNodeType: selection.focusNode?.nodeType,
        focusParent: selection.focusNode?.parentElement,
        activeElement: activeElement
      });

      // Check both anchor and focus nodes
      const fieldFromAnchor = checkNodeInFormFields(selection.anchorNode);
      const fieldFromFocus = checkNodeInFormFields(selection.focusNode);

      if (fieldFromAnchor || fieldFromFocus) {
        const foundField = fieldFromAnchor || fieldFromFocus;
        logger.debug('Found form field through anchor/focus check:', foundField.tagName);
        return foundField;
      }

      // Method 2: If above fails, try the nodes approach
      if (selection.anchorNode && selection.focusNode) {
        // Get all nodes in the selection
        const nodes = this._getSelectedNodes(selection);

        for (const node of nodes) {
          // For text nodes, check parent
          const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

          if (element) {
            let testElement = element;
            while (testElement && testElement !== document.body) {
              if (testElement.tagName === 'TEXTAREA' ||
                  testElement.tagName === 'INPUT') {
                return testElement;
              }
              testElement = testElement.parentElement;
            }
          }
        }
      }

      // Only log if returning original container (for debugging)
      if (originalContainer && originalContainer.tagName !== 'INPUT' && originalContainer.tagName !== 'TEXTAREA') {
        logger.debug('No form field found in selection, returning container:', {
          tagName: originalContainer.tagName,
          className: originalContainer.className
        });
      }
      return originalContainer;
    } catch (error) {
      logger.debug('Error getting selection context element:', error);
      return originalContainer || null;
    }
  }

  /**
   * Get all nodes within a selection
   * @param {Selection} selection - The selection
   * @returns {Array} Array of nodes in the selection
   */
  static _getSelectedNodes(selection) {
    if (!selection || !selection.rangeCount) return [];

    const range = selection.getRangeAt(0);
    const nodes = [];

    // Get all nodes in the selection using a simpler approach
    // Check if the anchor and focus are in different containers
    if (selection.anchorNode !== selection.focusNode) {
      // Multi-container selection - get nodes from start to end
      const startNode = selection.anchorNode;
      const endNode = selection.focusNode;

      // Add both anchor and focus nodes
      if (startNode) nodes.push(startNode);
      if (endNode && endNode !== startNode) nodes.push(endNode);

      // Also add their parent elements if they are text nodes
      if (startNode.nodeType === Node.TEXT_NODE && startNode.parentElement) {
        nodes.push(startNode.parentElement);
      }
      if (endNode && endNode.nodeType === Node.TEXT_NODE && endNode.parentElement) {
        nodes.push(endNode.parentElement);
      }
    } else {
      // Single container selection
      if (selection.anchorNode) {
        nodes.push(selection.anchorNode);
        if (selection.anchorNode.nodeType === Node.TEXT_NODE && selection.anchorNode.parentElement) {
          nodes.push(selection.anchorNode.parentElement);
        }
      }
    }

    // Add the common ancestor container
    if (range.commonAncestorContainer) {
      nodes.push(range.commonAncestorContainer);
    }

    // Remove duplicates and return unique nodes
    return [...new Set(nodes)];
  }

  /**
   * Fallback field detection when fieldDetector is not available
   * @param {Element} element - Element to detect
   * @returns {Object} Detection result
   */
  static async _fallbackFieldDetection(element) {
    if (!element) {
      return {
        fieldType: FieldTypes.UNKNOWN,
        selectionStrategy: 'any-selection',
        selectionEventStrategy: 'selection-based',
        shouldShowSelectionIcon: true,
        shouldShowTextFieldIcon: false
      };
    }

    const tagName = element.tagName?.toLowerCase() || '';

    // Check for textarea elements
    if (tagName === 'textarea') {
      return {
        fieldType: FieldTypes.CONTENT_EDITABLE,
        selectionStrategy: 'double-click-required',
        selectionEventStrategy: 'mouse-based',
        shouldShowSelectionIcon: true,
        shouldShowTextFieldIcon: true
      };
    }

    // Check for input elements
    if (tagName === 'input') {
      const inputType = (element.type || '').toLowerCase();

      // Only allow text-based inputs
      if (!inputType || inputType === 'text' || inputType === 'search') {
        // Check for authentication fields
        const name = (element.name || '').toLowerCase();
        const placeholder = (element.placeholder || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const autocomplete = (element.autocomplete || '').toLowerCase();

        const authKeywords = ['password', 'email', 'username', 'login', 'signin', 'auth'];
        const hasAuthKeyword = authKeywords.some(keyword =>
          name.includes(keyword) ||
          placeholder.includes(keyword) ||
          id.includes(keyword) ||
          autocomplete.includes(keyword)
        );

        if (hasAuthKeyword) {
          return {
            fieldType: FieldTypes.NON_PROCESSABLE,
            selectionStrategy: 'any-selection',
            selectionEventStrategy: 'selection-based',
            shouldShowSelectionIcon: false,
            shouldShowTextFieldIcon: false
          };
        }

        return {
          fieldType: FieldTypes.REGULAR_INPUT,
          selectionStrategy: 'any-selection',
          selectionEventStrategy: 'selection-based',
          shouldShowSelectionIcon: false,
          shouldShowTextFieldIcon: true
        };
      }

      // Non-text input fields
      return {
        fieldType: FieldTypes.NON_PROCESSABLE,
        selectionStrategy: 'any-selection',
        selectionEventStrategy: 'selection-based',
        shouldShowSelectionIcon: false,
        shouldShowTextFieldIcon: false
      };
    }

    // Check for contenteditable elements
    if (element.isContentEditable ||
        element.contentEditable === 'true' ||
        element.hasAttribute('contenteditable')) {
      return {
        fieldType: FieldTypes.CONTENT_EDITABLE,
        selectionStrategy: 'double-click-required',
        selectionEventStrategy: 'mouse-based',
        shouldShowSelectionIcon: true,
        shouldShowTextFieldIcon: true
      };
    }

    // Default to regular content
    return {
      fieldType: FieldTypes.UNKNOWN,
      selectionStrategy: 'any-selection',
      selectionEventStrategy: 'selection-based',
      shouldShowSelectionIcon: true,
      shouldShowTextFieldIcon: false
    };
  }
}