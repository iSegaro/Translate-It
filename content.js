// content.js

/** USE_MOCK
 * Flag to control translation mode.
 *
 * When set to true, the extension uses mock translations instead of sending
 * requests to the Google API. This is useful for development and testing.
 *
 * در محیط توسعه و دیباگ، با تنظیم به true از ترجمه فرضی استفاده می‌شود و درخواست‌ها به API گوگل ارسال نمی‌شوند.
 */
// CONFIG.USE_MOCK = true;

// Regex patterns to detect Persian characters and RTL content
const PERSIAN_REGEX =
  /^(?=.*[\u0600-\u06FF])[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\u0041-\u005A\u0061-\u007A\u0030-\u0039\s.,:;؟!()«»@#\n\t\u200C]+$/;
const RTL_REGEX = /[\u0600-\u06FF]/;

// State management for selection and translation icon
const state = {
  selectionActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
};

// Debounce function to limit the rate of function calls
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Cleanup function to reset state and remove highlights/icons
function cleanup() {
  if (state.highlightedElement) {
    if (state.highlightedElement._observer) {
      state.highlightedElement._observer.disconnect();
    }
    state.highlightedElement.style.outline = "";
    state.highlightedElement.style.opacity = "1";
  }
  state.activeTranslateIcon?.remove();
  state.highlightedElement = null;
  state.activeTranslateIcon = null;
  // Remove all remaining icons
  document.querySelectorAll(".translation-icon-extension").forEach((icon) => {
    icon.remove();
  });
}

// Helper to introduce a delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Add this new function to handle external clicks on createTranslateIcon
function setupGlobalClickHandler() {
  const handleDocumentClick = (event) => {
    if (
      state.activeTranslateIcon &&
      !event.composedPath().includes(state.activeTranslateIcon) &&
      !event.target.isContentEditable &&
      event.target.tagName !== "INPUT" &&
      event.target.tagName !== "TEXTAREA"
    ) {
      cleanup();
    }
  };

  document.addEventListener("click", handleDocumentClick, { capture: true });
}
setupGlobalClickHandler();

/* ===================== Notification Functions ====================== */

/**
 * Create a container for notifications if one doesn't already exist.
 */
function getNotificationContainer() {
  let container = document.getElementById("translation-notifications");
  if (!container) {
    container = document.createElement("div");
    container.id = "translation-notifications";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "10000000000",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    });
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Fade-out effect for notification dismissal
 */
function fadeOut(element, callback) {
  element.style.transition = "opacity 0.5s";
  element.style.opacity = "0";
  setTimeout(() => {
    if (element.parentNode) element.remove();
    if (callback) callback();
  }, 500);
}

/**
 * Displays a notification with the given text, type, and autoDismiss settings.
 * type can be "status" (translating), "error", or "success".
 * If autoDismiss=true, the notification will fade out after the specified time (in milliseconds).
 */
function showNotification(message, type, autoDismiss = false, duration = 3000) {
  const container = getNotificationContainer();
  const notification = document.createElement("div");
  let icon = "";
  if (type === "error") icon = CONFIG.ICON_ERROR;
  else if (type === "success") icon = CONFIG.ICON_SECCESS;
  else if (type === "status") icon = CONFIG.ICON_STATUS;

  Object.assign(notification.style, {
    background:
      type === "error"
        ? "rgba(255,0,0,0.8)"
        : type === "success"
        ? "rgba(0,128,0,0.8)"
        : "rgba(0,0,0,0.7)",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "4px",
    fontSize: "14px",
    cursor: "pointer",
    opacity: "1",
  });
  notification.innerText = icon + message;

  // Fade out on notification click
  notification.addEventListener("click", () => {
    fadeOut(notification);
  });

  container.appendChild(notification);

  if (autoDismiss) {
    setTimeout(() => {
      if (notification.parentNode) {
        fadeOut(notification);
      }
    }, duration);
  }
  return notification;
}

/* =================================================================== */

// Observe changes to an element and update its text if needed
function observeChanges(element, translatedText) {
  // Disconnect existing observer if any
  if (element._observer) {
    element._observer.disconnect();
  }
  const observer = new MutationObserver(() => {
    if (element.innerText !== translatedText) {
      element.innerText = translatedText;
    }
  });
  observer.observe(element, { childList: true, subtree: true });
  element._observer = observer;
}

// ==============================
// Helper functions for DataTransfer-based text insertion
// ==============================

// Clear content of an editable field
function clearEditableField(field) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(field);
  selection.removeAllRanges();
  selection.addRange(range);

  const dt = new DataTransfer();
  dt.setData("text/plain", "");
  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });
  field.dispatchEvent(pasteEvent);
}

// Paste text into an editable field, converting line breaks to <br> tags
function pasteTextToEditableField(field, text) {
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  // Convert line breaks to <br> for preserving structure
  dt.setData("text/html", text.replace(/\n/g, "<br>"));
  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });
  field.dispatchEvent(pasteEvent);
}

// Set cursor to the end of the content in the field
function setCursorToEnd(field) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Persian
 * به‌روزرسانی فیلدهای ویرایش‌پذیر با متن ترجمه‌شده.
 * این تابع برای جایگزینی متن در المان‌های input و contentEditable استفاده می‌شود.
 * تاخیرهای موجود در تابع بسیار مهم هستند و نباید حذف یا تغییر داده شوند.
 * این تاخیرها به مرورگر کمک می‌کنند تا عملیات قبلی (مانند focus و select) را کامل کند.
 * حذف یا جابجایی این تاخیرها ممکن است باعث اختلال در کارکرد صحیح تابع شود.
 */

/** ENGLISH
 * Updates editable fields (input or contentEditable) with the translated text.
 *
 * Critical Note: Delays in this function are necessary to allow the browser
 * to properly complete prior operations (like focus and selection) before pasting text.
 * This is crucial for platforms like WhatsApp that rely on internal state management.
 *
 * Why delays matter:
 * 1. Ensures focus and selection actions complete before pasting.
 * 2. Prevents paste events from firing prematurely.
 * 3. Supports internal state updates on platforms like WhatsApp.
 *
 * Removing or altering these delays may cause:
 * - Text to fail when pasting.
 * - Focus to be lost.
 * - Internal state issues on platforms like WhatsApp.
 */
async function updateEditableField(element, translatedText) {
  // Special handling for chat.openai field
  if (element.id === "prompt-textarea") {
    // Replace newline characters with <br> tags
    element.innerHTML = translatedText.replace(/\n/g, "<br>");
    element.setAttribute("dir", RTL_REGEX.test(translatedText) ? "rtl" : "ltr");
    setCursorToEnd(element);
    return;
  }

  // Handle Telegram message field by directly replacing innerHTML
  if (element.id === "editable-message-text") {
    element.innerHTML = translatedText.replace(/\n/g, "<br>");
    element.setAttribute("dir", RTL_REGEX.test(translatedText) ? "rtl" : "ltr");
    setCursorToEnd(element);
    return;
  }

  const isWhatsApp = element.closest('[aria-label="Type a message"]');

  if (isWhatsApp) {
    // Focus and select all content
    element.focus({ preventScroll: true });
    await delay(100);
    document.execCommand("selectAll");
    await delay(100);

    // Prepare paste event with translated text while preserving newlines
    // Use DataTransfer method to update WhatsApp field
    const dt = new DataTransfer();
    dt.setData("text/plain", translatedText);
    dt.setData("text/html", translatedText.replace(/\n/g, "<br>"));
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      clipboardData: dt,
      cancelable: true,
    });

    // Trigger paste event
    element.dispatchEvent(pasteEvent);

    // Ensure React state updates
    await delay(50);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  } else {
    // Handle other editable fields
    clearEditableField(element);
    await delay(50);
    pasteTextToEditableField(element, translatedText);
  }

  // Move cursor to the end after updating content
  setCursorToEnd(element);
}

// ==============================
// Translation functionality
// ==============================

// Translate the given text using mock or API call
async function translateText(text) {
  if (!text || text.length < 2) return text;

  if (CONFIG.USE_MOCK) {
    const isPersian = PERSIAN_REGEX.test(text);

    // 1. Check for explicit newline characters:
    const hasExplicitNewline = /[\r\n]+/.test(text);

    // 2. Check for HTML line breaks (<br> or <p>):
    const hasHtmlNewline = /<br\s*\/?>|<p\s*\/?>/i.test(text);

    // 3. Check for multiple spaces that might indicate a soft return (especially in contenteditable):
    const hasSoftReturn = /\s{2,}/.test(text);

    // 4. Check for newline characters after normalizing the text
    const normalizedText = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&nbsp;/gi, " ");
    const hasNormalizedNewline = /[\r\n]+/.test(normalizedText);

    const hasNewLine =
      hasExplicitNewline ||
      hasHtmlNewline ||
      hasSoftReturn ||
      hasNormalizedNewline;

    const prompt = isPersian
      ? hasNewLine
        ? CONFIG.DEBUG_TRANSLATED_ENGLISH_With_NewLine
        : CONFIG.DEBUG_TRANSLATED_ENGLISH
      : hasNewLine
      ? CONFIG.DEBUG_TRANSLATED_PERSIAN_With_NewLine
      : CONFIG.DEBUG_TRANSLATED_PERSIAN;

    return `${prompt} [${text}]`;
  }

  const isPersian = PERSIAN_REGEX.test(text);
  const prompt = isPersian ? CONFIG.PROMPT_ENGLISH : CONFIG.PROMPT_PERSIAN;
  try {
    // Dynamically retrieving the API_KEY from chrome.storage
    const apiKey = await getApiKeyAsync();
    const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + text }] }],
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Translation API error: ${
          errorData.error?.message || response.statusText
        }`
      );
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  } catch (error) {
    console.error("Translation failed:", error);
    throw error;
  }
}

// ==============================
// Update element with translated text
// ==============================

async function updateElementWithTranslation(element, translatedText) {
  element.style.opacity = "0.5";
  try {
    translatedText = translatedText.trim();
    const isRtl = RTL_REGEX.test(translatedText);
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = translatedText;
      element.setAttribute("dir", isRtl ? "rtl" : "ltr");
      // Dispatch input and change events
      ["input", "change"].forEach((eventType) => {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
    } else if (element.isContentEditable) {
      await updateEditableField(element, translatedText);
    } else {
      element.innerText = translatedText;
      element.setAttribute("dir", isRtl ? "rtl" : "ltr");
      element.style.textAlign = isRtl ? "right" : "left";
      observeChanges(element, translatedText);
    }
  } finally {
    element.style.opacity = "1";
    cleanup();
  }
}

// ==============================
// Create translate icon and position it relative to the target element
// ==============================
function createTranslateIcon(target) {
  const translateIcon = document.createElement("button");
  translateIcon.classList.add("translate-icon"); // Add a specific class to avoid document click conflicts (on chat.openai.com)
  Object.assign(translateIcon.style, {
    position: "absolute",
    background: "white",
    border: "1px solid gray",
    borderRadius: "4px",
    padding: "2px 5px",
    fontSize: "12px",
    cursor: "pointer",
    zIndex: "9999999999",
    pointerEvents: "auto",
  });
  translateIcon.innerText = CONFIG.ICON_TRANSLATION;
  translateIcon.title = CONFIG.TRANSLATION_ICON_TITLE;

  // Use getBoundingClientRect with scroll adjustments
  const rect = target.getBoundingClientRect();
  translateIcon.style.top = `${rect.top + window.scrollY - 5}px`;
  translateIcon.style.left = `${rect.left + window.scrollX + rect.width + 5}px`;

  // Add pointer-events property
  translateIcon.style.pointerEvents = "auto";
  // Add a specific class for identification
  translateIcon.classList.add("translation-icon-extension");

  return translateIcon;
}

// ==============================
// Helper Functions for Unified Translation Trigger
// ==============================
function extractText(target) {
  let text;
  // Special handling for chat.openai's multiline editor
  const promptContainer = target.closest("#prompt-textarea");
  if (promptContainer) {
    text = Array.from(promptContainer.querySelectorAll("p"))
      .map((p) => p.textContent.trim())
      .join("\n")
      .trim();
    return text;
  }

  const isDraftJs = target.closest(".DraftEditor-root") !== null;
  const isWhatsApp = target.closest(".selectable-text.copyable-text") !== null;
  if (isDraftJs) {
    const tweetTextarea = target.closest('[data-testid="tweetTextarea_0"]');
    if (tweetTextarea) {
      const textElements = tweetTextarea.querySelectorAll('[data-text="true"]');
      text = Array.from(textElements)
        .map((el) => el.textContent)
        .join(" ")
        .trim();
    }
  } else if (isWhatsApp) {
    let container = target.closest(".lexical-rich-text-input");
    if (container) {
      text = "";
      const paragraphs = container.querySelectorAll("p.selectable-text");
      paragraphs.forEach((p) => {
        const spans = p.querySelectorAll('span[data-lexical-text="true"]');
        spans.forEach((span) => {
          text += span.textContent.trim() + "\n";
        });
      });
      text = text.trim();
    } else {
      let fallbackContainer = target.closest('[contenteditable="true"]');
      if (fallbackContainer) {
        const spanElement = fallbackContainer.querySelector(
          'span[data-lexical-text="true"]'
        );
        if (spanElement) {
          text = spanElement.textContent.trim();
        }
      }
    }
  } else {
    text = target.value || target.innerText.trim();
  }
  return text;
}

// ==============================
// Event Handlers: Unified for Click and Keydown
// ==============================
async function handleTranslateEvent(event) {
  // لغو انتخاب در صورت فشردن کلید Escape
  if (event.type === "keydown" && event.key === "Escape") {
    event.stopPropagation();
    state.selectionActive = false;
    cleanup();
    return;
  }

  // Prevent processing of clicks on the translation icon
  // if (event.type === "click" && event.target.closest(".translate-icon")) {
  //   return;
  // }

  let textToTranslate = "";

  // Support for Ctrl+/ key combination
  if (event.type === "keydown" && event.ctrlKey && event.key === "/") {
    event.stopPropagation();
    const selection = window.getSelection();

    if (selection && !selection.isCollapsed) {
      textToTranslate = selection.toString().trim();
    } else {
      const target = document.activeElement;
      if (target) {
        const isDraftJs = target.closest(".DraftEditor-root") !== null;
        const isWhatsApp =
          target.closest(".selectable-text.copyable-text") !== null;

        if (isDraftJs) {
          const tweetTextarea = target.closest(
            '[data-testid="tweetTextarea_0"]'
          );
          if (tweetTextarea) {
            const textElements =
              tweetTextarea.querySelectorAll('[data-text="true"]');
            textToTranslate = Array.from(textElements)
              .map((el) => el.textContent)
              .join(" ")
              .trim();
          }
        } else if (isWhatsApp) {
          const container = target.closest(".lexical-rich-text-input");
          if (container) {
            const paragraphs = container.querySelectorAll("p.selectable-text");
            paragraphs.forEach((p) => {
              const spans = p.querySelectorAll(
                'span[data-lexical-text="true"]'
              );
              spans.forEach((span) => {
                const text = span.textContent.trim();
                if (text) {
                  textToTranslate += text;
                }
              });
              textToTranslate += "\n";
            });
            textToTranslate = textToTranslate.trim();
          }
        } else if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA"
        ) {
          textToTranslate = target.value.trim();
        } else if (target.isContentEditable) {
          textToTranslate = target.innerText.trim();
        }
      }
    }

    if (textToTranslate) {
      const statusNotification = showNotification("در حال ترجمه...", "status");
      try {
        const translatedText = await translateText(textToTranslate);
        if (translatedText) {
          if (selection && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(translatedText));
          } else {
            const target = document.activeElement;
            if (target) {
              if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
                target.value = translatedText;
              } else if (target.isContentEditable) {
                await updateEditableField(target, translatedText);
              }
            }
          }
        }
      } catch (error) {
        console.error("Translation failed:", error);
        showNotification(
          "ترجمه با خطا مواجه شد: " + error.message,
          "error",
          true,
          3000
        );
      } finally {
        if (statusNotification && statusNotification.parentNode) {
          fadeOut(statusNotification);
        }
      }
    }
    return;
  }

  // Check for user text selection while holding Ctrl key
  const selection = window.getSelection();
  if (
    event.ctrlKey &&
    event.type == "mouseup" &&
    selection &&
    !selection.isCollapsed
  ) {
    const selectedText = selection.toString().trim();
    if (selectedText) {
      const statusNotification = showNotification("در حال ترجمه...", "status");
      try {
        const translatedText = await translateText(selectedText);
        if (translatedText) {
          const range = selection.getRangeAt(0);
          // If the selected object is a text node, replace it
          if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
            range.deleteContents();
            range.insertNode(document.createTextNode(translatedText));
          } else {
            showNotification(
              "شی انتخاب شده متنی نیست؛ جایگزینی انجام نمی‌شود.",
              "error",
              true,
              3000
            );
          }
        }
      } catch (error) {
        console.error("Translation failed:", error);
        showNotification(
          "ترجمه با خطا مواجه شد: " + error.message,
          "error",
          true,
          3000
        );
      } finally {
        if (statusNotification && statusNotification.parentNode) {
          fadeOut(statusNotification);
        }
      }
      return;
    }
  }

  // If selection mode is active (e.g., by clicking the icon in selection mode)
  if (state.selectionActive) {
    if (event.type === "keydown") {
      return;
    }
    event.stopPropagation();
    state.selectionActive = false;
    if (!state.highlightedElement) return;
    state.highlightedElement.style.outline = CONFIG.HIGHTLIH_NEW_ELEMETN_RED;
    const textToTranslate = state.highlightedElement.innerText.trim();
    if (!textToTranslate) return;
    const statusNotification = showNotification("در حال ترجمه...", "status");
    try {
      const translatedText = await translateText(textToTranslate);
      if (translatedText) {
        await updateElementWithTranslation(
          state.highlightedElement,
          translatedText
        );
      }
    } catch (error) {
      console.error("Translation failed:", error);
      showNotification(
        "ترجمه با خطا مواجه شد: " + error.message,
        "error",
        true,
        3000
      );
    } finally {
      if (statusNotification && statusNotification.parentNode) {
        fadeOut(statusNotification);
      }
    }
    return;
  }

  // Further, examine and manage events related to editable elements
  const target = event.target;
  const isDraftJs = target.closest(".DraftEditor-root") !== null;
  const isWhatsApp = target.closest(".selectable-text.copyable-text") !== null;
  if (
    isDraftJs ||
    isWhatsApp ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    // Add this condition to prevent multiple creations
    if (state.activeTranslateIcon) return;

    cleanup();

    const currentTarget = target;

    const translateIcon = createTranslateIcon(currentTarget);

    Object.assign(translateIcon.style, {
      transform: "translateZ(100px)", // Solve overlay issue on some websites
      willChange: "transform", // Optimize rendering
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)", // Increase visibility
    });

    // Solve event delegation issue using Shadow DOM
    const iconContainer = document.createElement("div");
    iconContainer.attachShadow({ mode: "open" });
    iconContainer.shadowRoot.appendChild(translateIcon);
    document.body.appendChild(iconContainer);

    state.activeTranslateIcon = iconContainer;

    const iconClickHandler = async (event) => {
      // Completely prevent event propagation
      event.stopPropagation();
      event.preventDefault();

      // Remove icon with delay
      setTimeout(() => iconContainer.remove(), 50);

      try {
        const text = extractText(currentTarget);
        if (!text) return;

        const notification = showNotification("در حال ترجمه...", "status");
        const translated = await translateText(text);

        // Apply changes by checking element existence
        if (document.body.contains(currentTarget)) {
          if (currentTarget.isContentEditable) {
            currentTarget.innerHTML = "";
            await delay(10);
            await updateEditableField(currentTarget, translated);
          } else {
            currentTarget.value = translated;

            // Add this line for specific fields like React
            currentTarget.dispatchEvent(new Event("change", { bubbles: true }));
          }

          currentTarget.style.direction = RTL_REGEX.test(translated)
            ? "rtl"
            : "ltr";
        }

        fadeOut(notification);
      } catch (error) {
        console.error("خطای ترجمه:", error);
        showNotification(`خطا: ${error.message}`, "error", true);
      }
    };

    translateIcon.addEventListener("mousedown", (e) => e.stopPropagation());
    translateIcon.addEventListener("touchstart", (e) => e.stopPropagation());
    translateIcon.addEventListener("click", iconClickHandler, {
      capture: true,
      passive: false,
    });
  }
}

// ------------------------------
// Global Event Listeners
// ------------------------------
document.addEventListener("mouseover", (event) => {
  if (!state.selectionActive) return;
  cleanup();
  state.highlightedElement = event.target;
  state.highlightedElement.style.outline = CONFIG.HIGHLIGHT_STYLE;
});

document.addEventListener("mouseup", handleTranslateEvent);
document.addEventListener("click", handleTranslateEvent);
document.addEventListener("keydown", handleTranslateEvent);

chrome.runtime.onMessage.addListener((message) => {
  document.body.focus();
  if (message.action === "enable_selection") {
    state.selectionActive = !state.selectionActive;
    if (!state.selectionActive) {
      cleanup();
    }
  }
});
