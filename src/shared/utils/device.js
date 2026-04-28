/**
 * Simple, dependency-free device detection
 * This file MUST NOT import anything to avoid circular dependencies.
 */

export const isMobile = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window && window.opera) || "";
  
  // Standard mobile UA detection
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  
  // iPadOS detection (often reports as MacIntel but with touch)
  const isIPadOS = (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return isMobileUA || isIPadOS;
})();

export const isTouchDevice = (() => {
  if (typeof navigator === 'undefined') return false;
  return (typeof window !== 'undefined' && 'ontouchstart' in window) || (navigator.maxTouchPoints > 0);
})();
