// src/popup/popupInteractionManager.js

import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import {
  getTranslateWithSelectElementAsync,
  getExtensionEnabledAsync,
} from "../config.js";
// import { wasSelectElementIconClicked } from "./headerActionsManager.js";

const HOVER_TIMEOUT = 1000;
const AUTO_CLOSE_TIMEOUT = 800;

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
      Active_SelectElement(true, false, true); // force = true
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
    cancelInitialEntryTimer();

    if (!interactionLocked) {
      hoverStayTimer = setTimeout(() => {
        interactionLocked = true;
        logPopupEvent(
          "[popupInteractionManager]  Hover timeout passed – locking interaction & deactivating select"
        );
        Active_SelectElement(false);
      }, HOVER_TIMEOUT);
    }
  });

  elements.popupContainer?.addEventListener("mouseleave", () => {
    isMouseOverPopup = false;
    cancelHoverTimer();

    if (!interactionLocked) {
      autoCloseTimer = setTimeout(() => {
        logPopupEvent(
          "[popupInteractionManager] Mouse left early – closing popup (select remains active)"
        );
        Active_SelectElement(true, true);
      }, AUTO_CLOSE_TIMEOUT);
    } else {
      logPopupEvent(
        "[popupInteractionManager] Interaction locked – popup stays open"
      );
    }
  });

  elements.popupContainer?.addEventListener("mousedown", () => {
    if (!interactionLocked) {
      interactionLocked = true;
      cancelHoverTimer();
      cancelAutoClose("mousedown");
      cancelInitialEntryTimer();
      logPopupEvent(
        "[popupInteractionManager] User clicked – locking & deactivating select"
      );
      Active_SelectElement(false);
    }
  });

  // شروع تایمر اولیه برای تشخیص اینکه موس اصلاً وارد popup شده یا نه
  initialEntryTimer = setTimeout(() => {
    if (!isMouseOverPopup && !interactionLocked) {
      logPopupEvent();
      // "🚪 Initial mouse entry timeout – closing popup (no interaction)"
      Active_SelectElement(true, true);
    } else {
      logPopupEvent(
        "[popupInteractionManager] Mouse entered or interacted – popup stays open"
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
  if (success) setupInteractionListeners();
  logPopupEvent("[popupInteractionManager] READY");
}
