// src/subtitle/YouTubeSubtitleHandler.js

import BaseSubtitleHandler from "./BaseSubtitleHandler.js";
import { logME } from "../utils/helpers.js";

export default class YouTubeSubtitleHandler extends BaseSubtitleHandler {
  constructor(translationProvider, errorHandler, notifier) {
    super(translationProvider, errorHandler, notifier);
    this.currentVideoId = null;
    this.currentLineIndex = 0; // ایندکس خط فعلی برای نوشتن
    this.maxLines = 3; // تعداد ثابت خطوط در کادر
    this.setupNavigationListener();
  }

  getSitePattern() {
    return /youtube\.com|youtu\.be/;
  }

  getSelectors() {
    return {
      container: ".ytp-caption-window-container",
      text: ".ytp-caption-segment",
      player: "#movie_player video"
    };
  }

  extractSubtitleText(element) {
    try {
      // YouTube اغلب از span های متعدد استفاده می‌کند
      const spans = element.querySelectorAll("span");
      if (spans.length > 0) {
        return Array.from(spans)
          .map(span => span.textContent)
          .join(" ")
          .trim();
      }
      
      return element.textContent?.trim() || "";
    } catch {
      return element.textContent?.trim() || "";
    }
  }

  // شناسایی ویدیو فعلی
  getCurrentVideoId() {
    const url = window.location.href;
    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];

    // برای Shorts
    match = url.match(/\/shorts\/([^/?&]+)/);
    if (match) return match[1];

    // برای embed
    match = url.match(/\/embed\/([^/?&]+)/);
    if (match) return match[1];

    return null;
  }

  // تنظیم listener برای navigation در YouTube SPA
  setupNavigationListener() {
    // Override pushState and replaceState
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = (...args) => {
      originalPushState.apply(window.history, args);
      setTimeout(() => this.handleNavigationChange(), 100);
    };

    window.history.replaceState = (...args) => {
      originalReplaceState.apply(window.history, args);
      setTimeout(() => this.handleNavigationChange(), 100);
    };

    // Listen for popstate
    window.addEventListener("popstate", () => {
      setTimeout(() => this.handleNavigationChange(), 100);
    });
  }

  // مدیریت تغییر navigation
  handleNavigationChange() {
    const newVideoId = this.getCurrentVideoId();
    
    if (newVideoId !== this.currentVideoId) {
      this.currentVideoId = newVideoId;
      logME(`[YouTubeSubtitleHandler] Video changed to: ${newVideoId}`);
      
      if (this.isActive) {
        this.handleUrlChange();
      }
    }
  }

  // Override start method برای تنظیمات خاص YouTube
  async start() {
    this.currentVideoId = this.getCurrentVideoId();
    
    // اگر video ID نیست، منتظر بمان تا ویدیو بارگذاری شود
    if (!this.currentVideoId) {
      logME("[YouTubeSubtitleHandler] No video ID found, waiting for video to load...");
      
      // منتظر بمان تا video ID پیدا شود (حداکثر 10 ثانیه)
      const maxWait = 10000;
      const checkInterval = 1000;
      let elapsed = 0;

      while (!this.currentVideoId && elapsed < maxWait) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        this.currentVideoId = this.getCurrentVideoId();
        elapsed += checkInterval;
      }

      if (!this.currentVideoId) {
        logME("[YouTubeSubtitleHandler] Still no video ID after waiting, but continuing anyway");
        // ادامه می‌دهیم حتی بدون video ID - ممکن است بعداً پیدا شود
      }
    }

    const result = await super.start();
    
    if (result) {
      this.setupHoverPause();
    }
    
    return result;
  }

  // تنظیم pause on hover
  setupHoverPause() {
    
    // ایجاد کانتینر ثابت برای زیرنویس‌ها
    this.createFixedSubtitleContainer();
    
    // Style injection برای بهتر کردن UX
    if (!document.querySelector("#youtube-subtitle-style")) {
      const style = document.createElement("style");
      style.id = "youtube-subtitle-style";
      style.textContent = `
        /* مخفی کردن تمام زیرنویس‌های اصلی یوتوب */
        .ytp-caption-window-container {
          display: none !important;
        }
        
        /* کانتینر ثابت ما */
        #translate-it-subtitle-container {
          position: absolute !important;
          bottom: 60px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          z-index: 10000 !important;
          pointer-events: none !important;
          width: 80% !important;
          max-width: 600px !important;
        }
        
        /* کادر زیرنویس ثابت */
        .translate-it-subtitle-box {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          text-align: center !important;
          gap: 8px !important;
          background: rgba(8, 8, 8, 0.7) !important;
          color: white !important;
          font-family: YouTube Noto, Roboto, Arial, Helvetica, sans-serif !important;
          padding: 12px 14px !important;
          border-radius: 8px !important;
          box-shadow: rgba(0, 0, 0, 0.8) 0px 4px 12px !important;
          height: 165px !important;
          min-height: 165px !important;
          max-height: 165px !important;
          justify-content: flex-start !important;
          opacity: 0 !important;
          transition: opacity 0.3s ease !important;
          pointer-events: auto !important;
          overflow: hidden !important;
        }
        
        /* هر خط زیرنویس - ثابت */
        .subtitle-line {
          width: 100% !important;
          height: 45px !important;
          min-height: 45px !important;
          max-height: 45px !important;
          margin-bottom: 6px !important;
          opacity: 0.60 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: center !important;
        }
        
        .subtitle-line.active {
          opacity: 1 !important;
        }
        
        .subtitle-line.recent {
          opacity: 0.75 !important;
        }
        
        .translate-it-subtitle-box.visible {
          opacity: 1 !important;
        }
        
        .translate-it-subtitle-box:hover {
          background: rgba(8, 8, 8, 0.8) !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Event delegation برای hover events - بهبود یافته
    document.addEventListener("mouseenter", this.handleSubtitleHover.bind(this), true);
    document.addEventListener("mouseleave", this.handleSubtitleLeave.bind(this), true);
    
    // اضافه کردن hover events مستقیم به کادر زیرنویس
    this.setupDirectHoverEvents();
  }

  // ایجاد کانتینر ثابت برای زیرنویس‌ها
  createFixedSubtitleContainer() {
    // حذف کانتینر قبلی اگر وجود دارد
    const existingContainer = document.querySelector("#translate-it-subtitle-container");
    if (existingContainer) {
      existingContainer.remove();
    }

    // پیدا کردن video container
    const videoContainer = document.querySelector("#movie_player") || document.querySelector(".html5-video-container");
    if (!videoContainer) {
      logME("[YouTubeSubtitleHandler] Video container not found");
      return;
    }

    // ایجاد کانتینر جدید
    this.subtitleContainer = document.createElement("div");
    this.subtitleContainer.id = "translate-it-subtitle-container";
    
    // ایجاد کادر زیرنویس
    this.subtitleBox = document.createElement("div");
    this.subtitleBox.className = "translate-it-subtitle-box";
    
    // ایجاد 3 سطر ثابت
    this.subtitleLines = [];
    for (let i = 0; i < this.maxLines; i++) {
      const lineContainer = document.createElement("div");
      lineContainer.className = "subtitle-line";
      lineContainer.dataset.lineIndex = i;
      
      // متن خالی برای شروع
      lineContainer.innerHTML = `
        <div style="font-weight: bold; font-size: 1.4em; color: transparent;">مکان‌دار</div>
        <div style="font-size: 1.1em; color: transparent;">مکان‌دار</div>
      `;
      
      this.subtitleBox.appendChild(lineContainer);
      this.subtitleLines.push(lineContainer);
    }
    
    this.subtitleContainer.appendChild(this.subtitleBox);
    videoContainer.appendChild(this.subtitleContainer);
    
    // تنظیم hover events بعد از ایجاد کادر
    this.setupDirectHoverEvents();
    
    logME("[YouTubeSubtitleHandler] Fixed subtitle container created with 3 static lines");
  }

  // تنظیم hover events مستقیم روی کادر زیرنویس
  setupDirectHoverEvents() {
    if (!this.subtitleBox) return;

    this.subtitleBox.addEventListener('mouseenter', () => {
      logME("[YouTubeSubtitleHandler] Direct hover enter on subtitle box");
      this.pauseVideo();
    });

    this.subtitleBox.addEventListener('mouseleave', () => {
      logME("[YouTubeSubtitleHandler] Direct hover leave from subtitle box");
      this.resumeVideo();
    });
  }

  handleSubtitleHover(event) {
    if (!event.target || typeof event.target.closest !== 'function') return;
    
    // بررسی hover روی کادر زیرنویس ثابت ما
    if (event.target.closest(".translate-it-subtitle-box")) {
      this.pauseVideo();
    }
  }

  handleSubtitleLeave(event) {
    if (!event.target || typeof event.target.closest !== 'function') return;
    
    // بررسی leave از کادر زیرنویس ثابت ما
    if (event.target.closest(".translate-it-subtitle-box")) {
      this.resumeVideo();
    }
  }

  pauseVideo() {
    try {
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
      const video = document.querySelector(this.getSelectors().player);
      if (video && this.wasPlayingBeforePause) {
        video.play();
        this.wasPlayingBeforePause = false;
      }
    } catch {
      // Ignore errors
    }
  }

  // Override updateSubtitleElement برای نوشتن چرخشی در سطوح ثابت
  updateSubtitleElement(element, originalText, translatedText) {
    try {
      logME(`[YouTubeSubtitleHandler] Writing to line ${this.currentLineIndex}: "${originalText}" -> "${translatedText}"`);
      
      // اگر کانتینر ثابت وجود ندارد، ایجاد کن
      if (!this.subtitleBox || !this.subtitleLines) {
        this.createFixedSubtitleContainer();
      }
      
      if (!this.subtitleBox || !this.subtitleLines) {
        logME("[YouTubeSubtitleHandler] Subtitle box not available");
        return;
      }

      // پیدا کردن سطر فعلی برای نوشتن
      const targetLine = this.subtitleLines[this.currentLineIndex];
      if (!targetLine) {
        logME("[YouTubeSubtitleHandler] Target line not found");
        return;
      }

      // پاک کردن کلاس‌های قبلی از همه سطرها
      this.subtitleLines.forEach(line => {
        line.classList.remove('active', 'recent');
      });

      // نوشتن محتوای جدید در سطر فعلی
      targetLine.innerHTML = `
        <div style="
          font-weight: bold !important;
          font-size: 1.4em !important;
          line-height: 1.3 !important;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9) !important;
          color: white !important;
          margin-bottom: 3px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        ">${translatedText}</div>
        <div style="
          font-size: 1.1em !important;
          opacity: 0.8 !important;
          line-height: 1.2 !important;
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8) !important;
          color: #d0d0d0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        ">${originalText}</div>
      `;

      // تنظیم کلاس فعال برای سطر جدید
      targetLine.classList.add('active');

      // تنظیم کلاس recent برای سطر قبلی
      const previousIndex = (this.currentLineIndex - 1 + this.maxLines) % this.maxLines;
      this.subtitleLines[previousIndex].classList.add('recent');

      // نمایش کادر
      this.subtitleBox.classList.add("visible");

      // انتقال به سطر بعدی (چرخشی)
      this.currentLineIndex = (this.currentLineIndex + 1) % this.maxLines;

      logME(`[YouTubeSubtitleHandler] Successfully wrote to line. Next line: ${this.currentLineIndex}`);
    } catch (error) {
      logME(`[YouTubeSubtitleHandler] Error updating subtitle:`, error);
      // Fallback to parent method
      super.updateSubtitleElement(element, originalText, translatedText);
    }
  }


  // پاک‌سازی YouTube specific resources
  destroy() {
    // Remove event listeners
    document.removeEventListener("mouseenter", this.handleSubtitleHover, true);
    document.removeEventListener("mouseleave", this.handleSubtitleLeave, true);
    
    // Remove fixed subtitle container
    if (this.subtitleContainer) {
      this.subtitleContainer.remove();
      this.subtitleContainer = null;
    }
    
    // Reset line index
    this.currentLineIndex = 0;
    
    // Clear subtitle lines array
    this.subtitleLines = [];
    
    // Remove styles
    const style = document.querySelector("#youtube-subtitle-style");
    if (style) {
      style.remove();
    }
    
    this.subtitleBox = null;
    
    super.destroy();
  }
}