// src/utils/frameworkCompatibility.js

import { logME } from "./helpers.js";

/**
 * شبیه‌سازی تایپ طبیعی برای فریب فریم‌ورک‌های React
 * این روش ساده‌تر و مؤثرتر از event triggering پیچیده است
 */

/**
 * شبیه‌سازی تایپ کردن متن به صورت طبیعی
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای تایپ
 * @param {number} delay - تاخیر بین کاراکترها (میلی‌ثانیه)
 * @param {boolean} replaceSelection - آیا فقط متن انتخاب شده جایگزین شود
 */
export async function simulateNaturalTyping(element, text, delay = 10, replaceSelection = false) {
  if (!element || !text) return false;

  try {
    // ابتدا المان را فوکوس کن
    element.focus();
    
    // بررسی انتخاب متن
    const hasSelection = checkTextSelection(element);
    
    if (!hasSelection && !replaceSelection) {
      // پاک کردن کل محتوا فقط اگر متن انتخاب نشده باشد
      await clearElementContent(element);
    }
    
    // تایپ کردن کاراکتر به کاراکتر
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // شبیه‌سازی keydown
      const keydownEvent = new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keydownEvent);
      
      // اضافه کردن کاراکتر
      if (element.isContentEditable) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          
          // اگر اولین کاراکتر است و متن انتخاب شده دارد، ابتدا آن را پاک کن
          if (i === 0 && hasSelection) {
            range.deleteContents();
          }
          
          const textNode = document.createTextNode(char);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        if (i === 0 && hasSelection) {
          // برای اولین کاراکتر، متن انتخاب شده را جایگزین کن
          const start = element.selectionStart;
          const end = element.selectionEnd;
          const currentValue = element.value;
          element.value = currentValue.substring(0, start) + char + currentValue.substring(end);
          element.setSelectionRange(start + 1, start + 1);
        } else {
          // ادامه تایپ عادی
          const currentValue = element.value;
          const cursorPos = element.selectionStart || 0;
          element.value = currentValue.slice(0, cursorPos) + char + currentValue.slice(cursorPos);
          element.setSelectionRange(cursorPos + 1, cursorPos + 1);
        }
      }
      
      // شبیه‌سازی input event
      const inputEvent = new Event('input', {
        bubbles: true,
        cancelable: true,
        composed: true
      });
      
      // اضافه کردن data برای React
      Object.defineProperty(inputEvent, 'data', {
        value: char,
        writable: false
      });
      
      element.dispatchEvent(inputEvent);
      
      // شبیه‌سازی keyup
      const keyupEvent = new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keyupEvent);
      
      // تاخیر کوتاه بین کاراکترها
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // رویداد نهایی change
    const changeEvent = new Event('change', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(changeEvent);
    
    logME('[FrameworkCompatibility] Natural typing simulation completed');
    return true;
    
  } catch (error) {
    logME('[FrameworkCompatibility] Error in natural typing:', error);
    return false;
  }
}

/**
 * بررسی وجود انتخاب متن
 * @param {HTMLElement} element - المان هدف
 * @returns {boolean}
 */
function checkTextSelection(element) {
  if (!element) return false;
  
  if (element.isContentEditable) {
    const selection = window.getSelection();
    return selection && !selection.isCollapsed && selection.toString().trim().length > 0;
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    return element.selectionStart !== element.selectionEnd;
  }
  
  return false;
}

/**
 * پاک کردن محتوای المان به صورت طبیعی
 * @param {HTMLElement} element - المان هدف
 */
async function clearElementContent(element) {
  if (!element) return;
  
  try {
    const currentContent = element.isContentEditable ? 
      element.textContent : element.value;
    
    if (!currentContent) return;
    
    // انتخاب کل محتوا
    if (element.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      element.setSelectionRange(0, currentContent.length);
    }
    
    // شبیه‌سازی کلیدهای Delete/Backspace
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      code: 'Delete',
      keyCode: 46,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(deleteEvent);
    
    // پاک کردن محتوا
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        selection.deleteFromDocument();
      }
    } else {
      element.value = '';
    }
    
    // رویداد input برای اطلاع از پاک شدن
    const inputEvent = new Event('input', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(inputEvent);
    
  } catch (error) {
    logME('[FrameworkCompatibility] Error clearing content:', error);
  }
}

/**
 * جایگزینی ساده با تایپ طبیعی یا fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} newValue - مقدار جدید
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 * @param {boolean} useNaturalTyping - استفاده از تایپ طبیعی
 */
export async function smartTextReplacement(element, newValue, start = null, end = null, useNaturalTyping = true) {
  if (!element) return false;

  try {
    // برای سایت‌های خاص از تایپ طبیعی استفاده کن
    const naturalTypingSites = ['deepseek.com', 'chat.openai.com', 'claude.ai', 'reddit.com'];
    const shouldUseNaturalTyping = useNaturalTyping && 
      naturalTypingSites.some(site => window.location.hostname.includes(site));
    
    if (shouldUseNaturalTyping) {
      logME('[FrameworkCompatibility] Using natural typing for:', window.location.hostname);
      
      // بررسی انتخاب فعلی
      const hasCurrentSelection = checkTextSelection(element);
      logME('[FrameworkCompatibility] Selection info:', {
        hasCurrentSelection,
        startParam: start,
        endParam: end,
        actualStart: element.selectionStart,
        actualEnd: element.selectionEnd
      });
      
      // اگر محدوده مشخص شده یا انتخاب فعلی داریم
      if ((start !== null && end !== null) || hasCurrentSelection) {
        if (start !== null && end !== null && !element.isContentEditable) {
          // تنظیم انتخاب طبق محدوده مشخص شده
          element.setSelectionRange(start, end);
        }
        logME('[FrameworkCompatibility] Using partial replacement mode');
        // در صورت انتخاب، فقط قسمت انتخاب شده جایگزین می‌شود
        return await simulateNaturalTyping(element, newValue, 5, true);
      } else {
        logME('[FrameworkCompatibility] Using full replacement mode');
        // کل فیلد جایگزین می‌شود
        return await simulateNaturalTyping(element, newValue, 5, false);
      }
    } else {
      // fallback به روش معمولی
      return handleSimpleReplacement(element, newValue, start, end);
    }
    
  } catch (error) {
    logME('[FrameworkCompatibility] Error in smart replacement:', error);
    return false;
  }
}

/**
 * جایگزینی ساده (fallback)
 */
function handleSimpleReplacement(element, newValue, start, end) {
  try {
    if (element.isContentEditable) {
      if (start !== null && end !== null) {
        // انتخاب قسمت مشخص شده
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch {
          logME('[FrameworkCompatibility] Range selection failed, falling back to textContent');
          element.textContent = newValue;
          return true;
        }
      }
      
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        try {
          const range = selection.getRangeAt(0);
          if (range && typeof range.deleteContents === 'function') {
            range.deleteContents();
            const textNode = document.createTextNode(newValue);
            range.insertNode(textNode);
            selection.removeAllRanges();
          } else {
            // fallback اگر range معتبر نباشد
            element.textContent = newValue;
          }
        } catch {
          logME('[FrameworkCompatibility] Selection manipulation failed, using textContent');
          element.textContent = newValue;
        }
      } else {
        element.textContent = newValue;
      }
    } else {
      const originalStart = element.selectionStart || 0;
      const originalEnd = element.selectionEnd || 0;
      
      if (start !== null && end !== null) {
        const currentValue = element.value || '';
        const newFullValue = currentValue.substring(0, start) + newValue + currentValue.substring(end);
        element.value = newFullValue;
        const newCursorPosition = start + newValue.length;
        element.setSelectionRange(newCursorPosition, newCursorPosition);
      } else if (originalStart !== originalEnd) {
        const currentValue = element.value || '';
        const newFullValue = currentValue.substring(0, originalStart) + newValue + currentValue.substring(originalEnd);
        element.value = newFullValue;
        const newCursorPosition = originalStart + newValue.length;
        element.setSelectionRange(newCursorPosition, newCursorPosition);
      } else {
        element.value = newValue;
        element.setSelectionRange(newValue.length, newValue.length);
      }
    }
    
    // رویدادهای ساده
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
    logME('[FrameworkCompatibility] Error in simple replacement:', error);
    return false;
  }
}

/**
 * تاخیر ساده
 */
export function smartDelay(baseDelay = 100) {
  return new Promise(resolve => setTimeout(resolve, baseDelay));
}