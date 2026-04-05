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
    this.scrollStopDelay = 500;
    this._handleScroll = this._handleScroll.bind(this);
    this._handleScrollEnd = this._handleScrollEnd.bind(this);
    this._isActive = false;
    this._isScrolling = false;
  }

  /**
   * Start listening for scroll events
   */
  start(delay = 500) {
    if (this._isActive) {
      this.updateDelay(delay);
      return;
    }
    this._isActive = true;
    this.scrollStopDelay = Number(delay) || 500;
    this.logger.debug('Starting scroll tracker with delay:', this.scrollStopDelay);
    
    // Always use manual debounce for custom delays
    // Native 'scrollend' doesn't support custom wait times
    window.addEventListener('scroll', this._handleScroll, { passive: true });
  }

  /**
   * Update the scroll stop delay dynamically
   * @param {number} delay - New delay in ms
   */
  updateDelay(delay) {
    const newDelay = Number(delay) || 500;
    if (this.scrollStopDelay !== newDelay) {
      this.logger.debug('Updating scroll stop delay to:', newDelay);
      this.scrollStopDelay = newDelay;
    }
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
    
    this.scrollTimer = setTimeout(() => {
      if (this._isActive && this._isScrolling) {
        this._handleScrollEnd();
      }
    }, this.scrollStopDelay);
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
