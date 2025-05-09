// src/managers/NotificationManager.js

import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { isExtensionContextValid, logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { parseBoolean, getTranslationString } from "../utils/i18n.js";

const safe = {
  ICON_TRANSLATION: CONFIG?.ICON_TRANSLATION ?? "🌐",
  ICON_SUCCESS: CONFIG?.ICON_SUCCESS ?? "✅",
  ICON_WARNING: CONFIG?.ICON_WARNING ?? "⚠️",
  ICON_STATUS: CONFIG?.ICON_STATUS ?? "⏳",
  ICON_ERROR: CONFIG?.ICON_ERROR ?? "❌",
  ICON_INFO: CONFIG?.ICON_INFO ?? "🔵",
  ICON_REVERT: CONFIG?.ICON_REVERT ?? "↩️",
};

export default class NotificationManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler || { handle: () => {} };
    this.map = {
      error: {
        title: "Translate It! - Error",
        icon: safe.ICON_ERROR,
        cls: "AIWC-error",
        dur: 5000,
      },
      warning: {
        title: "Translate It! - Warning",
        icon: safe.ICON_WARNING,
        cls: "AIWC-warning",
        dur: 4000,
      },
      success: {
        title: "Translate It! - Success",
        icon: safe.ICON_SUCCESS,
        cls: "AIWC-success",
        dur: 3000,
      },
      info: {
        title: "Translate It! - Info",
        icon: safe.ICON_INFO,
        cls: "AIWC-info",
        dur: 3000,
      },
      status: {
        title: "Translate It! - Status",
        icon: safe.ICON_STATUS,
        cls: "AIWC-status",
        dur: 2000,
      },
      revert: {
        title: "Translate It! - Revert",
        icon: safe.ICON_REVERT,
        cls: "AIWC-revert",
        dur: 800,
      },
    };

    this.container = null;

    // Create container when DOM ready
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          () => this._makeContainer(),
          { once: true }
        );
      } else {
        this._makeContainer();
      }
    }

    // Listen for locale changes to update alignment dynamically
    if (Browser.storage && Browser.storage.onChanged) {
      Browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.APPLICATION_LOCALIZE) {
          this._applyAlignment();
        }
      });
    }
  }

  async _applyAlignment() {
    if (!this.container) return;
    try {
      const rtlMsg = await getTranslationString("IsRTL");
      const isRTL = parseBoolean(rtlMsg);
      if (isRTL) {
        this.container.style.right = "20px";
        this.container.style.left = "";
      } else {
        this.container.style.left = "";
        this.container.style.right = "20px";
      }
      this.container.style.direction = isRTL ? "rtl" : "ltr";
      this.container.style.textAlign = "right"; // isRTL ? "right" : "left";
    } catch (e) {
      logME("[NotificationManager] _applyAlignment failed:", e);
    }
  }

  _makeContainer() {
    let el = null;
    try {
      const id = "AIWritingCompanion-notifications";
      el = document.getElementById(id);
      if (el) {
        this.container = el;
        this._applyAlignment();
        return el;
      }

      if (!document.body) {
        logME("[NotificationManager] document.body not available.");
        return null;
      }

      el = document.createElement("div");
      if (!el) {
        logME("[NotificationManager] createElement failed.");
        return null;
      }
      el.id = id;
      Object.assign(el.style, {
        position: "fixed",
        top: "20px",
        zIndex: "2147483646",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      });
      document.body.appendChild(el);
      this.container = el;
      this._applyAlignment();
      return el;
    } catch (error) {
      logME("[NotificationManager] _makeContainer error:", error);
      if (el && el.remove) el.remove();
      return null;
    }
  }

  show(msg, type = "info", auto = true, dur = null, onClick) {
    const cfg = this.map[type] || this.map.info;
    const finalDur = dur ?? cfg.dur;

    if (this.container && document.body.contains(this.container)) {
      try {
        return this._toastInPage(msg, cfg, auto, finalDur, onClick);
      } catch (err) {
        this.errorHandler.handle?.(err, {
          type: ErrorTypes.UI,
          context: "NotificationManager-show",
        });
        return null;
      }
    }
    this._sendToActiveTab(msg, type, auto, finalDur, onClick);
    return null;
  }

  dismiss(node) {
    if (!node || typeof node.remove !== "function") return;
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 500);
  }

  _toastInPage(message, cfg, auto, dur, onClick) {
    const n = document.createElement("div");
    n.className = `AIWC-notification ${cfg.cls}`;
    n.style.cssText = `
      background:#fff;color:#333;padding:10px 15px;
      border-radius:6px;font-size:14px;border:1px solid #ddd;
      box-shadow:0 2px 8px rgba(0,0,0,0.1);display:flex;
      align-items:center;cursor:pointer;opacity:1;
      transition:opacity .5s`;

    // ✅ DOM-safe API instead replace:
    const iconSpan = document.createElement("span");
    iconSpan.textContent = cfg.icon;

    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;

    n.appendChild(iconSpan);
    n.appendChild(msgSpan);

    n.addEventListener("click", () => {
      try {
        onClick?.();
      } catch (e) {
        logME(e);
      }
      this.dismiss(n);
    });

    this.container.appendChild(n);
    if (auto && cfg.cls !== "AIWC-status")
      setTimeout(() => this.dismiss(n), dur);

    return n;
  }

  _sendToActiveTab(message, type, auto, duration, onClick) {
    return Browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) =>
        tabs?.[0]?.id && isExtensionContextValid() ?
          Browser.tabs.sendMessage(tabs[0].id, {
            action: "show_notification",
            payload: { message, type, autoDismiss: auto, duration },
          })
        : null
      )
      .then((res) => {
        if (onClick && res !== undefined) {
          const listener = (msg) => {
            if (msg?.action === "notification_clicked") {
              onClick();
              Browser.runtime.onMessage.removeListener(listener);
            }
          };
          Browser.runtime.onMessage.addListener(listener);
        }
      })
      .catch(() => this._osNotification(message, type, onClick));
  }

  _osNotification(message, type, onClick) {
    const cfg = this.map[type] || this.map.info;
    Browser.notifications
      .create({
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/extension_icon.png"),
        title: cfg.title,
        message,
      })
      .then((id) => {
        if (!onClick) return;
        const click = (cid) => {
          if (cid === id) {
            onClick();
            Browser.notifications.clear(id);
            Browser.notifications.onClicked.removeListener(click);
          }
        };
        Browser.notifications.onClicked.addListener(click);
      })
      .catch(() => {});
  }
}
