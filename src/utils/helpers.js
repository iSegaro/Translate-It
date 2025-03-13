// src/utils/helpers.js

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isEditable = (element) => {
  return (
    element?.isContentEditable ||
    ["INPUT", "TEXTAREA"].includes(element?.tagName)
  );
};

export const setCursorToEnd = (element) => {
  if (!element || !document.body.contains(element)) {
    console.warn("Element not found in DOM");
    return;
  }

  // Focus the element first
  element.focus();

  // Handle different element types
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    // For input/textarea elements
    element.selectionStart = element.value.length;
    element.selectionEnd = element.value.length;
  } else if (element.isContentEditable) {
    // For contenteditable elements
    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(element);
    range.collapse(false); // Collapse to end

    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    console.warn("Unsupported element type for cursor positioning");
  }

  // Optional: Scroll to cursor position
  element.scrollTop = element.scrollHeight;
};

export const setCursorPosition = (element, position = "end", offset = 0) => {
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
};

export const fadeOut = (element) => {
  element.style.transition = "opacity 0.5s";
  element.style.opacity = "0";
  setTimeout(() => element.remove(), 500);
};

export const isExtensionContextValid = () => {
  try {
    return !!chrome?.runtime?.id && !!chrome?.storage?.sync;
  } catch (e) {
    return false;
  }
};

export const openOptionsPage = () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
};

export const showStatus = (() => {
  let currentNotification = null;

  return (message, type, duration = 2000) => {
    if (currentNotification) {
      currentNotification.remove();
    }

    const notification = document.createElement("div");
    notification.className = `status-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);
    currentNotification = notification;

    setTimeout(() => {
      notification.remove();
      currentNotification = null;
    }, duration);
  };
})();
