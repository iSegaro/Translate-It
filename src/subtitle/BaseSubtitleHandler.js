// src/subtitle/BaseSubtitleHandler.js

import { logME } from "../utils/core/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { TranslationMode } from "../config.js";

export default class BaseSubtitleHandler {
  constructor(translationProvider, errorHandler, notifier) {
    this.translationProvider = translationProvider;
    this.errorHandler = errorHandler;
    this.notifier = notifier;
    this.isActive = false;
    this.translationCache = new Map();
    this.lastProcessedText = "";
    this.observer = null;
    this.checkInterval = null;
  }

  // متدهای اجباری که باید در کلاس‌های فرزند پیاده‌سازی شوند
  getSitePattern() {
    throw new Error("getSitePattern must be implemented");
  }

  getSelectors() {
    throw new Error("getSelectors must be implemented");
  }

  extractSubtitleText() {
    throw new Error("extractSubtitleText must be implemented");
  }

  // بررسی سازگاری با سایت
  isCompatibleSite() {
    return this.getSitePattern().test(window.location.href);
  }

  // شروع نظارت بر زیرنویس‌ها
  async start() {
    if (this.isActive) return true;

    if (!this.isCompatibleSite()) {
      logME(`[${this.constructor.name}] Site not compatible`);
      return false;
    }

    try {
      this.isActive = true;
      await this.waitForSubtitleContainer();
      this.setupObserver();
      this.setupPeriodicCheck();

      logME(`[${this.constructor.name}] Subtitle translation started`);
      // const startMessage = await getTranslationString("SUBTITLE_TRANSLATION_STARTED");
      // this.notifier?.show(startMessage, "success", 2000);
      return true;
    } catch (error) {
      this.isActive = false;
      this.errorHandler?.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: `${this.constructor.name}-start`,
      });
      return false;
    }
  }

  // توقف نظارت
  async stop() {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.translationCache.clear();
    this.lastProcessedText = "";

    logME(`[${this.constructor.name}] Subtitle translation stopped`);
    // const stopMessage = await getTranslationString("SUBTITLE_TRANSLATION_STOPPED");
    // this.notifier?.show(stopMessage, "info", 2000);
  }

  // انتظار برای کانتینر زیرنویس
  async waitForSubtitleContainer() {
    const selectors = this.getSelectors();
    const maxWait = 5000; // 5 ثانیه (کمتر تا سریع‌تر باشد)
    const checkInterval = 500;
    let elapsed = 0;

    return new Promise((resolve) => {
      const check = () => {
        const container = document.querySelector(selectors.container);
        if (container) {
          logME(`[${this.constructor.name}] Subtitle container found`);
          resolve(container);
        } else if (elapsed >= maxWait) {
          logME(
            `[${this.constructor.name}] Subtitle container not found after ${maxWait}ms, but continuing`,
          );
          // بجای reject کردن، resolve می‌کنیم تا ادامه پیدا کند
          resolve(null);
        } else {
          elapsed += checkInterval;
          setTimeout(check, checkInterval);
        }
      };
      check();
    });
  }

  // تنظیم MutationObserver
  setupObserver() {
    const selectors = this.getSelectors();
    const container = document.querySelector(selectors.container);

    if (!container) {
      logME(
        `[${this.constructor.name}] No container found for observer, will use periodic check only`,
      );
      return;
    }

    logME(
      `[${this.constructor.name}] Setting up MutationObserver on container`,
    );

    this.observer = new MutationObserver((mutations) => {
      let hasChanges = false;

      for (const mutation of mutations) {
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          hasChanges = true;
          break;
        }
      }

      if (hasChanges) {
        // Debounce for performance
        setTimeout(() => this.processSubtitles(), 200);
      }
    });

    this.observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // بررسی دوره‌ای (fallback)
  setupPeriodicCheck() {
    this.checkInterval = setInterval(() => {
      this.processSubtitles();
    }, 1000);
  }

  // پردازش زیرنویس‌ها
  async processSubtitles() {
    if (!this.isActive) return;

    try {
      const selectors = this.getSelectors();
      const subtitleElements = document.querySelectorAll(selectors.text);

      for (const element of subtitleElements) {
        await this.processSingleSubtitle(element);
      }
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: `${this.constructor.name}-processSubtitles`,
      });
    }
  }

  // پردازش یک زیرنویس
  async processSingleSubtitle(element) {
    if (this.isTranslated(element)) return;

    const originalText = this.extractSubtitleText(element);
    if (!originalText || originalText === this.lastProcessedText) return;

    this.lastProcessedText = originalText;

    try {
      const translatedText = await this.translateText(originalText);
      if (translatedText && translatedText !== originalText) {
        this.updateSubtitleElement(element, originalText, translatedText);
      }
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: `${this.constructor.name}-processSingleSubtitle`,
      });
    }
  }

  // ترجمه متن با cache
  async translateText(text) {
    if (this.translationCache.has(text)) {
      return this.translationCache.get(text);
    }

    try {
      if (!this.translationProvider) {
        logME(`Translation provider not available for: ${text}`);
        return null;
      }

      // بررسی اینکه آیا translate method وجود دارد
      if (typeof this.translationProvider.translate !== "function") {
        logME(
          `Translation provider does not have translate method for: ${text}`,
        );
        return null;
      }

      const result = await this.translationProvider.translate(
        text,
        TranslationMode.Subtitle,
      );
      const translatedText = result?.translatedText || result;

      this.translationCache.set(text, translatedText);
      return translatedText;
    } catch (error) {
      logME(`Translation failed for: ${text}`, error);
      return null;
    }
  }

  // بررسی اینکه آیا المان قبلاً ترجمه شده
  isTranslated(element) {
    return element.dataset.translated === "true";
  }

  // به‌روزرسانی المان زیرنویس
  updateSubtitleElement(element, originalText, translatedText) {
    try {
      // ایجاد کانتینر دوزبانه
      const container = document.createElement("div");
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 2px;
      `;

      // متن ترجمه شده (اول)
      const translatedSpan = document.createElement("div");
      translatedSpan.textContent = translatedText;
      translatedSpan.style.cssText = `
        font-weight: bold;
        font-size: 1em;
        line-height: 1.3;
      `;

      // متن اصلی (دوم، کوچکتر)
      const originalSpan = document.createElement("div");
      originalSpan.textContent = originalText;
      originalSpan.style.cssText = `
        font-size: 0.85em;
        opacity: 0.8;
        line-height: 1.2;
      `;

      container.appendChild(translatedSpan);
      container.appendChild(originalSpan);

      // جایگزینی محتوا
      element.textContent = "";
      element.appendChild(container);
      element.dataset.translated = "true";
      element.dataset.originalText = originalText;

      logME(
        `[${this.constructor.name}] Translated: "${originalText}" -> "${translatedText}"`,
      );
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.UI,
        context: `${this.constructor.name}-updateSubtitleElement`,
      });
    }
  }

  // مدیریت تغییر URL
  handleUrlChange() {
    if (this.isActive) {
      this.stop();
      // مقداری تاخیر برای بارگذاری صفحه جدید
      setTimeout(() => this.start(), 1000);
    }
  }

  // پاک‌سازی
  destroy() {
    this.stop();
    this.translationProvider = null;
    this.errorHandler = null;
    this.notifier = null;
  }
}
