// src/popup/popupInteractionManager.js

import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import {
  getTranslateWithSelectElementAsync,
  getExtensionEnabledAsync,
} from "../config.js";
// import { wasSelectElementIconClicked } from "./headerActionsManager.js";

const HOVER_TIMEOUT = 1000;
const AUTO_CLOSE_TIMEOUT = 800; // زمان انتظار برای بررسی اولیه ورود موس به پاپ‌آپ

let isMouseOverPopup = false;
let hoverStayTimer = null;
let autoCloseTimer = null;
let initialEntryTimer = null;
let interactionLocked = false;

// eslint-disable-next-line no-unused-vars
function logPopupEvent(message, data = null) {
  // logME(`📦[PopupDebug]: ${message}`, data || "");
  return;
}

function cancelAutoClose(reason = "") {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    logPopupEvent(
      "[popupInteractionManager] Auto-close timer canceled",
      reason
    );
    autoCloseTimer = null;
  }
}

function cancelHoverTimer() {
  if (hoverStayTimer) {
    clearTimeout(hoverStayTimer);
    hoverStayTimer = null;
  }
}

function cancelInitialEntryTimer() {
  if (initialEntryTimer) {
    clearTimeout(initialEntryTimer);
    logPopupEvent("[popupInteractionManager] Initial entry timer canceled");
    initialEntryTimer = null;
  }
}

async function ensureSelectElementActive() {
  const isEnabled = await getExtensionEnabledAsync();
  const isSelectAllowed = await getTranslateWithSelectElementAsync();

  logPopupEvent("[popupInteractionManager] Extension enabled?", isEnabled);
  logPopupEvent(
    "[popupInteractionManager] Select element allowed?",
    isSelectAllowed
  );

  if (isEnabled && isSelectAllowed) {
    setTimeout(() => {
      logPopupEvent(
        "[popupInteractionManager]  Delayed activation of Select Mode"
      );
      Active_SelectElement(true, false, true); // force = true, closePopupIfNoInteraction = false
    }, 100);
    return true;
  }

  logPopupEvent(
    "[popupInteractionManager] Conditions not met – Select mode not activated"
  );
  return false;
}

function setupInteractionListeners() {
  elements.popupContainer?.addEventListener("mouseenter", () => {
    isMouseOverPopup = true;
    cancelAutoClose("mouseenter");
    cancelInitialEntryTimer(); // موس وارد پاپ‌آپ شده، تایمر اولیه دیگر لازم نیست

    if (!interactionLocked) {
      hoverStayTimer = setTimeout(() => {
        interactionLocked = true;
        logPopupEvent(
          "[popupInteractionManager]  Hover timeout passed – locking interaction & deactivating select"
        );
        Active_SelectElement(false); // غیرفعال کردن حالت انتخاب چون کاربر با پاپ‌آپ تعامل کرده
      }, HOVER_TIMEOUT);
    }
  });

  elements.popupContainer?.addEventListener("mouseleave", () => {
    isMouseOverPopup = false;
    cancelHoverTimer(); // لغو تایمر هاور چون موس خارج شده

    if (!interactionLocked) {
      // اگر تعامل هنوز قفل نشده (کاربر کلیک نکرده یا به اندازه کافی هاور نکرده)
      autoCloseTimer = setTimeout(() => {
        logPopupEvent(
          "[popupInteractionManager] Mouse left early – closing popup (select remains active)"
        );
        // اگر موس پاپ‌آپ را ترک کرد و به صفحه رفت، حالت انتخاب فعال و پاپ‌آپ بسته شود
        Active_SelectElement(true, true); // فعال کردن حالت انتخاب و بستن پاپ‌آپ
      }, AUTO_CLOSE_TIMEOUT);
    } else {
      logPopupEvent(
        "[popupInteractionManager] Interaction locked – popup stays open"
      );
    }
  });

  elements.popupContainer?.addEventListener("mousedown", () => {
    if (!interactionLocked) {
      interactionLocked = true; // با کلیک، تعامل قفل می‌شود
      cancelHoverTimer();
      cancelAutoClose("mousedown");
      cancelInitialEntryTimer();
      logPopupEvent(
        "[popupInteractionManager] User clicked – locking & deactivating select"
      );
      Active_SelectElement(false); // غیرفعال کردن حالت انتخاب
    }
  });

  // شروع تایمر اولیه برای تشخیص اینکه موس اصلاً وارد popup شده یا نه
  initialEntryTimer = setTimeout(() => {
    if (!isMouseOverPopup && !interactionLocked) {
      // اگر موس وارد پاپ‌آپ نشده و تعامل هم قفل نشده باشد
      logPopupEvent(
        "[popupInteractionManager] Initial mouse entry to popup not detected – Deactivating Select Mode, Popup remains open." // لاگ به‌روز شده
      );
      // رفتار جدید: حالت انتخاب المنت غیرفعال شود و پاپ‌آپ باز بماند
      Active_SelectElement(false);
    } else {
      // اگر موس وارد شده یا تعامل قفل شده، پاپ‌آپ باز می‌ماند (و حالت انتخاب توسط رویدادهای دیگر مدیریت شده)
      logPopupEvent(
        "[popupInteractionManager] Mouse entered popup or interaction locked – popup stays open"
      );
    }
  }, AUTO_CLOSE_TIMEOUT);

  logPopupEvent(
    "[popupInteractionManager] Popup interaction listeners attached"
  );
}

export async function init() {
  logPopupEvent("[popupInteractionManager] INIT");
  const success = await ensureSelectElementActive();
  if (success) {
    setupInteractionListeners();
  }
  logPopupEvent("[popupInteractionManager] READY");
}