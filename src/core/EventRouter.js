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

    // فقط اگر المنت دارای متنی معتبر باشد
    if (!e.target?.innerText?.trim()) return;

    // اگر المنت جدید متفاوت از المنت highlight‌شده قبلی است، تغییرات اعمال شود
    if (state.highlightedElement !== e.target) {
      // پاک کردن استایل‌های المنت قبلی (در صورت وجود)
      if (state.highlightedElement) {
        state.highlightedElement.style.outline = "";
        state.highlightedElement.style.opacity = "";
      }

      // اعمال استایل highlight به المنت جدید
      state.highlightedElement = e.target;
      e.target.style.outline = CONFIG.HIGHLIGHT_STYLE;
      e.target.style.opacity = "0.9";
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
