// src/utils/frameworkCompatibility.js

import { logME } from "./helpers.js";

/**
 * تشخیص ویرایشگرهای پیچیده که نیاز به copy-only دارند
 * @param {HTMLElement} element - المان هدف
 * @returns {boolean} آیا این ویرایشگر پیچیده است
 */
export function isComplexEditor(element) {
  if (!element) return false;

  try {
    // بررسی ویرایشگرهای شناخته شده
    const isKnownEditor = checkKnownEditors(element);
    if (isKnownEditor) {
      logME('[isComplexEditor] Known editor detected:', isKnownEditor);
      return true;
    }

    // بررسی URL سایت
    const hostname = window.location.hostname.toLowerCase();
    const complexSites = [
      'docs.google.com',
      'office.live.com',
      'sharepoint.com',
      'onedrive.live.com',
      'office365.com',
      'outlook.live.com',
      'outlook.office.com',
      'teams.microsoft.com'
    ];

    const isComplexSite = complexSites.some(site => hostname.includes(site));
    if (isComplexSite) {
      logME('[isComplexEditor] Complex site detected:', hostname);
      return true;
    }

    // بررسی ساختار DOM پیچیده
    const hasDangerousStructure = checkDangerousStructure(element);
    if (hasDangerousStructure) {
      logME('[isComplexEditor] Dangerous DOM structure detected');
      return true;
    }

    return false;
  } catch (error) {
    logME('[isComplexEditor] Error:', error);
    return false;
  }
}

/**
 * بررسی ویرایشگرهای شناخته شده
 */
function checkKnownEditors(element) {
  // بررسی CKEditor (هم نسخه قدیمی هم جدید)
  if (element.classList?.contains('cke_editable') || 
      element.classList?.contains('ck-editor__editable') ||
      element.closest?.('.cke_contents, .cke_inner, .cke_wysiwyg_frame, .ck-editor, .ck-content')) {
    return 'CKEditor';
  }

  // بررسی TinyMCE (نسخه‌های مختلف)
  if (element.classList?.contains('mce-content-body') ||
      element.classList?.contains('tox-edit-area__iframe') ||
      element.classList?.contains('tox-editor-container') ||
      element.closest?.('.mce-edit-area, .tox-edit-area, .tox-editor, .tox-tinymce, .mce-tinymce')) {
    return 'TinyMCE';
  }

  // بررسی Quill
  if (element.classList?.contains('ql-editor') ||
      element.closest?.('.ql-container, .ql-toolbar')) {
    return 'Quill';
  }

  // بررسی Draft.js
  if (element.classList?.contains('DraftEditor-root') ||
      element.closest?.('.DraftEditor-editorContainer')) {
    return 'Draft.js';
  }

  // بررسی Medium Editor
  if (element.classList?.contains('medium-editor-element') ||
      element.hasAttribute?.('data-medium-element')) {
    return 'Medium Editor';
  }

  // بررسی Monaco Editor (VSCode)
  if (element.classList?.contains('monaco-editor') ||
      element.closest?.('.monaco-editor-background')) {
    return 'Monaco Editor';
  }

  // بررسی CodeMirror
  if (element.classList?.contains('CodeMirror') ||
      element.closest?.('.CodeMirror-wrap, .CodeMirror-scroll')) {
    return 'CodeMirror';
  }

  // بررسی Google Docs
  if (element.closest?.('.kix-paginateddocumentplugin, .docs-texteventtarget-iframe')) {
    return 'Google Docs';
  }

  return null;
}

/**
 * بررسی ساختار DOM خطرناک
 */
function checkDangerousStructure(element) {
  try {
    // بررسی تعداد المان‌های فرزند
    const childElementCount = element.querySelectorAll?.('*').length || 0;
    if (childElementCount > 20) {
      logME('[checkDangerousStructure] Too many child elements:', childElementCount);
      return true;
    }

    // بررسی iframe ها
    if (element.querySelector?.('iframe')) {
      logME('[checkDangerousStructure] Contains iframe');
      return true;
    }

    // بررسی script tags
    if (element.querySelector?.('script')) {
      logME('[checkDangerousStructure] Contains script tags');
      return true;
    }

    // بررسی Shadow DOM
    if (element.shadowRoot) {
      logME('[checkDangerousStructure] Has shadow root');
      return true;
    }

    // بررسی data attributes مشکوک
    const suspiciousAttributes = ['data-reactroot', 'data-slate-editor', 'data-lexical'];
    const hasSuspiciousAttrs = suspiciousAttributes.some(attr => 
      element.hasAttribute?.(attr) || element.closest?.(`[${attr}]`)
    );

    if (hasSuspiciousAttrs) {
      logME('[checkDangerousStructure] Has suspicious data attributes');
      return true;
    }

    // بررسی کلاس‌های ویرایشگرهای پیچیده
    const editorClasses = Array.from(element.classList || []);
    const hasEditorClasses = editorClasses.some(cls => 
      cls.startsWith('ck-') || cls.startsWith('ck ') ||  // CKEditor
      cls.startsWith('mce-') || cls.startsWith('tox-') || // TinyMCE
      cls.startsWith('ql-') ||  // Quill
      cls.includes('editor')    // Generic editor classes
    );
    
    if (hasEditorClasses) {
      logME('[checkDangerousStructure] Has editor classes:', editorClasses.filter(cls => 
        cls.startsWith('ck') || cls.startsWith('mce-') || cls.startsWith('tox-') || cls.startsWith('ql-') || cls.includes('editor')
      ));
      return true;
    }

    return false;
  } catch (error) {
    logME('[checkDangerousStructure] Error:', error);
    return false;
  }
}

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
  if (!element || !text) {
    logME('[simulateNaturalTyping] Invalid params:', { element: !!element, text: !!text });
    return false;
  }

  try {
    logME('[simulateNaturalTyping] Starting for element:', {
      tagName: element.tagName,
      isContentEditable: element.isContentEditable,
      textLength: text.length,
      replaceSelection
    });

    // ابتدا المان را فوکوس کن
    element.focus();
    
    // بررسی انتخاب متن
    const hasSelection = checkTextSelection(element);
    logME('[simulateNaturalTyping] Selection status:', {
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
      logME('[simulateNaturalTyping] Reddit simple method failed, falling back to character-by-character');
    }
    
    // فقط در صورتی کل محتوا را پاک کن که:
    // 1. متن انتخاب نشده باشد
    // 2. و این درخواست برای جایگزینی انتخاب نباشد
    if (!hasSelection && !replaceSelection) {
      // پاک کردن کل محتوا فقط اگر متن انتخاب نشده باشد
      logME('[simulateNaturalTyping] Clearing element content (full replacement mode)');
      await clearElementContent(element);
    } else if (replaceSelection && hasSelection) {
      logME('[simulateNaturalTyping] Selection replacement mode - will replace selected text only');
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
        logME(`[simulateNaturalTyping] Char ${i+1}/${text.length}: "${char}", rangeCount: ${selection.rangeCount}`);
        
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          
          // اگر اولین کاراکتر است و متن انتخاب شده دارد، ابتدا آن را پاک کن
          if (i === 0 && hasSelection) {
            try {
              logME('[simulateNaturalTyping] Before deleteContents:', {
                collapsed: range.collapsed,
                startContainer: range.startContainer?.nodeName,
                endContainer: range.endContainer?.nodeName
              });
              range.deleteContents();
              logME('[simulateNaturalTyping] After deleteContents - selected content deleted');
            } catch (error) {
              logME('[simulateNaturalTyping] Error deleting content:', error);
              // fallback: تلاش برای پاک کردن محتوا با روش دیگر
              if (range.startContainer && range.endContainer) {
                range.extractContents();
              }
            }
          }
          
          try {
            const textNode = document.createTextNode(char);
            logME(`[simulateNaturalTyping] Created text node for char: "${char}"`);
            
            // برای اولین کاراکتر بعد از پاک کردن، range ممکن است خراب باشد
            if (i === 0 && hasSelection) {
              // range را دوباره تنظیم کن
              range.setStart(range.startContainer, range.startOffset);
              range.setEnd(range.startContainer, range.startOffset);
              logME('[simulateNaturalTyping] Reset range after deletion');
            }
            
            range.insertNode(textNode);
            logME('[simulateNaturalTyping] Text node inserted successfully');
            
            // تنظیم مجدد range برای ادامه تایپ
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);
            
            logME(`[simulateNaturalTyping] Range updated for next character`);
          } catch (insertError) {
            logME('[simulateNaturalTyping] Error inserting text node:', insertError);
            // fallback: یک approach متفاوت بامعه کردن
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
              
              logME('[simulateNaturalTyping] Fallback range creation successful');
            } catch (fallbackError) {
              logME('[simulateNaturalTyping] Fallback also failed:', fallbackError);
              // آخرین fallback: اضافه کردن مستقیم
              element.appendChild(document.createTextNode(char));
            }
          }
        } else {
          // اگر range وجود ندارد، سعی کن یکی ایجاد کنی
          logME('[simulateNaturalTyping] No range found, creating new one');
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
    
    logME('[FrameworkCompatibility] Natural typing simulation completed');
    return true;
    
  } catch (error) {
    logME('[FrameworkCompatibility] Error in natural typing:', error);
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
    logME('[handleContentEditableReplacementSimple] Starting Reddit-specific replacement:', {
      hasSelection,
      replaceSelection,
      textLength: text.length
    });

    const selection = window.getSelection();
    
    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      const originalText = range.toString();
      logME('[handleContentEditableReplacementSimple] Replacing selected text:', originalText);
      
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
      
      logME('[handleContentEditableReplacementSimple] Selection replacement result:', {
        originalText,
        newText: text,
        currentText: currentText.substring(0, 100),
        replacementWorked
      });
      
      if (!replacementWorked) {
        logME('[handleContentEditableReplacementSimple] Selection replacement appears to have failed');
        return false;
      }
    } else {
      // جایگزینی کل محتوا
      const originalText = element.textContent || element.innerText;
      logME('[handleContentEditableReplacementSimple] Replacing all content');
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
      
      logME('[handleContentEditableReplacementSimple] Full replacement result:', {
        originalText,
        newText: text,
        currentText,
        replacementWorked
      });
      
      if (!replacementWorked) {
        logME('[handleContentEditableReplacementSimple] Full replacement appears to have failed');
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

    logME('[handleContentEditableReplacementSimple] Reddit replacement completed successfully');
    return true;
  } catch (error) {
    logME('[handleContentEditableReplacementSimple] Error:', error);
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
    const hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    
    // اضافی logging برای Reddit debugging
    if (window.location.hostname.includes('reddit.com')) {
      logME('[checkTextSelection] Reddit selection check:', {
        hasSelection,
        isCollapsed: selection?.isCollapsed,
        selectionText: selection?.toString(),
        rangeCount: selection?.rangeCount
      });
    }
    
    return hasSelection;
  } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const hasSelection = element.selectionStart !== element.selectionEnd;
    
    // اضافی logging برای Reddit debugging
    if (window.location.hostname.includes('reddit.com')) {
      logME('[checkTextSelection] Reddit input/textarea selection check:', {
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
 * جایگزینی هوشمند متن با چندین استراتژی fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} newValue - مقدار جدید
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 * @param {boolean} useNaturalTyping - استفاده از تایپ طبیعی
 */
export async function smartTextReplacement(element, newValue, start = null, end = null, useNaturalTyping = true) {
  if (!element) return false;

  try {
    logME('[smartTextReplacement] Starting with strategies:', {
      tagName: element.tagName,
      isContentEditable: element.isContentEditable,
      hasSpellcheck: element.hasAttribute('spellcheck'),
      spellcheckValue: element.getAttribute('spellcheck'),
      hostname: window.location.hostname
    });

    // استراتژی 1: Universal Text Insertion (الهام از پروژه نمونه)
    const universalSuccess = await universalTextInsertion(element, newValue, start, end);
    if (universalSuccess) {
      logME('[smartTextReplacement] ✅ Universal insertion succeeded');
      return true;
    }

    // استراتژی 2: Natural Typing (برای سایت‌های خاص)
    const naturalTypingSites = ['deepseek.com', 'chat.openai.com', 'claude.ai', 'reddit.com'];
    const shouldUseNaturalTyping = useNaturalTyping && 
      naturalTypingSites.some(site => window.location.hostname.includes(site));
    
    if (shouldUseNaturalTyping) {
      logME('[smartTextReplacement] Trying natural typing for:', window.location.hostname);
      
      // بررسی انتخاب فعلی
      const hasCurrentSelection = checkTextSelection(element);
      
      // اگر محدوده مشخص شده یا انتخاب فعلی داریم
      if ((start !== null && end !== null) || hasCurrentSelection) {
        if (start !== null && end !== null && !element.isContentEditable) {
          element.setSelectionRange(start, end);
        }
        const success = await simulateNaturalTyping(element, newValue, 5, true);
        if (success) {
          logME('[smartTextReplacement] ✅ Natural typing (partial) succeeded');
          return true;
        }
      } else {
        const success = await simulateNaturalTyping(element, newValue, 5, false);
        if (success) {
          logME('[smartTextReplacement] ✅ Natural typing (full) succeeded');
          return true;
        }
      }
    }

    // استراتژی 3: Simple Replacement (fallback نهایی)
    logME('[smartTextReplacement] Falling back to simple replacement');
    return handleSimpleReplacement(element, newValue, start, end);
    
  } catch (error) {
    logME('[smartTextReplacement] Error in smart replacement:', error);
    return false;
  }
}

/**
 * جایگذاری عمومی متن - الهام گرفته از پروژه Mouse Tooltip Translator
 * استراتژی چندلایه: execCommand → pasteText → fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای جایگذاری
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 */
export async function universalTextInsertion(element, text, start = null, end = null) {
  if (!element || !text) return false;

  try {
    // Focus کردن المان
    element.focus();
    await smartDelay(10);

    // تنظیم انتخاب در صورت نیاز
    if (start !== null && end !== null) {
      if (element.isContentEditable) {
        // برای contentEditable از selection API استفاده کن
        const selection = window.getSelection();
        const range = document.createRange();
        
        // پیدا کردن text node مناسب
        const textNode = findTextNodeAtPosition(element, start);
        if (textNode) {
          range.setStart(textNode, Math.min(start, textNode.textContent.length));
          range.setEnd(textNode, Math.min(end, textNode.textContent.length));
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } else {
        // برای input/textarea
        element.setSelectionRange(start, end);
      }
    }

    // بررسی انتخاب موجود
    const hasSelection = checkTextSelection(element);
    logME('[universalTextInsertion] Initial state:', {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName
    });

    // استراتژی 1: execCommand insertText (بهترین حفظ undo/redo)
    const execSuccess = await tryExecCommandInsertion(element, text, hasSelection);
    if (execSuccess) {
      logME('[universalTextInsertion] ✅ execCommand succeeded');
      return true;
    }

    // استراتژی 2: Paste Event Simulation (سازگار با frameworks)
    const pasteSuccess = await tryPasteInsertion(element, text, hasSelection);
    if (pasteSuccess) {
      logME('[universalTextInsertion] ✅ Paste event succeeded');
      return true;
    }

    // استراتژی 3: Conditional strategy based on element type
    if (element.isContentEditable) {
      // Google Docs ویژه
      if (window.location.hostname.includes('docs.google.com')) {
        const googleDocsSuccess = await tryGoogleDocsInsertion(element, text);
        if (googleDocsSuccess) {
          logME('[universalTextInsertion] ✅ Google Docs method succeeded');
          return true;
        }
      }
      
      // contentEditable عمومی
      const contentEditableSuccess = await tryContentEditableInsertion(element, text, hasSelection);
      if (contentEditableSuccess) {
        logME('[universalTextInsertion] ✅ ContentEditable method succeeded');
        return true;
      }
    } else {
      // Input/textarea
      const inputSuccess = await tryInputInsertion(element, text, hasSelection, start, end);
      if (inputSuccess) {
        logME('[universalTextInsertion] ✅ Input method succeeded');
        return true;
      }
    }

    logME('[universalTextInsertion] ❌ All methods failed');
    return false;

  } catch (error) {
    logME('[universalTextInsertion] Error:', error);
    return false;
  }
}

/**
 * تلاش برای جایگذاری با execCommand (بهترین روش برای حفظ undo)
 */
async function tryExecCommandInsertion(element, text, hasSelection) {
  try {
    // بررسی پشتیبانی از execCommand
    if (typeof document.execCommand !== 'function') {
      return false;
    }

    logME('[tryExecCommandInsertion] Attempting execCommand insertText', {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName
    });
    
    // Focus element first
    element.focus();
    await smartDelay(10);
    
    // برای input/textarea
    if (!element.isContentEditable) {
      if (hasSelection) {
        // اگر انتخاب دارد، مستقیماً جایگزین کن
        const result = document.execCommand('insertText', false, text);
        if (result) {
          logME('[tryExecCommandInsertion] ✅ execCommand succeeded for input/textarea with selection');
          await smartDelay(50);
          return true;
        }
      } else {
        // اگر انتخاب ندارد، ابتدا همه را انتخاب کن سپس جایگزین کن
        element.setSelectionRange(0, element.value.length);
        await smartDelay(10);
        const result = document.execCommand('insertText', false, text);
        if (result) {
          logME('[tryExecCommandInsertion] ✅ execCommand succeeded for input/textarea full replacement');
          await smartDelay(50);
          return true;
        }
      }
    }
    
    // برای contentEditable
    if (element.isContentEditable) {
      const selection = window.getSelection();
      
      if (hasSelection && selection && !selection.isCollapsed) {
        // اگر انتخاب دارد، حذف سپس درج
        const deleteResult = document.execCommand('delete', false);
        await smartDelay(10);
        const insertResult = document.execCommand('insertText', false, text);
        if (deleteResult && insertResult) {
          logME('[tryExecCommandInsertion] ✅ execCommand succeeded for contentEditable with selection');
          await smartDelay(50);
          return true;
        }
      } else {
        // اگر انتخاب ندارد، ابتدا همه را انتخاب کن
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        await smartDelay(10);
        
        // حذف محتوای انتخاب شده
        const deleteResult = document.execCommand('delete', false);
        await smartDelay(10);
        
        // درج متن جدید
        const insertResult = document.execCommand('insertText', false, text);
        if (deleteResult && insertResult) {
          logME('[tryExecCommandInsertion] ✅ execCommand succeeded for contentEditable full replacement');
          await smartDelay(50);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logME('[tryExecCommandInsertion] Error:', error);
    return false;
  }
}

/**
 * تلاش برای جایگذاری با Paste Event
 */
async function tryPasteInsertion(element, text, hasSelection) {
  try {
    logME('[tryPasteInsertion] Attempting paste event simulation');

    // ایجاد DataTransfer object
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);

    // ایجاد paste event
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true,
      composed: true
    });

    // اضافه کردن ویژگی‌های اضافی برای سازگاری بیشتر
    Object.defineProperties(pasteEvent, {
      data: { value: text, writable: false },
      dataType: { value: 'text/plain', writable: false }
    });

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن (برای حفظ undo)
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        logME('[tryPasteInsertion] Selected all content in contentEditable for undo preservation');
      } else {
        element.setSelectionRange(0, element.value.length);
        logME('[tryPasteInsertion] Selected all content in input/textarea for undo preservation');
      }
    }

    // ارسال event
    element.dispatchEvent(pasteEvent);
    
    // تأیید موفقیت
    await smartDelay(100);
    
    // بررسی اینکه متن واقعاً اضافه شده
    const currentText = element.isContentEditable ? 
      (element.textContent || element.innerText) : element.value;
    
    if (currentText && currentText.includes(text)) {
      logME('[tryPasteInsertion] Success verified');
      clipboardData.clearData();
      return true;
    }

    clipboardData.clearData();
    return false;
  } catch (error) {
    logME('[tryPasteInsertion] Error:', error);
    return false;
  }
}

/**
 * روش خاص Google Docs
 */
async function tryGoogleDocsInsertion(element, text) {
  try {
    logME('[tryGoogleDocsInsertion] Attempting Google Docs specific method');
    
    // پیدا کردن iframe Google Docs
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (iframe && iframe.contentDocument) {
      const editableElement = iframe.contentDocument.querySelector('[contenteditable=true]');
      if (editableElement) {
        return await tryPasteInsertion(editableElement, text, false);
      }
    }
    
    return false;
  } catch (error) {
    logME('[tryGoogleDocsInsertion] Error:', error);
    return false;
  }
}

/**
 * روش عمومی contentEditable (با حفظ undo)
 */
async function tryContentEditableInsertion(element, text, hasSelection) {
  try {
    logME('[tryContentEditableInsertion] Attempting contentEditable insertion with undo preservation');
    
    // Focus element
    element.focus();
    await smartDelay(10);
    
    const selection = window.getSelection();
    
    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      await smartDelay(10);
      logME('[tryContentEditableInsertion] Selected all content for full replacement');
    }
    
    // تلاش برای استفاده از execCommand برای حفظ undo
    if (typeof document.execCommand === 'function' && selection.rangeCount > 0) {
      // حذف محتوای انتخاب شده
      const deleteResult = document.execCommand('delete', false);
      await smartDelay(10);
      
      if (deleteResult) {
        // درج متن جدید با حفظ خطوط جدید
        const lines = text.split('\n');
        let insertSuccess = true;
        
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            // اضافه کردن line break
            const brResult = document.execCommand('insertHTML', false, '<br>');
            if (!brResult) insertSuccess = false;
          }
          
          if (lines[i]) {
            // اضافه کردن خط متن
            const textResult = document.execCommand('insertText', false, lines[i]);
            if (!textResult) insertSuccess = false;
          }
        }
        
        if (insertSuccess) {
          logME('[tryContentEditableInsertion] ✅ Used execCommand for undo preservation');
          
          // رویدادهای ضروری
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          return true;
        }
      }
    }
    
    // fallback: جایگزینی مستقیم (بدون undo)
    logME('[tryContentEditableInsertion] ⚠️ Falling back to direct DOM manipulation (no undo)');
    
    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      // تبدیل متن به HTML ساده با حفظ خطوط جدید
      const lines = text.split('\n');
      const fragment = document.createDocumentFragment();
      
      lines.forEach((line, index) => {
        if (index > 0) {
          fragment.appendChild(document.createElement('br'));
        }
        if (line) {
          fragment.appendChild(document.createTextNode(line));
        }
      });
      
      range.insertNode(fragment);
      
      // تنظیم cursor بعد از متن
      range.setStartAfter(fragment.lastChild || fragment);
      range.setEndAfter(fragment.lastChild || fragment);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // جایگزینی کل محتوا
      element.innerHTML = '';
      const lines = text.split('\n');
      
      lines.forEach((line, index) => {
        if (index > 0) {
          element.appendChild(document.createElement('br'));
        }
        if (line) {
          element.appendChild(document.createTextNode(line));
        }
      });
      
      // تنظیم cursor در انتها
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // رویدادهای ضروری
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
    logME('[tryContentEditableInsertion] Error:', error);
    return false;
  }
}

/**
 * روش عمومی input/textarea (با حفظ undo)
 */
async function tryInputInsertion(element, text, hasSelection, start, end) {
  try {
    logME('[tryInputInsertion] Attempting input/textarea insertion with undo preservation');
    
    // Focus element
    element.focus();
    await smartDelay(10);
    
    const currentValue = element.value || '';
    let startPos, endPos;
    
    if (start !== null && end !== null) {
      startPos = start;
      endPos = end;
    } else if (hasSelection) {
      startPos = element.selectionStart;
      endPos = element.selectionEnd;
    } else {
      startPos = 0;
      endPos = currentValue.length;
    }
    
    // تنظیم انتخاب
    element.setSelectionRange(startPos, endPos);
    await smartDelay(10);
    
    // تلاش برای استفاده از execCommand برای حفظ undo
    if (typeof document.execCommand === 'function') {
      const execResult = document.execCommand('insertText', false, text);
      if (execResult) {
        logME('[tryInputInsertion] ✅ Used execCommand for undo preservation');
        
        // رویدادهای ضروری
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        return true;
      }
    }
    
    // fallback: جایگزینی مستقیم (بدون undo)
    logME('[tryInputInsertion] ⚠️ Falling back to direct value assignment (no undo)');
    const newValue = currentValue.substring(0, startPos) + text + currentValue.substring(endPos);
    element.value = newValue;
    
    // تنظیم cursor
    const newCursorPosition = startPos + text.length;
    element.setSelectionRange(newCursorPosition, newCursorPosition);
    
    // رویدادهای ضروری
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
    logME('[tryInputInsertion] Error:', error);
    return false;
  }
}

/**
 * پیدا کردن text node در موقعیت مشخص
 */
function findTextNodeAtPosition(element, position) {
  try {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentPos = 0;
    let node;
    
    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (currentPos + length >= position) {
        return node;
      }
      currentPos += length;
    }
    
    return element.firstChild || element;
  } catch (error) {
    logME('[findTextNodeAtPosition] Error:', error);
    return element.firstChild || element;
  }
}

/**
 * جایگزینی ساده (fallback) با حفظ undo capability
 */
function handleSimpleReplacement(element, newValue, start, end) {
  try {
    if (element.isContentEditable) {
      return handleContentEditableWithUndo(element, newValue, start, end);
    } else {
      return handleInputWithUndo(element, newValue, start, end);
    }
  } catch (error) {
    logME('[FrameworkCompatibility] Error in simple replacement:', error);
    return false;
  }
}

/**
 * جایگزینی contentEditable با حفظ undo
 */
function handleContentEditableWithUndo(element, newValue) {
  try {
    // استفاده از execCommand برای حفظ undo (deprecated ولی هنوز کار می‌کند)
    const selection = window.getSelection();
    let hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    
    logME('[handleContentEditableWithUndo] Processing:', {
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
          logME('[handleContentEditableWithUndo] Used execCommand for selection');
          return true;
        }
      } catch (execError) {
        logME('[handleContentEditableWithUndo] execCommand failed:', execError);
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
          logME('[handleContentEditableWithUndo] Used execCommand for full replacement');
          return true;
        }
      } catch (execError) {
        logME('[handleContentEditableWithUndo] execCommand failed:', execError);
      }
      
      // fallback
      element.textContent = newValue;
    }
    
    // رویدادهای ضروری
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  } catch (error) {
    logME('[handleContentEditableWithUndo] Error:', error);
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
        logME('[handleInputWithUndo] Used execCommand for input');
        return true;
      }
    } catch (execError) {
      logME('[handleInputWithUndo] execCommand failed:', execError);
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
    logME('[handleInputWithUndo] Error:', error);
    return false;
  }
}

/**
 * تاخیر ساده
 */
export function smartDelay(baseDelay = 100) {
  return new Promise(resolve => setTimeout(resolve, baseDelay));
}