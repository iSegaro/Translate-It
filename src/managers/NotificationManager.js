// src/managers/NotificationManager.js

import browser from "webextension-polyfill";
import { isExtensionContextValid, logME } from "../utils/helpers.js";
import { parseBoolean, getTranslationString } from "../utils/i18n.js";

const SAFE_ICONS = {
  ICON_TRANSLATION: "🌐",
  ICON_SUCCESS: "✅",
  ICON_WARNING: "⚠️",
  ICON_STATUS: "⏳",
  ICON_ERROR: "❌",
  ICON_INFO: "🔵",
  ICON_REVERT: "↩️",
};

export default class NotificationManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler || { handle: () => {} };
    this.map = {
      error: {
        title: "Translate It! - Error",
        icon: SAFE_ICONS.ICON_ERROR,
        cls: "AIWC-error",
        dur: 5000,
      },
      warning: {
        title: "Translate It! - Warning",
        icon: SAFE_ICONS.ICON_WARNING,
        cls: "AIWC-warning",
        dur: 4000,
      },
      success: {
        title: "Translate It! - Success",
        icon: SAFE_ICONS.ICON_SUCCESS,
        cls: "AIWC-success",
        dur: 3000,
      },
      info: {
        title: "Translate It! - Info",
        icon: SAFE_ICONS.ICON_INFO,
        cls: "AIWC-info",
        dur: 3000,
      },
      status: {
        title: "Translate It! - Status",
        icon: SAFE_ICONS.ICON_STATUS,
        cls: "AIWC-status",
        dur: 2000,
      },
      revert: {
        title: "Translate It! - Revert",
        icon: SAFE_ICONS.ICON_REVERT,
        cls: "AIWC-revert",
        dur: 800,
      },
    };

    this.container = null;
    this.canShowInPage = false;

    // [REFACTOR] The premature initialization call is removed from the constructor.
    // The container will be created on-demand by the `show` method.
    // this._initializeContainer();
  }

  initialize() {
    this._setupLocaleListener();
  }

  /**
   * Ensures the notification container exists in the DOM.
   * This method implements a lazy-initialization pattern. It creates and appends
   * the container only when it's first needed, preventing conflicts during page load.
   */
  _ensureContainerExists() {
    // If the container is already created and attached, do nothing.
    if (this.container && document.body.contains(this.container)) {
      this.canShowInPage = true;
      return;
    }

    // Check for DOM readiness. Essential guard for asynchronous execution.
    if (
      typeof document === "undefined" ||
      !document.body ||
      typeof document.createElement !== "function"
    ) {
      logME(
        "[NotificationManager] DOM not ready or capable for in-page notifications.",
      );
      this.canShowInPage = false;
      return;
    }

    try {
      const id = "AIWritingCompanion-notifications";
      let el = document.getElementById(id);
      if (el) {
        this.container = el;
        this.canShowInPage = true;
        this._applyAlignment(); // Ensure alignment is correct if re-attaching
        logME("[NotificationManager] Re-attached to existing container.");
        return;
      }

      el = document.createElement("div");
      el.id = id;
      Object.assign(el.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        left: "auto",
        zIndex: "2147483646",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
        direction: "ltr",
        textAlign: "left",
      });

      // [REFACTOR] The critical DOM manipulation now happens here, just-in-time.
      document.body.appendChild(el);

      this.container = el;
      this.canShowInPage = true; // Set capability flag upon success
      this._applyAlignment(); // Apply alignment styles immediately after creation
      logME(
        "[NotificationManager] Container created and appended successfully.",
      );
    } catch (error) {
      logME(
        "[NotificationManager] Environment not compatible for in-page notifications due to error:",
        error.message,
      );
      this.canShowInPage = false;
      if (this.container) {
        try {
          this.container.remove();
        } catch {
          /* ignore */
        }
        this.container = null;
      }
    }
  }

  async _setupLocaleListener() {
    if (browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener.call(
        browser.storage.onChanged,
        (changes, area) => {
          if (area === "local" && changes.APPLICATION_LOCALIZE) {
            // Only apply alignment if the container has already been created
            if (this.container) {
              this._applyAlignment();
            }
          }
        },
      );
    }
  }

  async _applyAlignment() {
    if (!this.container) return;

    try {
      const rtlMsg = await getTranslationString("IsRTL");
      const isRTL = parseBoolean(rtlMsg);

      this.container.style.right = "20px"; // isRTL ? "auto" : "20px";
      this.container.style.left = "auto"; //isRTL ? "20px" : "auto";
      this.container.style.direction = isRTL ? "rtl" : "ltr";
      this.container.style.textAlign = "right"; // isRTL ? "right" : "left";
    } catch (error) {
      // Fallback to default LTR styles
      this.container.style.right = "20px";
      this.container.style.left = "auto";
      this.container.style.direction = "ltr";
      this.container.style.textAlign = "left";
      logME(
        "[NotificationManager] Alignment application failed, using defaults:",
        error,
      );
    }
  }

  /**
   * [The `show` method now ensures the container exists before attempting to display a notification.
   */
  async show(msg, type = "info", auto = true, dur = null, onClick) {
    // Step 1: Ensure the container is ready for in-page notifications.
    this._ensureContainerExists();

    const cfg = this.map[type] || this.map.info;
    const finalDur = dur ?? cfg.dur;

    // Step 2: Attempt to show the notification in-page if possible.
    if (this.canShowInPage) {
      try {
        return this._toastInPage(msg, cfg, auto, finalDur, onClick);
      } catch (err) {
        logME(
          "[NotificationManager] In-page notification failed, will fallback.",
          err,
        );
      }
    }

    // Step 3: Fallback to a background script notification if in-page is not available or failed.
    logME(
      `[NotificationManager] In-page not available. Sending notification request to background for: "${msg}"`,
    );
    if (await isExtensionContextValid()) {
      browser.runtime
        .sendMessage({
          action: "show_os_notification",
          payload: { message: msg, title: cfg.title, type: type },
        })
        .catch((error) => {
          logME(
            "[NotificationManager] Could not send message to background script.",
            error,
          );
        });
    }

    return null; // No DOM node to return when using the fallback.
  }

  dismiss(node) {
    if (!node || typeof node.remove !== "function" || !node.parentNode) return;

    try {
      node.style.opacity = "0";
      setTimeout(() => {
        try {
          if (node.parentNode) {
            node.remove();
          }
        } catch {
          /* Already removed, which is fine. */
        }
      }, 500);
    } catch (error) {
      logME("[NotificationManager] Error dismissing notification:", error);
    }
  }

  _toastInPage(message, cfg, auto, dur, onClick) {
    // This internal method remains largely the same, but it's now called more safely.
    if (!this.container) return null; // Extra safety guard

    const n = document.createElement("div");
    n.className = `AIWC-notification ${cfg.cls}`;
    n.style.cssText = `
      background: #fff; color: #333; padding: 10px 15px; border-radius: 6px;
      font-size: 14px; border: 1px solid #ddd; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: flex; align-items: center; cursor: ${onClick ? "pointer" : "default"};
      opacity: 0; transform: translateY(10px); transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: auto; max-width: 300px; word-wrap: break-word;
    `;

    // ✅ DOM-safe API instead replace:
    const iconSpan = document.createElement("span");
    iconSpan.textContent = cfg.icon;
    iconSpan.style.marginRight =
      this.container.style.direction === "rtl" ? "0" : "8px";
    iconSpan.style.marginLeft =
      this.container.style.direction === "rtl" ? "8px" : "0";

    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;

    n.appendChild(iconSpan);
    n.appendChild(msgSpan);

    if (onClick) {
      n.addEventListener(
        "click",
        () => {
          try {
            onClick();
          } catch (e) {
            logME("[NotificationManager] onClick error:", e);
          }
          this.dismiss(n);
        },
        { once: true },
      );
    }

    this.container.appendChild(n);

    setTimeout(() => {
      n.style.opacity = "1";
      n.style.transform = "translateY(0)";
    }, 10);

    if (auto && cfg.cls !== "AIWC-status") {
      setTimeout(() => this.dismiss(n), dur);
    }

    return n;
  }

  reset() {
    this.canShowInPage = false;
    if (this.container) {
      try {
        this.container.remove();
      } catch {
        /* ignore */
      }
      this.container = null;
    }
  }

  async isReady() {
    // The meaning of 'ready' is now simpler: can it potentially show a notification?
    const containerExists = !!(
      this.container && document.body.contains(this.container)
    );
    return {
      canShowInPage: this.canShowInPage || containerExists,
      containerAvailable: containerExists,
    };
  }
}
