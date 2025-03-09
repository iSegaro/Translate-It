// src/core/EventRouter.js
import { CONFIG, state } from "../config.js";
import { isEditable } from "../utils/helpers.js";

export function setupEventListeners(translationHandler) {
  const handleFocus = (e) => {
    if (isEditable(e.target)) {
      translationHandler.handleEditableFocus(e.target);
    }
  };

  const handleBlur = (e) => {
    if (isEditable(e.target)) {
      translationHandler.handleEditableBlur(e.target);
    }
  };

  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);

  document.addEventListener("selectionchange", (e) =>
    translationHandler.handleEvent(e)
  );

  document.addEventListener("click", (e) => {
    if (state.selectionActive) {
      // غیرفعال کردن حالت پس از کلیک موفق
      translationHandler.elementManager.cleanup();
      state.selectionActive = false;

      // آپدیت storage
      chrome.storage.local.set({ selectionActive: false });

      // تاخیر برای اجازه دادن برای به روزرسانی DOM
      setTimeout(() => {
        translationHandler.handleSelectionClick(e);
      }, 100);
    }
  });

  document.addEventListener("keydown", (e) =>
    translationHandler.handleEvent(e)
  );

  document.addEventListener("mouseover", (e) => {
    if (!state.selectionActive) return;
    translationHandler.elementManager.cleanup();

    if (e.target?.innerText?.trim()) {
      state.highlightedElement = e.target;
      e.target.style.outline = CONFIG.HIGHLIGHT_STYLE;
    }
  });
}

export function teardownEventListeners() {
  document.removeEventListener("focus", handleFocus, true);
  document.removeEventListener("blur", handleBlur, true);
  document.removeEventListener("selectionchange", handleSelectionChange);
  document.removeEventListener("click", handleClick);
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mouseover", handleMouseOver);
}
