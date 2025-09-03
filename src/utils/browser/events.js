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
  return event.type === "mouseup" && (event.ctrlKey || event.metaKey);
};
