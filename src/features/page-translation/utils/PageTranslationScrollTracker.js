import { PAGE_TRANSLATION_TIMING } from '../PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PageTranslationScrollTracker - Manages scroll event detection and debounce.
 * Isolates scroll listening logic from the main Manager.
 */
export class PageTranslationScrollTracker {
  constructor(onScrollStopCallback, onScrollStartCallback) {
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'ScrollTracker');
    this.onScrollStopCallback = onScrollStopCallback;
    this.onScrollStartCallback = onScrollStartCallback;
    this.scrollTimer = null;
    this._handleScroll = this._handleScroll.bind(this);
    this._handleScrollEnd = this._handleScrollEnd.bind(this);
    this._isActive = false;
    this._isScrolling = false;
  }

  /**
   * Start listening for scroll events
   */
  start() {
    if (this._isActive) return;
    this._isActive = true;
    const delay = PAGE_TRANSLATION_TIMING.SCROLL_STOP_DELAY || 500;
    this.logger.debug('Starting scroll tracker with delay:', delay);
    
    // Always use manual debounce for custom delays
    // Native 'scrollend' doesn't support custom wait times
    window.addEventListener('scroll', this._handleScroll, { passive: true });
  }

  /**
   * Stop listening for scroll events
   */
  stop() {
    if (!this._isActive) return;
    this._isActive = false;
    this.logger.debug('Stopping scroll tracker');
    
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    this._isScrolling = false;
    window.removeEventListener('scroll', this._handleScroll);
  }

  _handleScroll() {
    if (!this._isScrolling) {
      this._isScrolling = true;
      if (this.onScrollStartCallback) {
        this.onScrollStartCallback();
      }
    }

    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    
    const delay = PAGE_TRANSLATION_TIMING.SCROLL_STOP_DELAY || 500;
    
    this.scrollTimer = setTimeout(() => {
      if (this._isActive && this._isScrolling) {
        this._handleScrollEnd();
      }
    }, delay);
  }

  _handleScrollEnd() {
    if (this._isActive) {
      this._isScrolling = false;
      if (this.scrollTimer) {
        clearTimeout(this.scrollTimer);
        this.scrollTimer = null;
      }
      this.onScrollStopCallback();
    }
  }

  destroy() {
    this.stop();
  }
}
