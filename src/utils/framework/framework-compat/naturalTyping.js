// src/utils/framework-compat/naturalTyping.js

import { checkTextSelection } from "./selectionUtils.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'naturalTyping');


/**
 * شبیه‌سازی تایپ کردن متن به صورت طبیعی
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای تایپ
 * @param {number} delay - تاخیر بین کاراکترها (میلی‌ثانیه)
 * @param {boolean} replaceSelection - آیا فقط متن انتخاب شده جایگزین شود
 */
export async function simulateNaturalTyping(element, text, delay = 10, replaceSelection = false) {
  if (!element || !text) {
  logger.debug('Invalid params:', { element: !!element, text: !!text });
    return false;
  }

  try {
  logger.debug('Starting for element:', {
      tagName: element.tagName,
      isContentEditable: element.isContentEditable,
      textLength: text.length,
      replaceSelection
    });

    // ابتدا المان را فوکوس کن
    element.focus();
    
    // بررسی انتخاب متن
    const hasSelection = checkTextSelection(element);
  logger.debug('Selection status:', {
      hasSelection,
      replaceSelection,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd
    });
    
    // برای Reddit و contentEditable، از روش ساده‌تر استفاده کن
    if (element.isContentEditable && window.location.hostname.includes('reddit.com')) {
      const simpleSuccess = await handleContentEditableReplacementSimple(element, text, hasSelection, replaceSelection);
      if (simpleSuccess) {
        return true;
      }
      // اگر روش ساده شکست بخورد، ادامه به character-by-character
  logger.error('Reddit simple method failed, falling back to character-by-character');
    }
    
    // فقط در صورتی کل محتوا را پاک کن که:
    // 1. متن انتخاب نشده باشد
    // 2. و این درخواست برای جایگزینی انتخاب نباشد
    if (!hasSelection && !replaceSelection) {
      // پاک کردن کل محتوا فقط اگر متن انتخاب نشده باشد
  logger.debug('Clearing element content (full replacement mode)');
      await clearElementContent(element);
    } else if (replaceSelection && hasSelection) {
  logger.debug('Selection replacement mode - will replace selected text only');
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
        logger.debugLazy(() => [`Char ${i+1}/${text.length}: "${char}", rangeCount: ${selection.rangeCount}`]);
        
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          
          // اگر اولین کاراکتر است و متن انتخاب شده دارد، ابتدا آن را پاک کن
          if (i === 0 && hasSelection) {
            try {
              logger.debug('Before deleteContents:', {
                collapsed: range.collapsed,
                startContainer: range.startContainer?.nodeName,
                endContainer: range.endContainer?.nodeName
              });
              range.deleteContents();
              logger.debug('After deleteContents - selected content deleted');
            } catch (error) {
              logger.error('Error deleting content:', error);
              // fallback: تلاش برای پاک کردن محتوا با روش دیگر
              if (range.startContainer && range.endContainer) {
                range.extractContents();
              }
            }
          }
          
          try {
            const textNode = document.createTextNode(char);
            logger.debugLazy(() => [`Created text node for char: "${char}"`]);
            
            // برای اولین کاراکتر بعد از پاک کردن، range ممکن است خراب باشد
            if (i === 0 && hasSelection) {
              // range را دوباره تنظیم کن
              range.setStart(range.startContainer, range.startOffset);
              range.setEnd(range.startContainer, range.startOffset);
              logger.debug('Reset range after deletion');
            }
            
            range.insertNode(textNode);
            logger.init('Text node inserted successfully');
            
            // تنظیم مجدد range برای ادامه تایپ
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);
            
            logger.debug('Range updated for next character');
          } catch (insertError) {
            logger.error('Error inserting text node:', insertError);
            // fallback: یک approach متفاوت امتحان کردن
            try {
              // سعی کن یک range جدید ایجاد کنی
              const newRange = document.createRange();
              newRange.selectNodeContents(element);
              newRange.collapse(false); // به انتها برو
              
              const textNode = document.createTextNode(char);
              newRange.insertNode(textNode);
              newRange.setStartAfter(textNode);
              newRange.setEndAfter(textNode);
              selection.removeAllRanges();
              selection.addRange(newRange);
              
              logger.init('Fallback range creation successful');
            } catch (fallbackError) {
              logger.error('Fallback also failed:', fallbackError);
              // آخرین fallback: اضافه کردن مستقیم
              element.appendChild(document.createTextNode(char));
            }
          }
        } else {
          // اگر range وجود ندارد، سعی کن یکی ایجاد کنی
          logger.debug('No range found, creating new one');
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false); // به انتها منتقل کن
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
    
  logger.info('Natural typing simulation completed');
    return true;
    
  } catch (error) {
  logger.error('Error in natural typing:', error);
    return false;
  }
}

/**
 * جایگزینی ساده برای contentEditable در Reddit
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن جدید
 * @param {boolean} hasSelection - آیا متن انتخاب شده است
 * @param {boolean} replaceSelection - آیا باید فقط انتخاب جایگزین شود
 * @returns {Promise<boolean>}
 */
async function handleContentEditableReplacementSimple(element, text, hasSelection, replaceSelection) {
  try {
  logger.debug('Starting Reddit-specific replacement:', {
      hasSelection,
      replaceSelection,
      textLength: text.length
    });

    const selection = window.getSelection();
    
    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      const originalText = range.toString();
  logger.debug('Replacing selected text:', originalText);
      
      range.deleteContents();
      
      // اضافه کردن متن جدید
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      // تنظیم cursor بعد از متن جدید
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // بررسی اینکه آیا متن واقعاً جایگزین شده است
      await new Promise(resolve => setTimeout(resolve, 50)); // تاخیر کوتاه برای اطمینان
      
      const currentText = element.textContent || element.innerText;
      const replacementWorked = currentText.includes(text) && !currentText.includes(originalText);
      
  logger.info('Selection replacement result:', {
        originalText,
        newText: text,
        currentText: currentText.substring(0, 100),
        replacementWorked
      });
      
      if (!replacementWorked) {
  logger.error('Selection replacement appears to have failed');
        return false;
      }
    } else {
      // جایگزینی کل محتوا
      const originalText = element.textContent || element.innerText;
  logger.debug('Replacing all content');
      element.textContent = text;
      
      // تنظیم cursor در انتها
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // بررسی اینکه آیا متن واقعاً جایگزین شده است
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const currentText = element.textContent || element.innerText;
      const replacementWorked = currentText === text;
      
  logger.info('Full replacement result:', {
        originalText,
        newText: text,
        currentText,
        replacementWorked
      });
      
      if (!replacementWorked) {
  logger.error('Full replacement appears to have failed');
        return false;
      }
    }

    // شبیه‌سازی input event
    const inputEvent = new Event('input', {
      bubbles: true,
      cancelable: true,
      composed: true
    });
    element.dispatchEvent(inputEvent);

    // شبیه‌سازی change event
    const changeEvent = new Event('change', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(changeEvent);

  logger.init('Reddit replacement completed successfully');
    return true;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
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
  logger.error('Error clearing content:', error);
  }
}