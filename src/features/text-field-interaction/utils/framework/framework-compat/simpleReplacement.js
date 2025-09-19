// src/utils/framework-compat/simpleReplacement.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Use scoped cached logger
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'simpleReplacement');


/**
 * جایگزینی ساده (fallback) با حفظ undo capability
 */
export function handleSimpleReplacement(element, newValue, start, end) {
  try {
    if (element.isContentEditable) {
      return handleContentEditableWithUndo(element, newValue, start, end);
    } else {
      return handleInputWithUndo(element, newValue, start, end);
    }
  } catch (error) {
  logger.error('Error in simple replacement:', error);
    return false;
  }
}

/**
 * جایگزینی contentEditable با حفظ undo
 */
function handleContentEditableWithUndo(element, newValue) {
  try {
    if (typeof window === 'undefined') {
      return false;
    }

    // استفاده از execCommand برای حفظ undo (deprecated ولی هنوز کار می‌کند)
    const selection = window.getSelection();
    let hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    
  logger.debug('Processing:', {
      hasSelection,
      selectionText: selection?.toString(),
      newValue: newValue.substring(0, 50)
    });
    
    // Focus element
    element.focus();
    
    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب با execCommand
      try {
        if (document.execCommand) {
          // پاک کردن انتخاب
          document.execCommand('delete', false);
          // اضافه کردن متن جدید
          document.execCommand('insertText', false, newValue);
          logger.debug('Used execCommand for selection');
          return true;
        }
      } catch (execError) {
  logger.error('execCommand failed:', execError);
      }
      
      // fallback: استفاده از range API
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(newValue);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // جایگزینی کل محتوا
      try {
        if (document.execCommand) {
          // انتخاب کل محتوا
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
          // جایگزینی با execCommand
          document.execCommand('insertText', false, newValue);
          logger.debug('Used execCommand for full replacement');
          return true;
        }
      } catch (execError) {
  logger.error('execCommand failed:', execError);
      }
      
      // fallback
      element.textContent = newValue;
    }
    
    // رویدادهای ضروری
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}

/**
 * جایگزینی input/textarea با حفظ undo
 */
function handleInputWithUndo(element, newValue, start, end) {
  try {
    const originalStart = element.selectionStart || 0;
    const originalEnd = element.selectionEnd || 0;
    
    // Focus element
    element.focus();
    
    if (start !== null && end !== null) {
      // جایگزینی محدوده مشخص
      element.setSelectionRange(start, end);
    } else if (originalStart !== originalEnd) {
      // استفاده از انتخاب موجود
      element.setSelectionRange(originalStart, originalEnd);
    } else {
      // انتخاب کل محتوا
      element.setSelectionRange(0, element.value.length);
    }
    
    // استفاده از execCommand برای input elements
    try {
      if (document.execCommand && document.execCommand('insertText', false, newValue)) {
  logger.debug('Used execCommand for input');
        return true;
      }
    } catch (execError) {
  logger.error('execCommand failed:', execError);
    }
    
    // fallback: manual replacement
    const currentValue = element.value || '';
    const startPos = start !== null ? start : originalStart;
    const endPos = end !== null ? end : (originalStart !== originalEnd ? originalEnd : currentValue.length);
    
    const newFullValue = currentValue.substring(0, startPos) + newValue + currentValue.substring(endPos);
    element.value = newFullValue;
    const newCursorPosition = startPos + newValue.length;
    element.setSelectionRange(newCursorPosition, newCursorPosition);
    
    // رویدادهای ضروری
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}