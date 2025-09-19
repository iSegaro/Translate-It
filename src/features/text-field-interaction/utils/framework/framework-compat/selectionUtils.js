// src/utils/framework-compat/selectionUtils.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Use scoped cached logger (migration from old lazy pattern)
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'selectionUtils');


/**
 * بررسی وجود انتخاب متن
 * @param {HTMLElement} element - المان هدف
 * @returns {boolean}
 */
export function checkTextSelection(element) {
  if (!element) return false;
  
  if (element.isContentEditable && typeof window !== 'undefined') {
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    
    // Debug logging for Reddit-specific issues
    if (typeof window !== 'undefined' && window.location.hostname.includes('reddit.com')) {
      logger.debug('Reddit selection check:', {
        hasSelection,
        isCollapsed: selection?.isCollapsed,
        selectionText: selection?.toString(),
        rangeCount: selection?.rangeCount
      });
    }
    
    return hasSelection;
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const hasSelection = element.selectionStart !== element.selectionEnd;
    
    // Debug logging for Reddit-specific issues
    if (typeof window !== 'undefined' && window.location.hostname.includes('reddit.com')) {
      logger.debug('Reddit input/textarea selection check:', {
        hasSelection,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        value: element.value?.substring(0, 50)
      });
    }
    
    return hasSelection;
  }
  
  return false;
}