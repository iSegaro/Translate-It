// src/subtitle/SubtitleManager.js

import YouTubeSubtitleHandler from "./YouTubeSubtitleHandler.js";
import NetflixSubtitleHandler from "./NetflixSubtitleHandler.js";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";

export default class SubtitleManager {
  constructor(translationProvider, errorHandler, notifier) {
    this.translationProvider = translationProvider;
    this.errorHandler = errorHandler;
    this.notifier = notifier;
    this.currentHandler = null;
    this.isEnabled = false;
    
    // تعریف handler های پشتیبانی شده
    this.supportedHandlers = [
      {
        handler: YouTubeSubtitleHandler,
        pattern: /youtube\.com|youtu\.be/,
        name: "YouTube"
      },
      {
        handler: NetflixSubtitleHandler,
        pattern: /netflix\.com/,
        name: "Netflix"
      }
    ];

    this.setupUrlListener();
  }

  // شناسایی سایت فعلی و انتخاب handler مناسب
  detectCurrentHandler() {
    const currentUrl = window.location.href;
    
    for (const { handler, pattern, name } of this.supportedHandlers) {
      if (pattern.test(currentUrl)) {
        logME(`[SubtitleManager] Detected ${name} site`);
        return handler;
      }
    }
    
    return null;
  }

  // بررسی اینکه آیا در سایت ویدیویی هستیم
  isVideoSite() {
    return this.detectCurrentHandler() !== null;
  }

  // شروع ترجمه زیرنویس
  async start() {
    if (this.isEnabled) {
      logME("[SubtitleManager] Already enabled");
      return true;
    }

    const HandlerClass = this.detectCurrentHandler();
    if (!HandlerClass) {
      logME("[SubtitleManager] No suitable handler found for current site");
      return false;
    }

    try {
      // ایجاد handler جدید
      this.currentHandler = new HandlerClass(
        this.translationProvider,
        this.errorHandler,
        this.notifier
      );

      // شروع handler
      const started = await this.currentHandler.start();
      
      if (started) {
        this.isEnabled = true;
        logME(`[SubtitleManager] Started with ${HandlerClass.name}`);
        return true;
      } else {
        this.currentHandler = null;
        logME("[SubtitleManager] Failed to start handler");
        return false;
      }
    } catch (error) {
      this.currentHandler = null;
      this.errorHandler?.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: "subtitle-manager-start",
      });
      return false;
    }
  }

  // توقف ترجمه زیرنویس
  stop() {
    if (!this.isEnabled) {
      return;
    }

    try {
      if (this.currentHandler) {
        this.currentHandler.stop();
        this.currentHandler = null;
      }

      this.isEnabled = false;
      logME("[SubtitleManager] Stopped");
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: "subtitle-manager-stop",
      });
    }
  }

  // تغییر وضعیت (فعال/غیرفعال)
  async toggle() {
    if (this.isEnabled) {
      this.stop();
      return false;
    } else {
      return await this.start();
    }
  }

  // به‌روزرسانی translation provider
  updateTranslationProvider(newProvider) {
    this.translationProvider = newProvider;
    
    if (this.currentHandler) {
      this.currentHandler.translationProvider = newProvider;
    }
  }

  // تنظیم listener برای تغییر URL
  setupUrlListener() {
    let lastUrl = window.location.href;
    
    // بررسی دوره‌ای تغییر URL
    const checkUrl = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        this.handleUrlChange();
      }
    };

    setInterval(checkUrl, 1000);

    // نیز گوش دادن به popstate
    window.addEventListener("popstate", () => {
      setTimeout(() => this.handleUrlChange(), 100);
    });
  }

  // مدیریت تغییر URL
  async handleUrlChange() {
    const newHandlerClass = this.detectCurrentHandler();
    
    // اگر سایت جدید پشتیبانی نمی‌شود
    if (!newHandlerClass) {
      if (this.isEnabled) {
        this.stop();
      }
      return;
    }

    // اگر همان handler است
    if (this.currentHandler && this.currentHandler.constructor === newHandlerClass) {
      this.currentHandler.handleUrlChange();
      return;
    }

    // اگر handler تغییر کرده
    if (this.isEnabled) {
      this.stop();
      // تاخیر کوتاه برای بارگذاری صفحه
      setTimeout(() => this.start(), 500);
    }
  }

  // دریافت وضعیت فعلی
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      currentHandler: this.currentHandler?.constructor?.name || null,
      supportedSites: this.supportedHandlers.map(h => h.name),
      isVideoSite: this.isVideoSite(),
      currentUrl: window.location.href,
    };
  }

  // پاک‌سازی منابع
  destroy() {
    this.stop();
    this.translationProvider = null;
    this.errorHandler = null;
    this.notifier = null;
    this.supportedHandlers = [];
  }
}

// توابع کمکی برای export
export function isVideoSite() {
  const videoSitePatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /netflix\.com/,
  ];
  
  const currentUrl = window.location.href;
  return videoSitePatterns.some(pattern => pattern.test(currentUrl));
}

export function createSubtitleManager(translationProvider, errorHandler, notifier) {
  return new SubtitleManager(translationProvider, errorHandler, notifier);
}