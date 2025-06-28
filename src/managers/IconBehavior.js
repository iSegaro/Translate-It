// src/managers/IconBehavior.js

import { state } from "../config.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { isExtensionContextValid, logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { translateFieldViaSmartHandler } from "../handlers/smartTranslationIntegration.js";

export default function setupIconBehavior(
  icon,
  target,
  translationHandler,
  notifier,
  strategies
) {
  if (!icon || !target) return;

  let isCleanedUp = false;
  let resizeObserver;
  const rafIds = new Set();

  const cleanupIcon = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    // 1. لغو فریم‌های انیمیشن
    rafIds.forEach((id) => cancelAnimationFrame(id));
    // 2. قطع observerها
    resizeObserver?.disconnect();
    // mutationObserver?.disconnect();

    // 3. حذف event listenerها
    icon.removeEventListener("click", clickHandler);
    icon.removeEventListener("blur", blurHandler);
    target.removeEventListener("blur", blurHandler);

    // 4. حذف فیزیکی المان با افکت fade
    icon.classList.add("fade-out");
    setTimeout(() => icon.remove(), 50);

    // 5. ریست وضعیت
    state.activeTranslateIcon = null;
  };

  const clickHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isExtensionContextValid()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      err.context = "iconbehavior-click-context";
      throw err;
    }

    let statusNode = null;
    try {
      const platform = detectPlatform(target);
      const text = strategies[platform].extractText(target);
      if (!text) return;
      statusNode = notifier.show(
        (await getTranslationString("STATUS_TRANSLATING_ICON")) ||
          "در حال ترجمه...",
        "status",
        false
      );
      await translateFieldViaSmartHandler({ text, target, translationHandler });
    } catch (err) {
      logME("[IconBehavior] ", err);
    } finally {
      if (statusNode) notifier.dismiss(statusNode);
      cleanupIcon();
    }
  };

  const blurHandler = (e) => {
    if (!e.relatedTarget || !icon.contains(e.relatedTarget)) {
      // تأخیر برای جلوگیری از تداخل با کلیک
      setTimeout(cleanupIcon, 50);
    }
  };

  const updatePosition = () => {
    if (!target.isConnected || !icon.isConnected) {
      cleanupIcon();
      return;
    }
    const id = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const iconHeight = icon.offsetHeight || 24;

      // --- شروع منطق شرطی جدید ---

      // آستانه فاصله از بالای صفحه (به پیکسل)
      // اگر بالای فیلد از این مقدار به بالای صفحه نزدیک‌تر باشد، آیکون به زیر منتقل می‌شود.
      // این مقدار باید حداقل به اندازه ارتفاع آیکون + حاشیه باشد تا منطقی باشد.
      const topThreshold = 40;

      // بررسی شرط: آیا فیلد متنی به بالای صفحه خیلی نزدیک است؟
      if (rect.top < topThreshold) {
        
        // حالت ۱: فیلد نزدیک به بالای صفحه است -> آیکون را زیر فیلد قرار بده
        
        // محاسبه موقعیت عمودی (top):
        // rect.bottom: موقعیت لبه‌ی پایینی فیلد.
        // + 5: یک حاشیه ۵ پیکسلی از پایین.
        icon.style.top = `${rect.bottom + window.scrollY + 5}px`;

      } else {
        
        // حالت ۲: فیلد به اندازه کافی از بالای صفحه فاصله دارد -> آیکون را بالای فیلد قرار بده (رفتار پیش‌فرض)

        // محاسبه موقعیت عمودی (top):
        // rect.top: موقعیت لبه‌ی بالایی فیلد.
        // - iconHeight: ارتفاع خود آیکون را کم می‌کنیم تا به بالا منتقل شود.
        // - 5: یک حاشیه ۵ پیکسلی از بالا.
        icon.style.top = `${rect.top + window.scrollY - iconHeight - 5}px`;
      }

      // محاسبه موقعیت افقی (left) در هر دو حالت یکسان است:
      // آیکون در سمت راست فیلد قرار می‌گیرد.
      icon.style.left = `${rect.right + window.scrollX + 5}px`;

      // --- پایان منطق شرطی ---

      icon.style.display = "block";
      icon.classList.add("fade-in");
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
    resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(target);

    icon.addEventListener("click", clickHandler);
    icon.addEventListener("blur", blurHandler);
    target.addEventListener("blur", blurHandler);
    // 6. موقعیت دهی اولیه
    updatePosition();

    // 7. ثبت در state
    state.activeTranslateIcon = icon;
  } catch (err) {
    cleanupIcon();
    translationHandler.errorHandler.handle(err, {
      type: ErrorTypes.UI,
      context: "IconBehavior-setup",
    });
  }
}
