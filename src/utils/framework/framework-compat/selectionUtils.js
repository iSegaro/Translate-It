// src/utils/framework-compat/selectionUtils.js

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'selectionUtils');
  }
  return _logger;
};


/**
 * بررسی وجود انتخاب متن
 * @param {HTMLElement} element - المان هدف
 * @returns {boolean}
 */
export function checkTextSelection(element) {
  if (!element) return false;
  
  if (element.isContentEditable) {
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    
    // TODO: Need to Check
    // اضافی logging برای Reddit debugging
    if (window.location.hostname.includes('reddit.com')) {
      getLogger().debug('Reddit selection check:', {
        hasSelection,
        isCollapsed: selection?.isCollapsed,
        selectionText: selection?.toString(),
        rangeCount: selection?.rangeCount
      });
    }
    
    return hasSelection;
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const hasSelection = element.selectionStart !== element.selectionEnd;
    
    // TODO: Need to Check
    // اضافی logging برای Reddit debugging
    if (window.location.hostname.includes('reddit.com')) {
      getLogger().debug('Reddit input/textarea selection check:', {
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