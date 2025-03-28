// src/managers/IconBehavior.js
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorService.js";

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

  const cleanup = () => {
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

      // 4. حذف فیزیکی المان فقط اگر وجود دارد
      if (icon.isConnected) {
        icon.remove();
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

    try {
      // غیرفعال کردن المان قبل از حذف
      icon.style.pointerEvents = "none";
      icon?.remove();

      const platform = detectPlatform(target);
      const text = strategies[platform].extractText(target);
      if (!text) return;

      statusNotification = notifier.show("در حال ترجمه...", "status", false);

      const translated = await translateText(text);

      if (translated) {
        await translationHandler.updateTargetElement(target, translated);
      } else {
        // console.debug("[IconBehavior] No translation result: ", translated);
      }
    } catch (error) {
      // const resolvedError = await Promise.resolve(error);
      // console.debug("[IconBehavior] setupIconBehavior: ", resolvedError);
    } finally {
      if (statusNotification) {
        notifier.dismiss(statusNotification);
      }
      cleanup();
    }
  };

  // 3. مدیریت رویداد blur
  const handleBlur = (e) => {
    if (
      !e.relatedTarget ||
      (e.relatedTarget !== icon && !icon.contains(e.relatedTarget))
    ) {
      // تأخیر برای جلوگیری از تداخل با کلیک
      setTimeout(cleanup, 50);
    }
  };

  const updatePosition = () => {
    if (!target.isConnected || !icon.isConnected) {
      cleanup();
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

        icon.style.display = "block";
        icon.style.top = `${Math.round(rect.bottom + window.scrollY + 5)}px`;
        icon.style.left = `${Math.round(rect.left + window.scrollX)}px`;
      } catch (error) {
        translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.UI,
          context: "icon-positioning",
        });
        cleanup();
      }
    });
    rafIds.add(id);
  };

  try {
    // اعتبارسنجی اولیه
    if (!(icon instanceof HTMLElement) || !icon.isConnected) {
      // throw new Error("آیکون معتبر نیست");
      console.debug("[IconBehavior] آیکون معتبر نیست");
    }

    if (!target.isConnected || !document.contains(target)) {
      // throw new Error("[IconBehavior] المان هدف در DOM وجود ندارد");
      console.debug("[IconBehavior] المان هدف در DOM وجود ندارد");
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
        cleanup();
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
    cleanup();
    translationHandler.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "setup-icon-behavior",
      element: target?.tagName,
    });
  }
}
