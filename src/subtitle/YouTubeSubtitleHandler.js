// src/subtitle/YouTubeSubtitleHandler.js

import BaseSubtitleHandler from "./BaseSubtitleHandler.js";
import { logME } from "../utils/helpers.js";
import { safeSetText } from "../utils/safeHtml.js";

export default class YouTubeSubtitleHandler extends BaseSubtitleHandler {
  constructor(translationProvider, errorHandler, notifier) {
    super(translationProvider, errorHandler, notifier);
    this.currentVideoId = null;
    this.currentLineIndex = 0; // ایندکس خط فعلی برای نوشتن
    this.maxLines = 2; // تعداد ثابت خطوط در کادر
    
    // متغیرهای drag
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.lastTranslatedText = null; // برای جلوگیری از نمایش تکراری
    
    // متغیرهای timing برای کنترل سرعت نمایش
    this.lastDisplayTime = 0;
    this.minDisplayDuration = 3000; // حداقل 3 ثانیه فاصله بین زیرنویس‌ها
    this.minClearSubtitleLines = 3000;
    this.currentSubtitleText = ''; // متن زیرنویس فعلی در حال نمایش
    this.recentSubtitles = new Set(); // ذخیره زیرنویس‌های اخیر برای جلوگیری از تکرار
    this.subtitleCleanupTimeout = null; // تایمر پاک‌سازی
    this.subtitleHideTimeout = null; // تایمر مخفی کردن کادر زیرنویس
    this.autoHideDelay = 15000; // 15 ثانیه برای مخفی شدن کادر بعد از آخرین زیرنویس
    
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
      this.setupSubtitleStateMonitoring();
    }
    
    return result;
  }
  
  // نظارت بر وضعیت زیرنویس یوتیوب
  setupSubtitleStateMonitoring() {
    // MutationObserver برای نظارت بر تغییرات در دکمه زیرنویس
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'aria-pressed') {
          this.updateContainerVisibility();
        }
      });
    });
    
    // پیدا کردن دکمه زیرنویس و شروع نظارت
    const subtitleButton = document.querySelector('#movie_player .ytp-subtitles-button');
    if (subtitleButton) {
      observer.observe(subtitleButton, { attributes: true });
      this.subtitleStateObserver = observer;
    }
    
    // بررسی اولیه وضعیت
    this.updateContainerVisibility();
    
    // بررسی دوره‌ای هم برای اطمینان (هر 2 ثانیه)
    this.subtitleCheckInterval = setInterval(() => {
      this.updateContainerVisibility();
    }, 2000);
  }
  
  // بروزرسانی نمایش کانتینر بر اساس وضعیت زیرنویس
  updateContainerVisibility() {
    if (!this.subtitleContainer) return;
    
    const subtitlesEnabled = this.areSubtitlesEnabled();
    
    if (subtitlesEnabled) {
      this.subtitleContainer.style.display = 'block';
      if (this.subtitleBox) {
        this.subtitleBox.style.display = 'flex';
      }
    } else {
      this.subtitleContainer.style.display = 'none';
      // پاک کردن محتوای خطوط نیز
      if (this.subtitleLines) {
        this.subtitleLines.forEach(line => {
          line.textContent = '';
          line.className = 'subtitle-line empty';
        });
      }
      // پاک کردن کلاس visible
      if (this.subtitleBox) {
        this.subtitleBox.classList.remove('visible');
      }
      // پاک کردن زیرنویس فعلی
      this.currentSubtitleText = '';
      this.recentSubtitles.clear();
      if (this.subtitleCleanupTimeout) {
        clearTimeout(this.subtitleCleanupTimeout);
        this.subtitleCleanupTimeout = null;
      }
      if (this.subtitleHideTimeout) {
        clearTimeout(this.subtitleHideTimeout);
        this.subtitleHideTimeout = null;
      }
    }
    
    logME(`[YouTubeSubtitleHandler] Container visibility updated: ${subtitlesEnabled ? 'visible' : 'hidden'}`);
  }
  
  // بررسی وضعیت زیرنویس در پلیر یوتیوب
  areSubtitlesEnabled() {
    // بررسی کلاس‌های مختلف که نشان‌دهنده فعال بودن زیرنویس هستند
    const player = document.querySelector('#movie_player');
    if (!player) return false;
    
    // بررسی دکمه زیرنویس در کنترل‌های پلیر
    const subtitleButton = player.querySelector('.ytp-subtitles-button');
    if (subtitleButton) {
      // اگر دکمه آریا-pressed="true" داشته باشد، زیرنویس فعال است
      return subtitleButton.getAttribute('aria-pressed') === 'true';
    }
    
    // بررسی وجود کانتینر زیرنویس و اینکه مخفی نباشد
    const captionContainer = document.querySelector('.ytp-caption-window-container');
    if (captionContainer) {
      const style = window.getComputedStyle(captionContainer);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }
    
    return false;
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
        
        /* کانتینر قابل drag ما */
        #translate-it-subtitle-container {
          position: absolute !important;
          bottom: 60px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          z-index: 10000 !important;
          pointer-events: auto !important;
          width: 80% !important;
          max-width: 600px !important;
          cursor: move !important;
        }
        
        #translate-it-subtitle-container.dragging {
          user-select: none !important;
        }
        
        /* کادر زیرنویس متغیر */
        .translate-it-subtitle-box {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          text-align: center !important;
          gap: 6px !important;
          background: rgba(8, 8, 8, 0.5) !important;
          color: white !important;
          font-family: YouTube Noto, Roboto, Arial, Helvetica, sans-serif !important;
          padding: 10px 14px !important;
          border-radius: 8px !important;
          box-shadow: rgba(0, 0, 0, 0.8) 0px 4px 12px !important;
          min-height: 50px !important;
          justify-content: flex-start !important;
          opacity: 0 !important;
          transition: opacity 0.3s ease !important;
          pointer-events: auto !important;
          overflow: hidden !important;
        }
        
        /* هر خط زیرنویس - متغیر */
        .subtitle-line {
          width: 100% !important;
          margin-bottom: 6px !important;
          opacity: 0.60 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: center !important;
        }
        
        .subtitle-line.empty {
          display: none !important;
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
          background: rgba(8, 8, 8, 0.65) !important;
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
    
    // ایجاد 3 سطر خالی
    this.subtitleLines = [];
    for (let i = 0; i < this.maxLines; i++) {
      const lineContainer = document.createElement("div");
      lineContainer.className = "subtitle-line empty";
      lineContainer.dataset.lineIndex = i;
      
      this.subtitleBox.appendChild(lineContainer);
      this.subtitleLines.push(lineContainer);
    }
    
    this.subtitleContainer.appendChild(this.subtitleBox);
    videoContainer.appendChild(this.subtitleContainer);
    
    // تنظیم hover events بعد از ایجاد کادر
    this.setupDirectHoverEvents();
    
    logME("[YouTubeSubtitleHandler] Fixed subtitle container created with 2 static lines");
  }

  // تنظیم hover events و drag events مستقیم روی کادر زیرنویس
  setupDirectHoverEvents() {
    if (!this.subtitleContainer || !this.subtitleBox) return;

    // Hover events for pause/resume
    this.subtitleBox.addEventListener('mouseenter', () => {
      if (!this.isDragging) {
        logME("[YouTubeSubtitleHandler] Direct hover enter on subtitle box");
        this.pauseVideo();
        this.pauseSubtitleHide(); // متوقف کردن تایمر مخفی شدن
      }
    });

    this.subtitleBox.addEventListener('mouseleave', () => {
      if (!this.isDragging) {
        logME("[YouTubeSubtitleHandler] Direct hover leave from subtitle box");
        this.resumeVideo();
        this.scheduleSubtitleHide(); // شروع مجدد تایمر مخفی شدن
      }
    });

    // Drag events
    this.subtitleContainer.addEventListener('mousedown', this.handleDragStart.bind(this));
    document.addEventListener('mousemove', this.handleDragMove.bind(this));
    document.addEventListener('mouseup', this.handleDragEnd.bind(this));
  }

  handleDragStart(e) {
    this.isDragging = true;
    this.subtitleContainer.classList.add('dragging');
    
    // محاسبه offset نسبت به گوشه بالا-چپ کانتینر
    const rect = this.subtitleContainer.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    
    // متوقف کردن propagation برای جلوگیری از تداخل
    e.preventDefault();
    e.stopPropagation();
    
    logME("[YouTubeSubtitleHandler] Drag started");
  }

  handleDragMove(e) {
    if (!this.isDragging) return;
    
    // محاسبه موقعیت جدید با offset درست
    const newLeft = e.clientX - this.dragOffsetX;
    const newTop = e.clientY - this.dragOffsetY;
    
    // دریافت ابعاد کانتینر
    const containerRect = this.subtitleContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    // const containerHeight = containerRect.height; // Currently unused
    
    // محاسبه محدوده مجاز
    const minLeft = 0;
    const maxLeft = window.innerWidth - containerWidth;
    const minTop = 0;
    // اجازه خروج از پایین تا حد مشخص شدن خط دوم (حدود 40px از بالای کانتینر)
    const maxTop = window.innerHeight - 40;
    
    // اعمال محدودیت‌ها
    const boundedLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    const boundedTop = Math.max(minTop, Math.min(newTop, maxTop));
    
    // تنظیم موقعیت جدید
    this.subtitleContainer.style.left = boundedLeft + 'px';
    this.subtitleContainer.style.top = boundedTop + 'px';
    this.subtitleContainer.style.bottom = 'auto';
    this.subtitleContainer.style.transform = 'none';
    
    e.preventDefault();
  }

  handleDragEnd(e) {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.subtitleContainer.classList.remove('dragging');
    
    // بررسی اینکه آیا کادر هنوز در viewport قابل مشاهده است
    this.ensureContainerVisible();
    
    logME("[YouTubeSubtitleHandler] Drag ended");
    
    e.preventDefault();
  }

  // اطمینان از قابل مشاهده بودن کادر
  ensureContainerVisible() {
    const rect = this.subtitleContainer.getBoundingClientRect();
    
    // بررسی اینکه آیا کادر به طور کامل خارج از viewport رفته
    // فقط اگر کاملاً خارج شده باشد، بازگردانی می‌کنیم
    const isCompletelyOutOfBounds = (
      rect.right <= 0 ||  // کاملاً از چپ خارج شده
      rect.left >= window.innerWidth ||  // کاملاً از راست خارج شده
      rect.top >= window.innerHeight  // کاملاً از پایین خارج شده (بالا را چک نمی‌کنیم)
    );
    
    if (isCompletelyOutOfBounds) {
      // بازگرداندن به موقعیت پیش‌فرض (وسط-پایین)
      this.resetContainerPosition();
      logME("[YouTubeSubtitleHandler] Container was completely out of bounds, reset to default position");
    }
  }

  // بازگرداندن کادر به موقعیت پیش‌فرض
  resetContainerPosition() {
    this.subtitleContainer.style.left = '50%';
    this.subtitleContainer.style.top = 'auto';
    this.subtitleContainer.style.bottom = '60px';
    this.subtitleContainer.style.transform = 'translateX(-50%)';
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

  // بررسی اینکه آیا ویدیو در حال پخش است
  isVideoPlaying() {
    try {
      const video = document.querySelector(this.getSelectors().player);
      return video && !video.paused;
    } catch {
      return false;
    }
  }
  
  // بررسی اینکه آیا زیرنویس واقعاً جدید است
  shouldUpdateSubtitle(originalText, translatedText) {
    // اگر ویدیو متوقف است، اپدیت نکن
    if (!this.isVideoPlaying()) {
      logME('[YouTubeSubtitleHandler] Video is paused, not updating subtitles');
      return false;
    }
    
    // بررسی تکرار با زیرنویس‌های اخیر
    if (this.recentSubtitles.has(translatedText)) {
      logME(`[YouTubeSubtitleHandler] Duplicate subtitle in recent history, ignoring: "${translatedText}"`);
      return false;
    }
    
    // بررسی تکراری بودن با زیرنویس فعلی
    if (this.currentSubtitleText === translatedText) {
      logME(`[YouTubeSubtitleHandler] Same as current subtitle, not updating: "${translatedText}"`);
      return false;
    }
    
    // بررسی فاصله زمانی
    const currentTime = Date.now();
    const timeSinceLastDisplay = currentTime - this.lastDisplayTime;
    
    if (this.lastDisplayTime > 0 && timeSinceLastDisplay < this.minDisplayDuration) {
      logME(`[YouTubeSubtitleHandler] Too soon to update subtitle (${timeSinceLastDisplay}ms < ${this.minDisplayDuration}ms)`);
      return false;
    }
    
    return true;
  }
  
  // اضافه کردن زیرنویس به تاریخچه اخیر
  addToRecentHistory(translatedText) {
    this.recentSubtitles.add(translatedText);
    
    // پاک کردن تاریخچه پس از 3 ثانیه
    if (this.subtitleCleanupTimeout) {
      clearTimeout(this.subtitleCleanupTimeout);
    }
    
    this.subtitleCleanupTimeout = setTimeout(() => {
      this.recentSubtitles.clear();
      logME('[YouTubeSubtitleHandler] Recent subtitles history cleared');
    }, this.minClearSubtitleLines);
  }
  
  // مخفی کردن کادر زیرنویس با تاخیر
  scheduleSubtitleHide() {
    // پاک کردن تایمر قبلی اگر وجود دارد
    if (this.subtitleHideTimeout) {
      clearTimeout(this.subtitleHideTimeout);
      this.subtitleHideTimeout = null;
    }

    // تنظیم تایمر جدید برای مخفی کردن کادر
    this.subtitleHideTimeout = setTimeout(() => {
      if (this.subtitleBox) {
        this.subtitleBox.classList.remove('visible');
        logME('[YouTubeSubtitleHandler] Subtitle box auto-hidden after timeout');
      }
      this.subtitleHideTimeout = null;
    }, this.autoHideDelay);

    logME(`[YouTubeSubtitleHandler] Scheduled subtitle hide in ${this.autoHideDelay}ms`);
  }

  // متوقف کردن تایمر مخفی شدن
  pauseSubtitleHide() {
    if (this.subtitleHideTimeout) {
      clearTimeout(this.subtitleHideTimeout);
      this.subtitleHideTimeout = null;
      logME('[YouTubeSubtitleHandler] Subtitle hide timer paused');
    }
  }
  
  // نمایش فوری زیرنویس (بدون صف)
  async displaySubtitleImmediate(originalText, translatedText) {
    try {
      logME(`[YouTubeSubtitleHandler] Displaying subtitle: "${originalText}" -> "${translatedText}"`);
      
      // اگر کانتینر ثابت وجود ندارد، ایجاد کن
      if (!this.subtitleBox || !this.subtitleLines) {
        this.createFixedSubtitleContainer();
      }
      
      if (!this.subtitleBox || !this.subtitleLines) {
        logME("[YouTubeSubtitleHandler] Subtitle box not available");
        return;
      }
      
      // بررسی اینکه آیا زیرنویس فعال است
      if (!this.areSubtitlesEnabled()) {
        logME("[YouTubeSubtitleHandler] Subtitles are disabled, not updating");
        return;
      }

      // شیفت دادن محتوای موجود به بالا
      if (this.subtitleLines.length >= 2) {
        // انتقال محتوای خط دوم به خط اول - safely copy content
        const line2Content = this.subtitleLines[1].cloneNode(true);
        const line2Classes = this.subtitleLines[1].classList.contains('empty') ? 'empty' : 'recent';
        
        // Clear and replace content safely
        this.subtitleLines[0].textContent = '';
        Array.from(line2Content.childNodes).forEach(node => {
          this.subtitleLines[0].appendChild(node.cloneNode(true));
        });
        this.subtitleLines[0].className = `subtitle-line ${line2Classes}`;
      }

      // اضافه کردن محتوای جدید به خط دوم - create elements safely
      this.subtitleLines[1].textContent = '';

      // Create translated text div
      const translatedDiv = document.createElement('div');
      translatedDiv.style.cssText = `
          font-weight: bold !important;
          font-size: 1.6em !important;
          line-height: 1.3 !important;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9) !important;
          color: white !important;
          margin-bottom: 3px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
      `;
      safeSetText(translatedDiv, translatedText);

      // Create original text div
      const originalDiv = document.createElement('div');
      originalDiv.style.cssText = `
          font-size: 1.3em !important;
          opacity: 0.8 !important;
          line-height: 1.2 !important;
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8) !important;
          color: #d0d0d0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
      `;
      safeSetText(originalDiv, originalText);

      // Append both divs
      this.subtitleLines[1].appendChild(translatedDiv);
      this.subtitleLines[1].appendChild(originalDiv);

      // تنظیم کلاس‌ها
      this.subtitleLines[1].className = 'subtitle-line active';

      // نمایش کادر
      this.subtitleBox.classList.add("visible");

      // تنظیم تایمر برای مخفی کردن کادر بعد از مدت زمان مشخص
      this.scheduleSubtitleHide();

      logME(`[YouTubeSubtitleHandler] Successfully displayed subtitle`);
    } catch (error) {
      logME(`[YouTubeSubtitleHandler] Error displaying subtitle:`, error);
    }
  }
  
  // Override updateSubtitleElement با کنترل هوشمند
  updateSubtitleElement(element, originalText, translatedText) {
    // بررسی اینکه آیا باید اپدیت کرد
    if (!this.shouldUpdateSubtitle(originalText, translatedText)) {
      return;
    }
    
    logME(`[YouTubeSubtitleHandler] New subtitle accepted: "${originalText}" -> "${translatedText}"`);
    
    // نمایش زیرنویس جدید
    this.displaySubtitleImmediate(originalText, translatedText);
    
    // به‌روزرسانی زمان و متن فعلی
    this.lastDisplayTime = Date.now();
    this.currentSubtitleText = translatedText;
    this.lastTranslatedText = translatedText;
    
    // اضافه کردن به تاریخچه اخیر
    this.addToRecentHistory(translatedText);
  }


  // پاک‌سازی YouTube specific resources
  destroy() {
    // Remove event listeners
    document.removeEventListener("mouseenter", this.handleSubtitleHover, true);
    document.removeEventListener("mouseleave", this.handleSubtitleLeave, true);
    
    // Remove drag event listeners
    document.removeEventListener("mousemove", this.handleDragMove);
    document.removeEventListener("mouseup", this.handleDragEnd);
    
    // پاک‌سازی subtitle state monitoring
    if (this.subtitleStateObserver) {
      this.subtitleStateObserver.disconnect();
      this.subtitleStateObserver = null;
    }
    
    if (this.subtitleCheckInterval) {
      clearInterval(this.subtitleCheckInterval);
      this.subtitleCheckInterval = null;
    }
    
    // پاک‌سازی timing
    this.lastDisplayTime = 0;
    this.currentSubtitleText = '';
    this.recentSubtitles.clear();
    if (this.subtitleCleanupTimeout) {
      clearTimeout(this.subtitleCleanupTimeout);
      this.subtitleCleanupTimeout = null;
    }
    if (this.subtitleHideTimeout) {
      clearTimeout(this.subtitleHideTimeout);
      this.subtitleHideTimeout = null;
    }
    
    // Remove fixed subtitle container
    if (this.subtitleContainer) {
      this.subtitleContainer.remove();
      this.subtitleContainer = null;
    }
    
    // Reset state variables
    this.currentLineIndex = 0;
    this.isDragging = false;
    this.lastTranslatedText = null;
    this.lastDisplayTime = 0;
    this.currentSubtitleText = '';
    this.recentSubtitles.clear();
    if (this.subtitleCleanupTimeout) {
      clearTimeout(this.subtitleCleanupTimeout);
      this.subtitleCleanupTimeout = null;
    }
    if (this.subtitleHideTimeout) {
      clearTimeout(this.subtitleHideTimeout);
      this.subtitleHideTimeout = null;
    }
    
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