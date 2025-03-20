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
        duration: 5000, // مدت زمان پیش فرض برای خطا
        className: "notification-error", // اضافه کردن کلاس CSS مربوط به نوع خطا
      },
      warning: {
        title: "هشدار - ترجمه خودکار",
        icon: CONFIG.ICON_WARNING,
        priority: 1,
        duration: 4000, // مدت زمان پیش فرض برای هشدار
        className: "notification-warning", // اضافه کردن کلاس CSS مربوط به نوع هشدار
      },
      success: {
        title: "موفقیت - ترجمه خودکار",
        icon: CONFIG.ICON_SUCCESS,
        priority: 0,
        duration: 3000, // مدت زمان پیش فرض برای موفقیت
        className: "notification-success", // اضافه کردن کلاس CSS مربوط به نوع موفقیت
      },
      info: {
        title: "اطلاعات - ترجمه خودکار",
        icon: CONFIG.ICON_INFO,
        priority: 0,
        duration: 3000, // مدت زمان پیش فرض برای اطلاعات
        className: "notification-info", // اضافه کردن کلاس CSS مربوط به نوع اطلاعات
      },
      status: {
        title: "وضعیت - ترجمه خودکار",
        icon: CONFIG.ICON_INFO,
        priority: 0,
        duration: 2000, // مدت زمان پیش فرض برای وضعیت
        className: "notification-status", // اضافه کردن کلاس CSS مربوط به نوع وضعیت
      },
      revert: {
        title: "بازگشت - ترجمه خودکار",
        icon: CONFIG.ICON_REVERT,
        priority: 0,
        duration: 2000, // مدت زمان پیش فرض برای بازگشت
        className: "notification-revert", // اضافه کردن کلاس CSS مربوط به نوع بازگشت
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

    const baseNotification = this.typeMapping[type] || this.typeMapping.info;
    const finalDuration = duration || baseNotification.duration;
    const icon =
      baseNotification.icon || CONFIG[`ICON_${type.toUpperCase()}`] || "🔵";
    const notification = document.createElement("div");
    notification.className = `translation-notification ${baseNotification.className || ""}`; // اضافه کردن کلاس اصلی و کلاس مربوط به نوع

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-text">${message}</span>
    `;

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
}
