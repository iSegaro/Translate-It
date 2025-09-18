// src/utils/simulate_events.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";

export const setCursorToEnd = (element) => {
  try {
    if (!element?.isConnected) {
      return;
    }

    element.focus();

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.selectionStart = element.selectionEnd = element.value.length;
    } else if (element.isContentEditable && typeof window !== 'undefined') {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false); // Collapse to end
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // Optional: Scroll to cursor position
    element.scrollTop = element.scrollHeight;
  } catch (error) {
    const handlerError = new ErrorHandler();
    throw handlerError.handle(error, {
      type: ErrorTypes.UI,
      context: "helpers-setCursorToEnd",
    });
  }
};

export const setCursorPosition = (element, position = "end", offset = 0) => {
  try {
    if (!element || !document.body.contains(element)) return;

    element.focus();

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const pos = position === "start" ? 0 : element.value.length;
      element.setSelectionRange(pos + offset, pos + offset);
    } else if (element.isContentEditable && typeof window !== 'undefined') {
      const range = document.createRange();
      const selection = window.getSelection();
      const childNodes = element.childNodes;

      if (position === "start") {
        range.setStart(childNodes[0] || element, 0);
      } else {
        range.setStart(
          childNodes[childNodes.length - 1] || element,
          element.textContent?.length || 0,
        );
      }

      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    element.scrollTop = element.scrollHeight;
  } catch (error) {
    const handlerError = new ErrorHandler();
    throw handlerError.handle(error, {
      type: ErrorTypes.UI,
      context: "helpers-setCursorPosition",
      element: element?.tagName,
    });
  }
};

/**
 * Get event path with fallback for older browsers
 * Used for detecting if click is inside specific elements
 * @param {Event} event - DOM event
 * @returns {Array} Event path array
 */
export const getEventPath = (event) => {
  try {
    // Modern browsers support composedPath()
    let path = event.composedPath ? event.composedPath() : [];
    
    if (!path || path.length === 0) {
      // Fallback for older browsers - manually construct path
      let node = event.target;
      path = [];
      while (node) {
        path.push(node);
        node = node.parentNode;
      }
    }
    
    return path;
  } catch {
    // If all fails, return array with just the target
    return event.target ? [event.target] : [];
  }
};

/**
 * Get selected text with dash separator for multiple ranges
 * Utility for handling complex text selections
 * @returns {string} Selected text with proper formatting
 */
export const getSelectedTextWithDash = () => {
  try {
    if (typeof window === 'undefined') {
      return "";
    }

    const selection = window.getSelection();
    let selectedText = "";

    if (selection.rangeCount > 1) {
      // Handle multiple selection ranges
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        selectedText += range.toString().trim();
        if (i < selection.rangeCount - 1) {
          selectedText += " - \\n";
        }
      }
    } else {
      // Single selection range
      selectedText = selection.toString().trim();
    }

    return selectedText.trim();
  } catch {
    // Fallback to empty string if selection fails
    return "";
  }
};

/**
 * Check if mouse event includes Ctrl or Meta key
 * @param {MouseEvent} event - Mouse event
 * @returns {boolean} Whether Ctrl/Meta key was pressed
 */
export const isCtrlClick = (event) => {
  return event.ctrlKey || event.metaKey;
};

/**
 * Detect if a mousedown event is likely the start of a text drag operation
 * This helps prevent dismissing translation windows when users try to drag selected text
 * @param {MouseEvent} event - Mousedown event
 * @returns {boolean} True if this appears to be a text drag operation
 */
export const isTextDragOperation = (event) => {
  try {
    // Get the current selection
    const selection = window.getSelection();

    // Check if there's any selected text
    if (!selection || selection.toString().trim().length === 0) {
      return false;
    }

    // Check if the mousedown is within the selected text range
    const range = selection.getRangeAt(0);
    if (!range) {
      return false;
    }

    // Get the mousedown coordinates
    const x = event.clientX;
    const y = event.clientY;

    // Check if the click is within the bounding rectangle of the selection
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        // Mousedown is within selected text - likely a drag operation
        return true;
      }
    }

    // Also check if the target is within the selection using node containment
    let node = event.target;
    while (node && node !== range.commonAncestorContainer) {
      if (range.intersectsNode(node)) {
        return true;
      }
      node = node.parentNode;
    }

    return false;
  } catch (error) {
    // If anything fails, assume it's not a drag operation
    return false;
  }
};
