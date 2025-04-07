// src/popup/popupInteractionManager.js
import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import { getTranslateWithSelectElementAsync } from "../config.js";
import { wasSelectElementIconClicked } from "./headerActionsManager.js"; // Import check function
import { logME } from "../utils/helpers.js";

const MOUSE_OVER_TIMEOUT = 1000;
const MOUSE_LEAVE_TIMEOUT = 800;

let popupMouseLeaveTimer;
let popupInteractionTimer;

function handlePopupInteraction() {
  // Check flag from header manager *before* clearing timer
  if (wasSelectElementIconClicked()) {
    logME(
      "[PopupInteraction]: Interaction detected, but select icon was the trigger. Ignoring."
    );
    return; // Don't deactivate if click was the interaction
  }

  clearTimeout(popupInteractionTimer);
  popupInteractionTimer = setTimeout(() => {
    logME(
      "[PopupInteraction]: User interacted (mouseover timeout). Deactivating select mode."
    );
    Active_SelectElement(false); // Deactivate element selection mode
  }, MOUSE_OVER_TIMEOUT);
}

function handleMouseDown(event) {
  // Check flag from header manager
  const selectIconClicked = wasSelectElementIconClicked();

  // Prevent deactivation if the click target was the select icon itself
  // OR if the click action originated from the select icon click sequence
  if (event.target === elements.selectElementIcon || selectIconClicked) {
    logME(
      "[PopupInteraction]: Mousedown related to select icon. Preventing deactivation."
    );
    return;
  }

  clearTimeout(popupInteractionTimer); // Cancel delayed deactivation
  logME(
    "[PopupInteraction]: Mousedown interaction. Deactivating select mode immediately."
  );
  Active_SelectElement(false);
}

async function setupInteractionListeners() {
  const isSelectionModeActiveInitially =
    await getTranslateWithSelectElementAsync();
  if (!isSelectionModeActiveInitially) {
    logME(
      "[PopupInteraction]: Select element on hover/interaction disabled by config."
    );
    return; // Don't attach listeners if the feature is off
  }

  logME(
    "[PopupInteraction]: Select element interaction mode is enabled. Attaching listeners."
  );

  // Activate selection mode on initial load (don't close popup yet)
  Active_SelectElement(true, false);

  elements.popupContainer?.addEventListener("mouseenter", () => {
    clearTimeout(popupMouseLeaveTimer);
    // Reset flag in header manager might be needed here if not reset after check
    // wasSelectElementIconClicked(); // Call to potentially reset if designed that way
    logME("[PopupInteraction]: Mouse entered popup.");
  });

  elements.popupContainer?.addEventListener("mouseleave", () => {
    clearTimeout(popupMouseLeaveTimer);
    chrome.storage.local.get(["selectElementState"], (result) => {
      if (result.selectElementState) {
        logME(
          "[PopupInteraction]: Mouse left while select mode active. Starting close timer."
        );
        popupMouseLeaveTimer = setTimeout(() => {
          logME("[PopupInteraction]: Closing popup (mouse leave timeout).");
          window.close();
        }, MOUSE_LEAVE_TIMEOUT);
      } else {
        logME(
          "[PopupInteraction]: Mouse left, but select mode inactive. Not closing."
        );
      }
    });
  });

  // Handle general interaction (hovering over popup elements)
  elements.popupContainer?.addEventListener(
    "mouseover",
    handlePopupInteraction
  );

  // Handle direct clicks (more immediate deactivation)
  elements.popupContainer?.addEventListener("mousedown", handleMouseDown);

  logME("[PopupInteraction]: Listeners attached.");
}

export async function init() {
  // This needs to run after config is checked and potentially after header manager setup
  await setupInteractionListeners();
  logME("[PopupInteraction]: Initialized.");
}
