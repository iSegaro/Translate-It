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

  // بهبود نمایش نوتیفیکیشن‌های سیستمی
  showBackgroundNotification(message, type = "info", onClick) {
    const config = this.typeMapping[type] || this.typeMapping.info;

    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: "icons/icon-48.png",
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
      success: { icon: CONFIG.ICON_SECCESS, duration: 3000 },
      info: { icon: CONFIG.ICON_INFO, duration: 3000 },
    };

    const config = baseNotification[type] || baseNotification.info;
    const finalDuration = duration || config.duration;

    const notification = document.createElement("div");
    notification.className = "translation-notification";

    const icon = config.icon || CONFIG[`ICON_${type.toUpperCase()}`] || "ℹ️";

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

    if (autoDismiss) {
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

  showBackgroundNotification(message, type, onClick) {
    // Method to show Chrome Notifications API
    const notificationOptions = {
      type: "basic",
      iconUrl: "icons/icon.png", // Path to your extension icon
      title: "ترجمه خودکار", // Extension name or a general title
      message: message,
      priority: 2, // Priority level (0-2, 2 is highest)
    };

    if (type === "error") {
      notificationOptions.title = "خطا - ترجمه خودکار";
      notificationOptions.priority = 2;
    } else if (type === "warning") {
      notificationOptions.title = "هشدار - ترجمه خودکار";
      notificationOptions.priority = 1;
    } else if (type === "success") {
      notificationOptions.title = "موفقیت - ترجمه خودکار";
      notificationOptions.priority = 0;
    }

    chrome.notifications.create(
      undefined,
      notificationOptions,
      (notificationId) => {
        if (onClick) {
          chrome.notifications.onClicked.addListener(
            function notificationClicked(clickedNotificationId) {
              if (clickedNotificationId === notificationId) {
                onClick();
                chrome.notifications.clear(notificationId);
                chrome.notifications.onClicked.removeListener(
                  notificationClicked
                ); // Clean up listener
              }
            }
          );
        }
        // Notifications auto-dismiss after a certain time by default in Chrome, no need for manual dismiss in background
      }
    );
  }
}
