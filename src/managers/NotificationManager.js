// src/managers/NotificationManager.js
import { CONFIG } from "../config.js";
import { fadeOut } from "../utils/helpers.js";

export default class NotificationManager {
  constructor() {
    if (typeof document !== "undefined") {
      // Check if document is defined (browser context)
      this.container = this.createContainer();
    } else {
      this.container = null; // Or handle differently for non-browser context
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

  show(message, type = "info", autoDismiss = true, duration = 3000, onClick) {
    if (!this.container) {
      // If no container (background context), use Chrome Notifications API
      return this.showBackgroundNotification(message, type, onClick);
    }

    const notification = document.createElement("div");
    const icon = CONFIG[`ICON_${type.toUpperCase()}`] || "💠";

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-text">${message}</span>
    `;

    Object.assign(notification.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      background: this.getBackgroundColor(type),
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "4px",
      fontSize: "14px",
      cursor: "pointer",
      opacity: "1",
    });

    if (onClick) {
      notification.addEventListener("click", onClick);
    } else {
      notification.addEventListener("click", () => this.dismiss(notification));
    }

    this.container.appendChild(notification);

    if (autoDismiss) {
      setTimeout(() => this.dismiss(notification), duration);
    }

    return notification;
  }

  dismiss(notification) {
    fadeOut(notification);
  }

  getBackgroundColor(type) {
    const colors = {
      error: "rgba(255,0,0,0.8)",
      success: "rgba(0,128,0,0.8)",
      status: "rgba(0,0,0,0.7)",
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
