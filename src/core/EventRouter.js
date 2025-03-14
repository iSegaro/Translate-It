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
      // غیرفعال کردن حالت انتخاب پس از کلیک موفق
      translationHandler.elementManager.cleanup();
      state.selectionActive = false;

      // آپدیت storage
      chrome.storage.local.set({ selectionActive: false });

      // ارسال پیام به background برای به روز رسانی وضعیت تب جاری
      chrome.runtime.sendMessage({
        action: "UPDATE_SELECTION_STATE",
        data: false,
      });

      // تاخیر برای اجازه دادن به به‌روز شدن DOM
      setTimeout(() => {
        translationHandler.eventHandler.handleSelectionClick(e);
      }, 100);
    }
  });

  document.addEventListener("keydown", (e) => {
    console.log("keydown event detected. Key:", e.key);
    // بررسی کلید Escape برای خروج از حالت انتخاب
    if (e.key === "Escape" && state.selectionActive) {
      console.log("EventRouter: کلید ESC شناسایی شد.");
      translationHandler.elementManager.cleanup();
      state.selectionActive = false;
      chrome.storage.local.set({ selectionActive: false });

      // ارسال پیام به background برای به‌روز کردن وضعیت تب
      chrome.runtime.sendMessage({
        action: "UPDATE_SELECTION_STATE",
        data: false,
      });

      console.info("Selection mode deactivated via Esc key.");
      return; // جلوگیری از فراخوانی ادامه‌ی رویداد
    }
    translationHandler.handleEvent(e);
  });

  document.addEventListener("mouseover", (e) => {
    if (!state.selectionActive) return;

    // فقط اگر المنت دارای متنی معتبر باشد
    if (!e.target?.innerText?.trim()) return;

    // اگر المنت جدید متفاوت از المنت highlight‌شده قبلی است، تغییرات اعمال شود
    if (state.highlightedElement !== e.target) {
      if (state.highlightedElement) {
        state.highlightedElement.style.outline = "";
        state.highlightedElement.style.opacity = "";
      }
      state.highlightedElement = e.target;
      e.target.style.outline = CONFIG.HIGHLIGHT_STYLE;
      e.target.style.opacity = "0.9";
    }
  });
}

export function teardownEventListeners() {
  // در صورت نیاز، از متغیرهای تعریف‌شده برای حذف event listener استفاده کنید.
  // توجه داشته باشید که در این نمونه متغیرهای handleFocus و ... باید در سطح بالاتری تعریف شوند.
  document.removeEventListener("focus", handleFocus, true);
  document.removeEventListener("blur", handleBlur, true);
  document.removeEventListener("selectionchange", handleEvent);
  document.removeEventListener("click", handleClick);
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mouseover", handleMouseOver);
}
