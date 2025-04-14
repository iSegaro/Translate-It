// src/managers/NotificationManager.js
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { logME } from "../utils/helpers.js";

// در صورتی که CONFIG تعریف نشده باشد یا برخی کلیدهای آن مقداردهی نشده باشند، از مقادیر پیش‌فرض استفاده می‌کنیم:
const safeConfig = {
  ICON_ERROR: CONFIG?.ICON_ERROR ?? "❌",
  ICON_WARNING: CONFIG?.ICON_WARNING ?? "⚠️",
  ICON_SUCCESS: CONFIG?.ICON_SUCCESS ?? "✅",
  ICON_INFO: CONFIG?.ICON_INFO ?? "🔵",
  ICON_REVERT: CONFIG?.ICON_REVERT ?? "",
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
        priority: 2,
        duration: 5000, // مدت زمان پیش‌فرض برای خطا
        className: "AIWritingCompanion-notification-error",
      },
      warning: {
        title: "هشدار - ترجمه خودکار",
        icon: safeConfig.ICON_WARNING,
        priority: 1,
        duration: 4000, // مدت زمان پیش‌فرض برای هشدار
        className: "AIWritingCompanion-notification-warning",
      },
      success: {
        title: "موفقیت - ترجمه خودکار",
        icon: safeConfig.ICON_SUCCESS,
        priority: 0,
        duration: 3000, // مدت زمان پیش‌فرض برای موفقیت
        className: "AIWritingCompanion-notification-success",
      },
      info: {
        title: "اطلاعات - ترجمه خودکار",
        icon: safeConfig.ICON_INFO,
        priority: 0,
        duration: 3000, // مدت زمان پیش‌فرض برای اطلاعات
        className: "AIWritingCompanion-notification-info",
      },
      status: {
        title: "وضعیت - ترجمه خودکار",
        icon: safeConfig.ICON_INFO,
        priority: 0,
        duration: 2000, // مدت زمان پیش‌فرض برای وضعیت
        className: "AIWritingCompanion-notification-status",
      },
      integrate: {
        title: "اتصال به صفحه - ترجمه خودکار",
        icon: safeConfig.ICON_INFO,
        priority: 0,
        duration: 2000,
        className: "AIWritingCompanion-notification-status",
      },
      revert: {
        title: "بازگشت - ترجمه خودکار",
        icon: safeConfig.ICON_REVERT,
        priority: 0,
        duration: 600,
        className: "AIWritingCompanion-notification-revert",
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

      if (safeConfig.NOTIFICATION_ALIGNMENT === "right") {
        container.style.right = "20px";
      } else {
        container.style.left = "20px";
      }

      document.body.appendChild(container);
    }

    if (safeConfig.NOTIFICATION_TEXT_DIRECTION) {
      container.style.setProperty(
        "--text-direction",
        safeConfig.NOTIFICATION_TEXT_DIRECTION
      );
    }
    if (safeConfig.NOTIFICATION_TEXT_ALIGNMENT) {
      container.style.setProperty(
        "--text-alignment",
        safeConfig.NOTIFICATION_TEXT_ALIGNMENT
      );
    }

    return container;
  }

  // سایر متدها همانطور که در کد شما وجود دارد...
  showBackgroundNotification(message, type = "info", onClick) {
    const config = this.typeMapping[type] || this.typeMapping.info;

    Browser.notifications
      .create({
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/512.png"),
        title: config.title,
        message: message,
        priority: config.priority,
      })
      .then((notificationId) => {
        if (onClick) {
          const handleClick = (clickedId) => {
            if (clickedId === notificationId) {
              onClick();
              Browser.notifications.clear(notificationId);
              Browser.notifications.onClicked.removeListener(handleClick);
            }
          };
          Browser.notifications.onClicked.addListener(handleClick);
        }
      })
      .catch((error) => {
        console.error(
          "NotificationManager: Error creating notification:",
          error
        );
      });
  }

  show(message, type = "info", autoDismiss = true, duration = null, onClick) {
    if (!this.container) {
      return this.showBackgroundNotification(message, type, onClick);
    }

    const baseNotification = this.typeMapping[type] || this.typeMapping.info;
    const finalDuration = duration || baseNotification.duration;
    const icon =
      baseNotification.icon || safeConfig[`ICON_${type.toUpperCase()}`];
    const notification = document.createElement("div");
    notification.className = `AIWritingCompanion-translation-notification ${baseNotification.className || ""}`;

    let iconHtml = "";
    if (icon) {
      iconHtml = `<span class="AIWritingCompanion-notification-icon">${icon}</span>`;
    }

    notification.innerHTML = `
      ${iconHtml}
      <span class="AIWritingCompanion-notification-text">${message}</span>
    `;

    let timeoutId = null;

    const clickHandler = () => {
      logME(`Notification clicked: Type=${type}, Message=${message}`);

      if (typeof onClick === "function") {
        try {
          onClick();
        } catch (e) {
          logME(
            "NotificationManager: Error executing notification onClick handler:",
            e
          );
        }
      }

      // همیشه نوتیفیکیشن را dismiss کن
      this.dismiss(notification);

      // اگر تایمر autoDismiss در حال اجرا بود، آن را پاک کن
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // حذف listener برای جلوگیری از فراخوانی مجدد یا نشت حافظه
      // (گرچه با حذف notification ممکن است خودکار حذف شود، اما این کار صریح بهتر است)
      notification.removeEventListener("click", clickHandler);
    };

    notification.addEventListener("click", clickHandler);

    this.container.appendChild(notification);

    /** __نکته مهم__
     * اعلان‌های وضعیت، نمایش وضعیت ترجمه هستند
     * که در منطق برنامه به کار گرفته شده‌اند
     * و نباید autodismis شوند
     */
    if (autoDismiss && type !== "status") {
      timeoutId = setTimeout(() => {
        // قبل از dismiss بررسی کن که آیا notification هنوز در DOM وجود دارد
        // (ممکن است توسط کلیک کاربر زودتر حذف شده باشد)
        if (notification.parentNode === this.container) {
          this.dismiss(notification);
        }
        // حذف listener در صورت autoDismiss
        notification.removeEventListener("click", clickHandler);
        timeoutId = null; // ریست کردن شناسه تایمر
      }, finalDuration);
    }

    return notification;
  }

  dismiss(notification) {
    try {
      notification.style.transition = "opacity 0.5s";
      notification.style.opacity = "0";
      setTimeout(() => notification.remove(), 500);
    } catch (error) {
      // logME("[NotificationManager] dismiss: error", error);
    }
  }
}
