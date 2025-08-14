// src/subtitle/NetflixSubtitleHandler.js

import BaseSubtitleHandler from "./BaseSubtitleHandler.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'NetflixSubtitle');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export default class NetflixSubtitleHandler extends BaseSubtitleHandler {
  constructor(translationProvider, errorHandler, notifier) {
    super(translationProvider, errorHandler, notifier);
    this.currentMovieId = null;
    this.netflixPlayer = null;
  }

  getSitePattern() {
    return /netflix\.com/;
  }

  getSelectors() {
    return {
      container: ".player-timedtext, .ltr-1xbip9h",
      text: ".player-timedtext-text-container span, .player-timedtext p, .ltr-1xbip9h span",
      player: "video",
    };
  }

  extractSubtitleText(element) {
    try {
      // Netflix اغلب از چندین span استفاده می‌کند
      if (element.children.length > 0) {
        return Array.from(element.children)
          .map((child) => child.textContent)
          .join("")
          .trim();
      }

      return element.textContent?.trim() || "";
    } catch {
      return element.textContent?.trim() || "";
    }
  }

  // شناسایی movie ID فعلی
  getCurrentMovieId() {
    try {
      const url = window.location.href;
      const match = url.match(/\/watch\/(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // تلاش برای دسترسی به Netflix player API
  async waitForNetflixPlayer() {
    const maxWait = 5000; // 5 ثانیه
    const checkInterval = 500;
    let elapsed = 0;

    return new Promise((resolve) => {
      const check = () => {
        try {
          const videoPlayer =
            window?.netflix?.appContext?.state?.playerApp?.getAPI()
              ?.videoPlayer;
          if (videoPlayer) {
            this.netflixPlayer = videoPlayer;
            getLogger().debug('Netflix player API found');
            resolve(true);
          } else if (elapsed >= maxWait) {
            getLogger().debug('Netflix player API not found, using fallback',  );
            resolve(false);
          } else {
            elapsed += checkInterval;
            setTimeout(check, checkInterval);
          }
        } catch {
          if (elapsed >= maxWait) {
            resolve(false);
          } else {
            elapsed += checkInterval;
            setTimeout(check, checkInterval);
          }
        }
      };
      check();
    });
  }

  // Override start method برای تنظیمات خاص Netflix
  async start() {
    this.currentMovieId = this.getCurrentMovieId();

    if (!this.currentMovieId) {
      getLogger().debug('No movie ID found');
      return false;
    }

    // تلاش برای دسترسی به Netflix API
    await this.waitForNetflixPlayer();

    const result = await super.start();

    if (result) {
      this.setupNetflixSpecific();
    }

    return result;
  }

  // تنظیمات خاص Netflix
  setupNetflixSpecific() {
    // Style injection برای Netflix
    if (!document.querySelector("#netflix-subtitle-style")) {
      const style = document.createElement("style");
      style.id = "netflix-subtitle-style";
      style.textContent = `
        .player-timedtext-text-container {
          cursor: text !important;
          user-select: text !important;
          pointer-events: auto !important;
        }
        
        .player-timedtext:hover {
          background-color: rgba(0, 0, 0, 0.9) !important;
        }
        
        .ltr-1xbip9h {
          user-select: text !important;
          cursor: text !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Event delegation برای hover events
    document.addEventListener(
      "mouseenter",
      this.handleSubtitleHover.bind(this),
      true,
    );
    document.addEventListener(
      "mouseleave",
      this.handleSubtitleLeave.bind(this),
      true,
    );
  }

  handleSubtitleHover(event) {
    if (!event.target || typeof event.target.closest !== "function") {
      return;
    }

    const selectors = this.getSelectors();
    if (event.target.closest(selectors.container)) {
      this.pauseVideo();
    }
  }

  handleSubtitleLeave(event) {
    if (!event.target || typeof event.target.closest !== "function") {
      return;
    }

    const selectors = this.getSelectors();
    if (event.target.closest(selectors.container)) {
      this.resumeVideo();
    }
  }

  pauseVideo() {
    try {
      // تلاش برای استفاده از Netflix API
      if (this.netflixPlayer) {
        const playerSessionIds = this.netflixPlayer.getAllPlayerSessionIds();
        const sessionId = playerSessionIds?.[0];
        if (sessionId) {
          const player =
            this.netflixPlayer.getVideoPlayerBySessionId(sessionId);
          player?.pause?.();
          this.wasPlayingBeforePause = true;
          return;
        }
      }

      // Fallback به HTML5 video
      const video = document.querySelector(this.getSelectors().player);
      if (video && !video.paused) {
        video.pause();
        this.wasPlayingBeforePause = true;
      }
    } catch {
      // Ignore errors
    }
  }

  resumeVideo() {
    try {
      // تلاش برای استفاده از Netflix API
      if (this.netflixPlayer && this.wasPlayingBeforePause) {
        const playerSessionIds = this.netflixPlayer.getAllPlayerSessionIds();
        const sessionId = playerSessionIds?.[0];
        if (sessionId) {
          const player =
            this.netflixPlayer.getVideoPlayerBySessionId(sessionId);
          player?.play?.();
          this.wasPlayingBeforePause = false;
          return;
        }
      }

      // Fallback به HTML5 video
      const video = document.querySelector(this.getSelectors().player);
      if (video && this.wasPlayingBeforePause) {
        video.play();
        this.wasPlayingBeforePause = false;
      }
    } catch {
      // Ignore errors
    }
  }

  // Override updateSubtitleElement برای styling مخصوص Netflix
  updateSubtitleElement(element, originalText, translatedText) {
    try {
      // پیدا کردن parent container
      const parentContainer =
        element.closest(".player-timedtext-text-container") ||
        element.closest(".ltr-1xbip9h") ||
        element.parentElement;

      if (!parentContainer) {
        super.updateSubtitleElement(element, originalText, translatedText);
        return;
      }

      const container = document.createElement("div");
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 3px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        font-family: Netflix Sans, Helvetica Neue, Segoe UI, Roboto, Ubuntu, sans-serif;
        padding: 8px 12px;
        border-radius: 4px;
        max-width: 80%;
        margin: 0 auto;
      `;

      // متن ترجمه شده
      const translatedSpan = document.createElement("div");
      translatedSpan.textContent = translatedText;
      translatedSpan.style.cssText = `
        font-weight: bold;
        font-size: 1.1em;
        line-height: 1.4;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      `;

      // متن اصلی
      const originalSpan = document.createElement("div");
      originalSpan.textContent = originalText;
      originalSpan.style.cssText = `
        font-size: 0.9em;
        opacity: 0.85;
        line-height: 1.3;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
      `;

      container.appendChild(translatedSpan);
      container.appendChild(originalSpan);

      // جایگزینی محتوا در parent container
      parentContainer.textContent = "";
      parentContainer.appendChild(container);
      parentContainer.dataset.translated = "true";
      parentContainer.dataset.originalText = originalText;

      logME(
        `[NetflixSubtitleHandler] Updated subtitle: "${originalText}" -> "${translatedText}"`,
      );
    } catch {
      // Fallback to parent method
      super.updateSubtitleElement(element, originalText, translatedText);
    }
  }

  // Override setupPeriodicCheck با فرکانس بیشتر برای Netflix
  setupPeriodicCheck() {
    this.checkInterval = setInterval(() => {
      this.processSubtitles();
    }, 500); // بررسی سریع‌تر برای Netflix
  }

  // مدیریت تغییر URL
  handleUrlChange() {
    const newMovieId = this.getCurrentMovieId();

    if (newMovieId !== this.currentMovieId) {
      this.currentMovieId = newMovieId;
      getLogger().debug('Movie changed to: ${newMovieId}');
      super.handleUrlChange();
    }
  }

  // پاک‌سازی Netflix specific resources
  destroy() {
    // Remove event listeners
    document.removeEventListener("mouseenter", this.handleSubtitleHover, true);
    document.removeEventListener("mouseleave", this.handleSubtitleLeave, true);

    // Remove styles
    const style = document.querySelector("#netflix-subtitle-style");
    if (style) {
      style.remove();
    }

    this.netflixPlayer = null;
    this.currentMovieId = null;

    super.destroy();
  }
}
