// src/managers/IconBehavior.js

import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { state } from "@/shared/config/config.js";
import { detectPlatform } from "../utils/browser/platform.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import ExtensionContextManager from "../core/extensionContext.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { translateFieldViaSmartHandler } from "../handlers/smartTranslationIntegration.js";
import { getScopedLogger } from "../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../shared/logging/logConstants.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export default function setupIconBehavior(
  icon,
  target,
  translationHandler,
  notifier,
  strategies,
) {
  if (!icon || !target) return;
  
  // Initialize logger for this icon instance
  const logger = getScopedLogger(LOG_COMPONENTS.UI, 'IconManager');

  // Create ResourceTracker for this icon instance
  const tracker = new ResourceTracker('icon-behavior');

  let isCleanedUp = false;

  const cleanupIcon = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    // ResourceTracker handles cleanup of all tracked resources
    tracker.cleanup();

    icon.classList.add("fade-out");
    tracker.trackTimeout(() => {
      if (icon.parentNode) {
        icon.remove();
      }
    }, 50);

    if (state.activeTranslateIcon === icon) {
      state.activeTranslateIcon = null;
    }
  };

  const clickHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!ExtensionContextManager.isValidSync()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      err.context = "iconbehavior-click-context";
      const handler = ErrorHandler.getInstance();
      handler.handle(err, { type: ErrorTypes.CONTEXT, context: "iconbehavior-click-context" });
      return; // Exit the function after handling the error
    }

    let statusNode = null;
    try {
      const platform = detectPlatform(target);
      const text = strategies[platform].extractText(target);
      if (!text) return;
      
      // Dismiss all existing status notifications before showing new one
      if (notifier && typeof notifier.dismissAll === 'function') {
        notifier.dismissAll();
      }
      
      statusNode = await notifier.show(
        (await getTranslationString("STATUS_TRANSLATING_ICON")) ||
          "Translating...",
        "status",
        false,
      );
      
      // Store statusNode and notifier globally so it can be dismissed after translation completes
      window.pendingTranslationStatusNode = statusNode;
      window.pendingTranslationNotifier = notifier;
      
      await translateFieldViaSmartHandler({ text, target, tabId: null });
    } catch (err) {
      const handler = ErrorHandler.getInstance();
      handler.handle(err, { type: ErrorTypes.UI, context: "IconBehavior-clickHandler" });
      // Dismiss notification on error
      if (statusNode) notifier.dismiss(statusNode);
    } finally {
      cleanupIcon();
    }
  };

  const blurHandler = (e) => {
    if (!e.relatedTarget || !icon.contains(e.relatedTarget)) {
      tracker.trackTimeout(cleanupIcon, 50);
    }
  };

  const updatePosition = () => {
    if (!target.isConnected || !icon.isConnected) {
      cleanupIcon();
      return;
    }
    const id = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const iconHeight = icon.offsetHeight || 24;

      const topThreshold = 40;

      if (rect.top < topThreshold) {
        icon.style.top = `${rect.bottom + window.scrollY + 5}px`;
      } else {
        icon.style.top = `${rect.top + window.scrollY - iconHeight - 5}px`;
      }

      icon.style.left = `${rect.right + window.scrollX + 5}px`;

      icon.style.display = "block";
      icon.classList.add("fade-in");
    });
    // Track the animation frame for cleanup
    tracker.trackResource(`raf_${id}`, () => cancelAnimationFrame(id));
  };

  try {
    if (!(icon instanceof HTMLElement) || !icon.isConnected) {
      logger.warn("Icon is not a valid or connected element");
      return;
    }

    if (!target.isConnected || !document.contains(target)) {
      logger.warn("Target element is not in the DOM");
      cleanupIcon();
      return;
    }

    icon.style.position = "absolute";
    icon.style.display = "none";

    resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(target);
    // Track the ResizeObserver for cleanup
    tracker.trackResource('resizeObserver', () => resizeObserver.disconnect());

    tracker.addEventListener(icon, "click", clickHandler);
    tracker.addEventListener(icon, "blur", blurHandler);
    tracker.addEventListener(target, "blur", blurHandler);

    updatePosition();

    state.activeTranslateIcon = icon;
    logger.init("Icon container created and appended successfully");
  } catch (err) {
    cleanupIcon();
    translationHandler.errorHandler.handle(err, {
      type: ErrorTypes.UI,
      context: "IconBehavior-setup",
    });
  }
}
