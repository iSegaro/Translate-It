// src/handlers/subtitleHandler.js

import { createSubtitleManager, isVideoSite } from "../subtitle/index.js";
import { translateText } from "../core/api.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { logME } from "../utils/helpers.js";

export class SubtitleIntegrationHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.subtitleManager = null;
    this.urlObserver = null;
    this.lastUrl = window.location.href;
  }

  /**
   * راه‌اندازی اولیه ترجمه زیرنویس
   */
  async initialize() {
    try {
      // بررسی اینکه آیا در سایت ویدیویی هستیم
      if (!isVideoSite()) {
        logME("[SubtitleIntegration] Not a video site, skipping subtitle translation");
        return;
      }

      // بررسی فعال بودن قابلیت ترجمه زیرنویس از FeatureManager
      const isSubtitleEnabled = this.translationHandler.featureManager.isOn("SUBTITLE_TRANSLATION");
      if (!isSubtitleEnabled) {
        logME("[SubtitleIntegration] Subtitle translation is disabled");
        return;
      }

      // ایجاد translation provider object
      const translationProvider = {
        translate: translateText
      };

      // ایجاد SubtitleManager
      this.subtitleManager = createSubtitleManager(
        translationProvider,
        this.translationHandler.errorHandler,
        this.translationHandler.notifier
      );

      // راه‌اندازی
      const started = await this.subtitleManager.start();
      if (started) {
        logME("[SubtitleIntegration] Subtitle translation started successfully");
        
        // گوش دادن به تغییرات feature flag
        this.translationHandler.featureManager.on("SUBTITLE_TRANSLATION", () => {
          this.handleFeatureToggle();
        });

        // گوش دادن به تغییرات URL (برای SPA ها)
        this.setupUrlListener();
      } else {
        logME("[SubtitleIntegration] Failed to start subtitle translation");
      }
    } catch (error) {
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: "subtitle-integration-initialize",
      });
    }
  }

  /**
   * مدیریت تغییر وضعیت قابلیت ترجمه زیرنویس
   */
  handleFeatureToggle() {
    const isEnabled = this.translationHandler.featureManager.isOn("SUBTITLE_TRANSLATION");
    
    if (isEnabled && !this.subtitleManager?.isEnabled) {
      // فعال‌سازی
      this.subtitleManager?.start();
    } else if (!isEnabled && this.subtitleManager?.isEnabled) {
      // غیرفعال‌سازی
      this.subtitleManager?.stop();
    }
  }

  /**
   * گوش دادن به تغییرات URL برای SPA ها
   */
  setupUrlListener() {
    // MutationObserver برای تشخیص تغییرات DOM
    this.urlObserver = new MutationObserver(() => {
      if (window.location.href !== this.lastUrl) {
        this.lastUrl = window.location.href;
        this.handleUrlChange();
      }
    });

    this.urlObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // popstate listener برای navigation events
    window.addEventListener("popstate", () => {
      setTimeout(() => this.handleUrlChange(), 100);
    });
  }

  /**
   * مدیریت تغییر URL برای زیرنویس
   */
  async handleUrlChange() {
    if (!this.subtitleManager) return;

    try {
      await this.subtitleManager.handleUrlChange();
    } catch (error) {
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: "subtitle-integration-handleUrlChange",
      });
    }
  }

  /**
   * پاک‌سازی منابع
   */
  destroy() {
    // پاک‌سازی subtitle manager
    if (this.subtitleManager) {
      this.subtitleManager.destroy();
      this.subtitleManager = null;
    }

    // پاک‌سازی URL observer
    if (this.urlObserver) {
      this.urlObserver.disconnect();
      this.urlObserver = null;
    }

    // صفر کردن مراجع
    this.translationHandler = null;
  }
}

/**
 * تابع کمکی برای ایجاد و راه‌اندازی subtitle integration
 * @param {Object} translationHandler - نمونه TranslationHandler
 * @returns {SubtitleIntegrationHandler}
 */
export function createSubtitleIntegration(translationHandler) {
  return new SubtitleIntegrationHandler(translationHandler);
}