// src/managers/NotificationManager.js
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { fadeOut, logME } from "../utils/helpers.js";

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
        duration: 600, // مدت زمان پیش فرض برای بازگشت
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

    Browser.notifications
      .create({
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/512.png"), // استفاده از getURL برای مسیر صحیح آیکون
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
    const icon = baseNotification.icon || CONFIG[`ICON_${type.toUpperCase()}`];
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

    let timeoutId = null; // برای نگهداری شناسه تایمر autoDismiss

    const clickHandler = () => {
      logME(`Notification clicked: Type=${type}, Message=${message}`);

      // اگر تابع onClick سفارشی وجود دارد، آن را اجرا کن
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
    fadeOut(notification);
  }
}
