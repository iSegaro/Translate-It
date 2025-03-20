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
        className: "AIWritingCompanion-notification-error", // اضافه کردن کلاس CSS مربوط به نوع خطا
      },
      warning: {
        title: "هشدار - ترجمه خودکار",
        icon: CONFIG.ICON_WARNING,
        priority: 1,
        duration: 4000, // مدت زمان پیش فرض برای هشدار
        className: "AIWritingCompanion-notification-warning", // اضافه کردن کلاس CSS مربوط به نوع هشدار
      },
      success: {
        title: "موفقیت - ترجمه خودکار",
        icon: CONFIG.ICON_SUCCESS,
        priority: 0,
        duration: 3000, // مدت زمان پیش فرض برای موفقیت
        className: "AIWritingCompanion-notification-success", // اضافه کردن کلاس CSS مربوط به نوع موفقیت
      },
      info: {
        title: "اطلاعات - ترجمه خودکار",
        icon: CONFIG.ICON_INFO,
        priority: 0,
        duration: 3000, // مدت زمان پیش فرض برای اطلاعات
        className: "AIWritingCompanion-notification-info", // اضافه کردن کلاس CSS مربوط به نوع اطلاعات
      },
      status: {
        title: "وضعیت - ترجمه خودکار",
        icon: CONFIG.ICON_INFO,
        priority: 0,
        duration: 2000, // مدت زمان پیش فرض برای وضعیت
        className: "AIWritingCompanion-notification-status", // اضافه کردن کلاس CSS مربوط به نوع وضعیت
      },
      revert: {
        title: "بازگشت - ترجمه خودکار",
        icon: CONFIG.ICON_REVERT,
        priority: 0,
        duration: 1500, // مدت زمان پیش فرض برای بازگشت
        className: "AIWritingCompanion-notification-revert", // اضافه کردن کلاس CSS مربوط به نوع بازگشت
      },
    };

    if (typeof document !== "undefined") {
      this.container = this.createContainer();
    } else {
      this.container = null;
    }
  }

  createContainer() {
    const containerId = "AIWritingCompanion-translation-notifications";
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement("div");
      container.id = containerId;

      const commonStyles = {
        position: "fixed",
        top: "20px",
        zIndex: "10000000000",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      };

      Object.assign(container.style, commonStyles);

      if (CONFIG.NOTIFICATION_ALIGNMENT === "right") {
        container.style.right = "20px";
      } else {
        container.style.left = "20px";
      }

      document.body.appendChild(container);
    }

    if (CONFIG.TEXT_DIRECTION) {
      container.style.setProperty("--text-direction", CONFIG.TEXT_DIRECTION);
    }
    if (CONFIG.TEXT_ALIGNMENT) {
      container.style.setProperty("--text-alignment", CONFIG.TEXT_ALIGNMENT);
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
    notification.className = `AIWritingCompanion-translation-notification ${baseNotification.className || ""}`; // اضافه کردن کلاس اصلی و کلاس مربوط به نوع

    notification.innerHTML = `
      <span class="AIWritingCompanion-notification-icon">${icon}</span>
      <span class="AIWritingCompanion-notification-text">${message}</span>
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
