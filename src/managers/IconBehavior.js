// src/managers/IconBehavior.js
import { state, TranslationMode } from "../config.js";
import { translateText } from "../utils/api.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorService.js";
import { logME } from "../utils/helpers.js";

export default function setupIconBehavior(
  icon,
  target,
  translationHandler,
  notifier,
  strategies
) {
  if (!icon || !target) return;

  let isCleanedUp = false; // فلگ برای جلوگیری از پاکسازی تکراری
  let statusNotification;
  let resizeObserver;
  let mutationObserver;
  const rafIds = new Set();

  const cleanup_icon = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    try {
      // 1. لغو فریم‌های انیمیشن
      rafIds.forEach((id) => cancelAnimationFrame(id));
      rafIds.clear();

      // 2. قطع observerها
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();

      // 3. حذف event listenerها
      icon.removeEventListener("click", clickHandler);
      icon.removeEventListener("blur", handleBlur);
      target.removeEventListener("blur", handleBlur);

      // 4. حذف فیزیکی المان با افکت fade
      if (icon && icon.isConnected) {
        icon.classList.add("fade-out"); // اضافه کردن کلاس fade-out

        // حذف آیکون بعد از اتمام انیمیشن fade-out (مطابق با مدت زمان transition در CSS)
        setTimeout(() => {
          if (icon && icon.isConnected) {
            // اطمینان از اینکه آیکون هنوز در DOM است
            icon.remove();
          }
        }, 50); // 0.5 میلی ثانیه (مطابق با مدت زمان transition در CSS)
      }

      // 5. ریست وضعیت
      state.activeTranslateIcon = null;
    } catch (cleanupError) {
      translationHandler.errorHandler.handle(cleanupError, {
        type: ErrorTypes.UI,
        context: "icon-cleanup",
      });
    }
  };

  const clickHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    let notif = null;
    try {
      const platform = detectPlatform(target);
      const text = strategies[platform].extractText(target);
      if (!text) {
        logME("[IconBehavior] متن انتخاب شده خالی است.");
        return;
      }

      notif = notifier.show("در حال ترجمه...", "status", false);

      const translated = await translateText(
        text,
        TranslationMode.SelectElement
      );

      if (translated) {
        await translationHandler.updateTargetElement(target, translated);
      } else {
        logME("[IconBehavior] نتیجه ترجمه دریافت نشد.");
      }

      if (notif) {
        notifier.dismiss(notif);
      }
    } catch (error) {
      logME("[IconBehavior] خطا در فراخوانی ترجمه:", error);
    } finally {
      if (notif) {
        notifier.dismiss(notif);
      }
      cleanup_icon();
    }
  };

  // 3. مدیریت رویداد blur
  const handleBlur = (e) => {
    if (
      !e.relatedTarget ||
      (e.relatedTarget !== icon && !icon.contains(e.relatedTarget))
    ) {
      // تأخیر برای جلوگیری از تداخل با کلیک
      setTimeout(cleanup_icon, 50);
    }
  };

  const updatePosition = () => {
    if (!target.isConnected || !icon.isConnected) {
      cleanup_icon();
      return;
    }

    const id = requestAnimationFrame(() => {
      try {
        const rect = target.getBoundingClientRect();
        if (
          !rect ||
          rect.width + rect.height === 0 ||
          rect.top < 0 ||
          rect.left < 0
        ) {
          // throw new Error("موقعیت اِلمان نامعتبر است");
        }

        // ابتدا کلاس fade-in-initial را اضافه می‌کنیم تا آیکون مخفی باشد
        icon.classList.add("fade-in-initial");
        icon.style.display = "block"; // نمایش بلاک برای اعمال موقعیت

        icon.style.top = `${Math.round(rect.bottom + window.scrollY + 5)}px`;
        icon.style.left = `${Math.round(rect.left + window.scrollX)}px`;

        // بعد از یک فریم (برای اطمینان از اعمال استایل اولیه)، کلاس fade-in را اضافه می‌کنیم
        requestAnimationFrame(() => {
          icon.classList.remove("fade-in-initial");
          icon.classList.add("fade-in");
        });
      } catch (error) {
        translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.UI,
          context: "icon-positioning",
        });
        cleanup_icon();
      }
    });
    rafIds.add(id);
  };

  try {
    // اعتبارسنجی اولیه
    if (!(icon instanceof HTMLElement) || !icon.isConnected) {
      // throw new Error("آیکون معتبر نیست");
      logME("[IconBehavior] آیکون معتبر نیست");
    }

    if (!target.isConnected || !document.contains(target)) {
      // throw new Error("[IconBehavior] المان هدف در DOM وجود ندارد");
      logME("[IconBehavior] المان هدف در DOM وجود ندارد");
    }

    // تنظیمات اولیه موقعیت
    icon.style.display = "none";
    document.body.appendChild(icon);

    // 1. تنظیم observer برای تغییر سایز
    resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(target);

    // 4. افزودن event listeners
    icon.addEventListener("click", clickHandler);
    target.addEventListener("blur", handleBlur);
    icon.addEventListener("blur", handleBlur);

    // 5. مشاهده تغییرات DOM
    mutationObserver = new MutationObserver((mutations) => {
      if (!document.contains(target) || !document.contains(icon)) {
        cleanup_icon();
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 6. موقعیت دهی اولیه
    updatePosition();

    // 7. ثبت در state
    state.activeTranslateIcon = icon;
  } catch (error) {
    cleanup_icon();
    translationHandler.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "setup-icon-behavior",
      element: target?.tagName,
    });
  }
}
