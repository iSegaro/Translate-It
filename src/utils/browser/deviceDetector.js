/**
 * Device Detector Utility
 * Handles mobile and touch environment detection for responsive behavior.
 */

export const deviceDetector = {
  /**
   * Comprehensive check for mobile environments (Android, iOS, etc.)
   * @returns {boolean}
   */
  isMobile() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check for standard mobile UserAgents
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // Check for touch capability (reliable for modern mobile browsers)
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // iPadOS 13+ reports as "Macintosh" but has touch points
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

    return isMobileUA || (isTouch && window.innerWidth <= 1024) || isIPadOS;
  },

  /**
   * Detects if the device supports touch interactions.
   * @returns {boolean}
   */
  isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  /**
   * Helper to determine if we should enable the Mobile Bottom Sheet.
   * @returns {boolean}
   */
  shouldEnableMobileUI() {
    // We prioritize the Mobile UI on all mobile/touch devices with small/medium screens
    return this.isMobile() && window.innerWidth <= 1024;
  }
};

export default deviceDetector;
