// src/managers/IconBehavior.js

import { state } from "../config.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { isExtensionContextValid, logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { translateFieldViaSmartHandler } from "../handlers/smartTranslationIntegration.js";

export default function setupIconBehavior(
  icon,
  target,
  translationHandler,
  notifier,
  strategies
) {
  if (!icon || !target) return;

  let isCleanedUp = false;
  let resizeObserver;
  const rafIds = new Set();

  const cleanupIcon = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    rafIds.forEach((id) => cancelAnimationFrame(id));
    resizeObserver?.disconnect();

    icon.removeEventListener("click", clickHandler);
    icon.removeEventListener("blur", blurHandler);
    target.removeEventListener("blur", blurHandler);

    icon.classList.add("fade-out");
    setTimeout(() => {
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

    if (!isExtensionContextValid()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      err.context = "iconbehavior-click-context";
      throw err;
    }

    let statusNode = null;
    try {
      const platform = detectPlatform(target);
      const text = strategies[platform].extractText(target);
      if (!text) return;
      statusNode = notifier.show(
        (await getTranslationString("STATUS_TRANSLATING_ICON")) ||
          "Translating...",
        "status",
        false
      );
      await translateFieldViaSmartHandler({ text, target, translationHandler });
    } catch (err) {
      logME("[IconBehavior] ", err);
    } finally {
      if (statusNode) notifier.dismiss(statusNode);
      cleanupIcon();
    }
  };

  const blurHandler = (e) => {
    if (!e.relatedTarget || !icon.contains(e.relatedTarget)) {
      setTimeout(cleanupIcon, 50);
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
    rafIds.add(id);
  };

  try {
    if (!(icon instanceof HTMLElement) || !icon.isConnected) {
      logME("[IconBehavior] Icon is not a valid or connected element.");
      return;
    }

    if (!target.isConnected || !document.contains(target)) {
      logME("[IconBehavior] Target element is not in the DOM.");
      cleanupIcon();
      return;
    }

    icon.style.position = "absolute";
    icon.style.display = "none";

    resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(target);

    icon.addEventListener("click", clickHandler);
    icon.addEventListener("blur", blurHandler);
    target.addEventListener("blur", blurHandler);

    updatePosition();

    state.activeTranslateIcon = icon;
  } catch (err) {
    cleanupIcon();
    translationHandler.errorHandler.handle(err, {
      type: ErrorTypes.UI,
      context: "IconBehavior-setup",
    });
  }
}