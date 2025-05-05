// src/utils/simulate_events.js

import { ErrorTypes } from "../services/ErrorTypes";
import { ErrorHandler } from "../services/ErrorService.js";

export const setCursorToEnd = (element) => {
  try {
    if (!element?.isConnected) {
      return;
    }

    element.focus();

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.selectionStart = element.selectionEnd = element.value.length;
    } else if (element.isContentEditable) {
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
    } else if (element.isContentEditable) {
      const range = document.createRange();
      const selection = window.getSelection();
      const childNodes = element.childNodes;

      if (position === "start") {
        range.setStart(childNodes[0] || element, 0);
      } else {
        range.setStart(
          childNodes[childNodes.length - 1] || element,
          element.textContent?.length || 0
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
