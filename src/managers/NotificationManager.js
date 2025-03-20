// src/managers/NotificationManager.js
import { CONFIG } from "../config.js";
import { fadeOut } from "../utils/helpers.js";

export default class NotificationManager {
  constructor() {
    this.typeMapping = {
      error: {
        title: "خطا - ترجمه خودکار",
        icon: CONFIG.ICON_ERROR,
        priority: 2,
      },
      warning: {
        title: "هشدار - ترجمه خودکار",
        icon: CONFIG.ICON_WARNING,
        priority: 1,
      },
      success: {
        title: "موفقیت - ترجمه خودکار",
        icon: CONFIG.ICON_SUCCESS,
        priority: 0,
      },
      info: {
        title: "اطلاعات - ترجمه خودکار",
        icon: CONFIG.ICON_INFO,
        priority: 0,
      },
    };

    if (typeof document !== "undefined") {
      this.container = this.createContainer();
    } else {
      this.container = null;
    }
  }

  createContainer() {
    let container = document.getElementById("translation-notifications");
    if (!container) {
      container = document.createElement("div");
      container.id = "translation-notifications";
      Object.assign(container.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: "10000000000",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });
      document.body.appendChild(container);
    }
    return container;
  }

  // نمایش اعلان در صورتی که container وجود نداشته باشد (برای پس‌زمینه)
  showBackgroundNotification(message, type = "info", onClick) {
    const config = this.typeMapping[type] || this.typeMapping.info;

    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: "icons/icon.png",
        title: config.title,
        message: message,
        priority: config.priority,
      },
      (notificationId) => {
        if (onClick) {
          const handleClick = (clickedId) => {
            if (clickedId === notificationId) {
              onClick();
              chrome.notifications.clear(notificationId);
              chrome.notifications.onClicked.removeListener(handleClick);
            }
          };
          chrome.notifications.onClicked.addListener(handleClick);
        }
      }
    );
  }

  show(message, type = "info", autoDismiss = true, duration = null, onClick) {
    if (!this.container) {
      return this.showBackgroundNotification(message, type, onClick);
    }

    const baseNotification = {
      error: { icon: CONFIG.ICON_ERROR, duration: 5000 },
      warning: { icon: CONFIG.ICON_WARNING, duration: 4000 },
      success: { icon: CONFIG.ICON_SUCCESS, duration: 3000 },
      info: { icon: CONFIG.ICON_INFO, duration: 3000 },
      status: { icon: CONFIG.ICON_INFO, duration: 2000 },
      revert: { icon: CONFIG.ICON_REVERT, duration: 2000 },
    };

    const config = baseNotification[type] || baseNotification.info;
    const finalDuration = duration || config.duration;

    const notification = document.createElement("div");
    notification.className = "translation-notification";

    const icon = config.icon || CONFIG[`ICON_${type.toUpperCase()}`] || "🔵";

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-text">${message}</span>
    `;

    Object.assign(notification.style, {
      background: this.getBackgroundColor(type),
    });

    const clickHandler = onClick ? onClick : () => this.dismiss(notification);

    notification.addEventListener("click", clickHandler);

    this.container.appendChild(notification);

    // اعلان‌های وضعیت autoDismiss نمی‌شوند
    if (autoDismiss && type !== "status") {
      setTimeout(() => {
        this.dismiss(notification);
        notification.removeEventListener("click", clickHandler);
      }, finalDuration);
    }

    return notification;
  }

  dismiss(notification) {
    fadeOut(notification);
  }

  getBackgroundColor(type) {
    const colors = {
      error: "rgba(255,0,0,0.8)",
      success: "rgba(0,128,0,0.7)",
      status: "rgba(0,0,0,0.4)",
      warning: "rgba(255,165,0,0.8)",
      info: "rgba(30,144,255,0.8)",
    };
    return colors[type] || "rgba(0,0,0,0.7)";
  }
}
