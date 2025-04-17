// src/managers/NotificationManager.js
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { logME } from "../utils/helpers.js";

const safeConfig = {
  ICON_ERROR: CONFIG?.ICON_ERROR ?? "❌",
  ICON_WARNING: CONFIG?.ICON_WARNING ?? "⚠️",
  ICON_SUCCESS: CONFIG?.ICON_SUCCESS ?? "✅",
  ICON_INFO: CONFIG?.ICON_INFO ?? "ℹ️",
  ICON_REVERT: CONFIG?.ICON_REVERT ?? "↩️",
  NOTIFICATION_ALIGNMENT: CONFIG?.NOTIFICATION_ALIGNMENT ?? "right",
  NOTIFICATION_TEXT_DIRECTION: CONFIG?.NOTIFICATION_TEXT_DIRECTION ?? "rtl",
  NOTIFICATION_TEXT_ALIGNMENT: CONFIG?.NOTIFICATION_TEXT_ALIGNMENT ?? "right",
};

export default class NotificationManager {
  constructor() {
    this.typeMapping = {
      error: {
        title: "خطا - ترجمه خودکار",
        icon: safeConfig.ICON_ERROR,
        className: "AIWritingCompanion-notification-error",
        duration: 5000,
      },
      warning: {
        title: "هشدار - ترجمه خودکار",
        icon: safeConfig.ICON_WARNING,
        className: "AIWritingCompanion-notification-warning",
        duration: 4000,
      },
      success: {
        title: "موفقیت - ترجمه خودکار",
        icon: safeConfig.ICON_SUCCESS,
        className: "AIWritingCompanion-notification-success",
        duration: 3000,
      },
      info: {
        title: "اطلاعات - ترجمه خودکار",
        icon: safeConfig.ICON_INFO,
        className: "AIWritingCompanion-notification-info",
        duration: 3000,
      },
      status: {
        title: "در حال انجام - ترجمه خودکار",
        icon: safeConfig.ICON_INFO,
        className: "AIWritingCompanion-notification-status",
        duration: 2000,
      },
      revert: {
        title: "بازگشت - ترجمه خودکار",
        icon: safeConfig.ICON_REVERT,
        className: "AIWritingCompanion-notification-revert",
        duration: 800,
      },
    };

    if (typeof document !== "undefined") {
      this.container = this._createContainer();
    } else {
      this.container = null;
    }
  }

  _createContainer() {
    const containerId = "AIWritingCompanion-notification-notifications";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.style.position = "fixed";
      container.style.top = "20px";
      container.style.zIndex = "999999999";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "10px";

      if (safeConfig.NOTIFICATION_ALIGNMENT === "right") {
        container.style.right = "20px";
      } else {
        container.style.left = "20px";
      }

      container.style.direction = safeConfig.NOTIFICATION_TEXT_DIRECTION;
      container.style.textAlign = safeConfig.NOTIFICATION_TEXT_ALIGNMENT;
      document.body.appendChild(container);
    }
    return container;
  }

  show(message, type = "info", autoDismiss = true, duration = null, onClick) {
    const config = this.typeMapping[type] || this.typeMapping.info;
    const finalDuration = duration || config.duration;

    if (!this.container || !document.body.contains(this.container)) {
      this._showBackgroundNotification(message, type, onClick);
      return null;
    }

    const notif = document.createElement("div");
    notif.className = `AIWC-notification ${config.className}`;
    notif.style.cssText = `
      background: #fff;
      color: #333;
      padding: 10px 15px;
      border-radius: 6px;
      font-size: 14px;
      border: 1px solid #ddd;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.5s;
    `;

    notif.innerHTML = `
      <span style="margin-inline-end: 6px;">${config.icon}</span>
      <span>${message}</span>
    `;

    notif.addEventListener("click", () => {
      if (typeof onClick === "function") {
        try {
          onClick();
        } catch (e) {
          logME("Notification onClick error:", e);
        }
      }
      this.dismiss(notif);
    });

    this.container.appendChild(notif);

    if (autoDismiss && type !== "status") {
      setTimeout(() => {
        this.dismiss(notif);
      }, finalDuration);
    }

    return notif;
  }

  dismiss(notif) {
    if (!notif || typeof notif.remove !== "function") return;
    try {
      notif.style.opacity = "0";
      setTimeout(() => {
        if (notif.parentNode) notif.remove();
      }, 500);
    } catch (e) {
      logME("Notification dismiss error:", e);
    }
  }

  _showBackgroundNotification(message, type = "info", onClick) {
    const config = this.typeMapping[type] || this.typeMapping.info;

    try {
      Browser.notifications
        .create({
          type: "basic",
          iconUrl: Browser.runtime.getURL("icons/extension_icon.png"),
          title: config.title,
          message: message,
        })
        .then((notificationId) => {
          if (onClick) {
            const clickHandler = (clickedId) => {
              if (clickedId === notificationId) {
                onClick();
                Browser.notifications.clear(notificationId);
                Browser.notifications.onClicked.removeListener(clickHandler);
              }
            };
            Browser.notifications.onClicked.addListener(clickHandler);
          }
        })
        .catch((err) => {
          logME("Background notification error:", err);
        });
    } catch (error) {
      logME("Fallback background notification error:", error);
    }
  }
}
