// src/managers/NotificationManager.js
//
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { isExtensionContextValid, logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

const safe = {
  ICON_TRANSLATION: CONFIG?.ICON_TRANSLATION ?? "🌐",
  ICON_SUCCESS: CONFIG?.ICON_SUCCESS ?? "✅",
  ICON_WARNING: CONFIG?.ICON_WARNING ?? "⚠️",
  ICON_STATUS: CONFIG?.ICON_STATUS ?? "⏳",
  ICON_ERROR: CONFIG?.ICON_ERROR ?? "❌",
  ICON_INFO: CONFIG?.ICON_INFO ?? "🔵",
  ICON_REVERT: CONFIG?.ICON_REVERT ?? "↩️",
  NOTIF_ALIGN: CONFIG?.NOTIFICATION_ALIGNMENT ?? "right",
  TEXT_DIR: CONFIG?.NOTIFICATION_TEXT_DIRECTION ?? "rtl",
  TEXT_ALIGN: CONFIG?.NOTIFICATION_TEXT_ALIGNMENT ?? "right",
};

export default class NotificationManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler || { handle: () => {} };
    this.map = {
      error: {
        title: "AI Writing Companion - Error",
        icon: safe.ICON_ERROR,
        cls: "AIWC-error",
        dur: 5000,
      },
      warning: {
        title: "AI Writing Companion - Warning",
        icon: safe.ICON_WARNING,
        cls: "AIWC-warning",
        dur: 4000,
      },
      success: {
        title: "AI Writing Companion - Success",
        icon: safe.ICON_SUCCESS,
        cls: "AIWC-success",
        dur: 3000,
      },
      info: {
        title: "AI Writing Companion - Info",
        icon: safe.ICON_INFO,
        cls: "AIWC-info",
        dur: 3000,
      },
      status: {
        title: "AI Writing Companion - Status",
        icon: safe.ICON_INFO,
        cls: "AIWC-status",
        dur: 2000,
      },
      revert: {
        title: "AI Writing Companion - Revert",
        icon: safe.ICON_REVERT,
        cls: "AIWC-revert",
        dur: 800,
      },
    };

    if (typeof document !== "undefined") {
      this.container = this._makeContainer();
    } else {
      this.container = null;
    }
  }

  _makeContainer() {
    const id = "AIWritingCompanion-notifications";
    let el = document.getElementById(id);
    if (el) return el;

    el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "fixed",
      top: "20px",
      zIndex: "2147483646",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      [safe.NOTIF_ALIGN === "right" ? "right" : "left"]: "20px",
      direction: safe.TEXT_DIR,
      textAlign: safe.TEXT_ALIGN,
    });
    document.body.appendChild(el);
    return el;
  }

  show(msg, type = "info", auto = true, dur = null, onClick) {
    const cfg = this.map[type] || this.map.info;
    const finalDur = dur ?? cfg.dur;

    // In-page notification
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

    // Background notification fallback
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
    n.innerHTML = `<span style="margin-inline-end:6px;">${cfg.icon}</span><span>${message}</span>`;

    n.addEventListener("click", () => {
      try {
        if (typeof onClick === "function") onClick();
      } catch (e) {
        logME(e);
      }
      this.dismiss(n);
    });

    this.container.appendChild(n);
    if (auto && cfg.cls !== "AIWC-status") {
      setTimeout(() => this.dismiss(n), dur);
    }
    return n;
  }

  _sendToActiveTab(message, type, auto, duration, onClick) {
    return Browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tabId = tabs?.[0]?.id;
        if (!tabId) return; // no-op if no active tab
        if (isExtensionContextValid()) {
          return Browser.tabs.sendMessage(tabId, {
            action: "show_notification",
            payload: { message, type, autoDismiss: auto, duration },
          });
        }
      })
      .then((res) => {
        // attach click callback only if res indicates listener present
        if (onClick && res !== undefined) {
          const clickListener = (msg) => {
            if (msg?.action === "notification_clicked") {
              onClick();
              Browser.runtime.onMessage.removeListener(clickListener);
            }
          };
          Browser.runtime.onMessage.addListener(clickListener);
        }
      })
      .catch((err) => {
        // fallback to OS notification
        this._osNotification(message, type, onClick);
      });
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
      .catch(() => {
        // ignore OS notification errors
      });
  }
}
