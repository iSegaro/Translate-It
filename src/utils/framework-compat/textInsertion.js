// src/utils/framework-compat/textInsertion.js

import { logME } from "../helpers.js";
import { checkTextSelection } from "./selectionUtils.js";

/**
 * تشخیص بهترین استراتژی برای المان و سایت
 * @param {HTMLElement} element - المان هدف
 * @returns {string} نوع استراتژی بهینه
 */
function detectOptimalStrategy(element) {
  const hostname = window.location.hostname;

  // Google Docs - استراتژی ویژه
  if (hostname.includes("docs.google.com")) {
    return "google-docs";
  }

  // سایت‌های spellcheck-based (Discord, Twitch)
  if (
    element.hasAttribute("spellcheck") &&
    element.getAttribute("spellcheck") === "true"
  ) {
    return "paste-first";
  }

  // AI platforms که execCommand بهتر کار می‌کند
  if (
    ["chat.openai.com", "claude.ai", "bard.google.com", "butterflies.ai"].some(
      (site) => hostname.includes(site)
    )
  ) {
    return "exec-first";
  }

  // سایت‌هایی که paste event بهتر عمل می‌کند
  if (["discord.com", "twitch.tv"].some((site) => hostname.includes(site))) {
    return "paste-first";
  }

  return "universal";
}

/**
 * جایگذاری بهینه‌شده متن با تشخیص هوشمند استراتژی
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای جایگذاری
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 */
export async function optimizedTextInsertion(
  element,
  text,
  start = null,
  end = null
) {
  if (!element || !text) return false;

  const strategy = detectOptimalStrategy(element);
  const hasSelection = checkTextSelection(element);

  logME(
    "[optimizedTextInsertion] Using strategy:",
    strategy,
    "for",
    window.location.hostname
  );

  // تنظیم انتخاب در صورت نیاز
  if (start !== null && end !== null) {
    if (element.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      const textNode = findTextNodeAtPosition(element, start);
      if (textNode) {
        range.setStart(textNode, Math.min(start, textNode.textContent.length));
        range.setEnd(textNode, Math.min(end, textNode.textContent.length));
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      element.setSelectionRange(start, end);
    }
  }

  switch (strategy) {
    case "google-docs": {
      const googleDocsSuccess = await tryGoogleDocsInsertion(element, text);
      if (googleDocsSuccess) {
        logME("[optimizedTextInsertion] ✅ Google Docs method succeeded");
        return true;
      }
      break;
    }

    case "paste-first": {
      const pasteFirstSuccess =
        (await tryOptimizedPasteInsertion(element, text, hasSelection)) ||
        (await tryExecCommandInsertion(element, text, hasSelection));
      if (pasteFirstSuccess) {
        logME("[optimizedTextInsertion] ✅ Paste-first strategy succeeded");
        return true;
      }
      break;
    }

    case "exec-first": {
      const execFirstSuccess =
        (await tryExecCommandInsertion(element, text, hasSelection)) ||
        (await tryOptimizedPasteInsertion(element, text, hasSelection));
      if (execFirstSuccess) {
        logME("[optimizedTextInsertion] ✅ Exec-first strategy succeeded");
        return true;
      }
      break;
    }
  }

  // اگر استراتژی بهینه موفق نشد، از روش عمومی استفاده کن
  logME("[optimizedTextInsertion] Falling back to universal method");
  return await universalTextInsertion(element, text, start, end);
}

/**
 * جایگذاری عمومی متن - استراتژی چندلایه با تأیید موفقیت
 * استراتژی: execCommand → beforeinput → pasteText → MutationObserver → fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای جایگذاری
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 */
export async function universalTextInsertion(
  element,
  text,
  start = null,
  end = null
) {
  if (!element || !text) return false;

  try {
    // Focus کردن المان
    element.focus();
    await smartDelay(10);

    // ذخیره محتوای اولیه برای تأیید تغییرات
    const initialContent =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    // تنظیم انتخاب در صورت نیاز
    if (start !== null && end !== null) {
      if (element.isContentEditable) {
        // برای contentEditable از selection API استفاده کن
        const selection = window.getSelection();
        const range = document.createRange();

        // پیدا کردن text node مناسب
        const textNode = findTextNodeAtPosition(element, start);
        if (textNode) {
          range.setStart(
            textNode,
            Math.min(start, textNode.textContent.length)
          );
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
    logME("[universalTextInsertion] Initial state:", {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName,
      initialLength: initialContent.length,
    });

    // استراتژی 1: execCommand insertText (بهترین حفظ undo/redo)
    const execSuccess = await tryExecCommandInsertion(
      element,
      text,
      hasSelection
    );
    if (
      execSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logME("[universalTextInsertion] ✅ execCommand succeeded and verified");
      return true;
    }

    // استراتژی 2: Paste Event Simulation (سازگار با frameworks)
    const pasteSuccess = await tryPasteInsertion(element, text, hasSelection);
    if (
      pasteSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logME("[universalTextInsertion] ✅ Paste event succeeded and verified");
      return true;
    }

    // استراتژی 3: beforeinput Event Simulation (مدرن)
    const beforeInputSuccess = await tryBeforeInputInsertion(
      element,
      text,
      hasSelection
    );
    if (
      beforeInputSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logME(
        "[universalTextInsertion] ✅ beforeinput event succeeded and verified"
      );
      return true;
    }

    // استراتژی 4: Element-specific fallback methods
    if (element.isContentEditable) {
      // contentEditable عمومی
      const contentEditableSuccess = await tryContentEditableInsertion(
        element,
        text,
        hasSelection
      );
      if (
        contentEditableSuccess &&
        (await verifyTextInsertion(element, text, initialContent))
      ) {
        logME(
          "[universalTextInsertion] ✅ ContentEditable method succeeded and verified"
        );
        return true;
      }
    } else {
      // Input/textarea
      const inputSuccess = await tryInputInsertion(
        element,
        text,
        hasSelection,
        start,
        end
      );
      if (
        inputSuccess &&
        (await verifyTextInsertion(element, text, initialContent))
      ) {
        logME(
          "[universalTextInsertion] ✅ Input method succeeded and verified"
        );
        return true;
      }
    }

    logME("[universalTextInsertion] ❌ All methods failed verification");
    return false;
  } catch (error) {
    logME("[universalTextInsertion] Error:", error);
    return false;
  }
}

/**
 * تلاش برای جایگذاری با execCommand (بهترین روش برای حفظ undo)
 */
async function tryExecCommandInsertion(element, text, hasSelection) {
  try {
    // بررسی پشتیبانی از execCommand
    if (typeof document.execCommand !== "function") {
      return false;
    }

    logME("[tryExecCommandInsertion] Attempting execCommand insertText", {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName,
    });

    // Focus element first
    element.focus();
    await smartDelay(10);

    // برای input/textarea
    if (!element.isContentEditable) {
      if (hasSelection) {
        // اگر انتخاب دارد، مستقیماً جایگزین کن
        const result = document.execCommand("insertText", false, text);
        if (result) {
          logME(
            "[tryExecCommandInsertion] ✅ execCommand succeeded for input/textarea with selection"
          );
          await smartDelay(50);
          return true;
        }
      } else {
        // اگر انتخاب ندارد، ابتدا همه را انتخاب کن سپس جایگزین کن
        element.setSelectionRange(0, element.value.length);
        await smartDelay(10);
        const result = document.execCommand("insertText", false, text);
        if (result) {
          logME(
            "[tryExecCommandInsertion] ✅ execCommand succeeded for input/textarea full replacement"
          );
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
        const deleteResult = document.execCommand("delete", false);
        await smartDelay(10);
        const insertResult = document.execCommand("insertText", false, text);
        if (deleteResult && insertResult) {
          logME(
            "[tryExecCommandInsertion] ✅ execCommand succeeded for contentEditable with selection"
          );
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
        const deleteResult = document.execCommand("delete", false);
        await smartDelay(10);

        // درج متن جدید
        const insertResult = document.execCommand("insertText", false, text);
        if (deleteResult && insertResult) {
          logME(
            "[tryExecCommandInsertion] ✅ execCommand succeeded for contentEditable full replacement"
          );
          await smartDelay(50);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logME("[tryExecCommandInsertion] Error:", error);
    return false;
  }
}

/**
 * تلاش برای جایگذاری با Paste Event بهینه‌شده (الهام از example.js)
 */
async function tryOptimizedPasteInsertion(element, text, hasSelection) {
  try {
    logME("[tryOptimizedPasteInsertion] Attempting optimized paste insertion");

    // ایجاد DataTransfer object
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);

    // ایجاد paste event
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData,
      data: text,
      dataType: "text/plain",
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    // ویژگی ویژه برای Google Docs (از example.js)
    if (window.location.hostname.includes("docs.google.com")) {
      pasteEvent.docs_plus_ = true;
    }

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        logME(
          "[tryOptimizedPasteInsertion] Selected all content in contentEditable"
        );
      } else {
        element.setSelectionRange(0, element.value.length);
        logME(
          "[tryOptimizedPasteInsertion] Selected all content in input/textarea"
        );
      }
    }

    // Focus element
    element.focus();
    await smartDelay(10);

    // ارسال event
    element.dispatchEvent(pasteEvent);

    // کمی صبر کن تا event پردازش شود
    await smartDelay(100);

    // تنظیف clipboard data
    clipboardData.clearData();

    // بررسی موفقیت
    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    const success = currentText && currentText.includes(text);

    if (success) {
      logME("[tryOptimizedPasteInsertion] ✅ Optimized paste succeeded");
      return true;
    }

    return false;
  } catch (error) {
    logME("[tryOptimizedPasteInsertion] Error:", error);
    return false;
  }
}

/**
 * تلاش برای جایگذاری با Paste Event (روش قدیمی)
 */
async function tryPasteInsertion(element, text, hasSelection) {
  try {
    logME("[tryPasteInsertion] Attempting paste event simulation");

    // ایجاد DataTransfer object
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);

    // ایجاد paste event
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData,
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    // اضافه کردن ویژگی‌های اضافی برای سازگاری بیشتر
    Object.defineProperties(pasteEvent, {
      data: { value: text, writable: false },
      dataType: { value: "text/plain", writable: false },
    });

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن (برای حفظ undo)
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        logME(
          "[tryPasteInsertion] Selected all content in contentEditable for undo preservation"
        );
      } else {
        element.setSelectionRange(0, element.value.length);
        logME(
          "[tryPasteInsertion] Selected all content in input/textarea for undo preservation"
        );
      }
    }

    // ارسال event
    element.dispatchEvent(pasteEvent);

    // تأیید موفقیت
    await smartDelay(100);

    // بررسی اینکه متن واقعاً اضافه شده
    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    if (currentText && currentText.includes(text)) {
      logME("[tryPasteInsertion] Success verified");
      clipboardData.clearData();
      return true;
    }

    clipboardData.clearData();
    return false;
  } catch (error) {
    logME("[tryPasteInsertion] Error:", error);
    return false;
  }
}

/**
 * تلاش برای تزریق با beforeinput event (مدرن)
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای درج
 * @param {boolean} hasSelection - آیا انتخاب دارد
 * @returns {Promise<boolean>}
 */
async function tryBeforeInputInsertion(element, text, hasSelection) {
  try {
    logME("[tryBeforeInputInsertion] Attempting beforeinput event simulation");

    // بررسی پشتیبانی از beforeinput
    if (typeof InputEvent === "undefined") {
      logME("[tryBeforeInputInsertion] InputEvent not supported");
      return false;
    }

    element.focus();
    await smartDelay(10);

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        element.setSelectionRange(0, element.value.length);
      }
    }

    // ایجاد beforeinput event
    const beforeInputEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: text,
    });

    // ارسال beforeinput
    const isAllowed = element.dispatchEvent(beforeInputEvent);
    if (!isAllowed) {
      logME("[tryBeforeInputInsertion] beforeinput was prevented");
      return false;
    }

    // اگر ویرایشگر beforeinput را مدیریت نکرد، خودمان متن را درج می‌کنیم
    await smartDelay(20);

    // ارسال input event
    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      composed: true,
      inputType: "insertText",
      data: text,
    });
    element.dispatchEvent(inputEvent);

    await smartDelay(50);
    return true;
  } catch (error) {
    logME("[tryBeforeInputInsertion] Error:", error);
    return false;
  }
}

/**
 * روش خاص Google Docs
 */
async function tryGoogleDocsInsertion(element, text) {
  try {
    logME("[tryGoogleDocsInsertion] Attempting Google Docs specific method");

    // پیدا کردن iframe Google Docs
    const iframe = document.querySelector(".docs-texteventtarget-iframe");
    if (iframe && iframe.contentDocument) {
      const editableElement = iframe.contentDocument.querySelector(
        "[contenteditable=true]"
      );
      if (editableElement) {
        // استفاده از روش بهینه‌شده paste برای Google Docs
        return await tryOptimizedPasteInsertion(editableElement, text, false);
      }
    }

    // fallback: تلاش روی المان اصلی
    if (element && window.location.hostname.includes("docs.google.com")) {
      return await tryOptimizedPasteInsertion(element, text, false);
    }

    return false;
  } catch (error) {
    logME("[tryGoogleDocsInsertion] Error:", error);
    return false;
  }
}

/**
 * روش عمومی contentEditable (با حفظ undo)
 */
async function tryContentEditableInsertion(element, text, hasSelection) {
  try {
    logME(
      "[tryContentEditableInsertion] Attempting contentEditable insertion with undo preservation"
    );

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
      logME(
        "[tryContentEditableInsertion] Selected all content for full replacement"
      );
    }

    // تلاش برای استفاده از execCommand برای حفظ undo
    if (
      typeof document.execCommand === "function" &&
      selection.rangeCount > 0
    ) {
      // حذف محتوای انتخاب شده
      const deleteResult = document.execCommand("delete", false);
      await smartDelay(10);

      if (deleteResult) {
        // درج متن جدید با حفظ خطوط جدید
        const lines = text.split("\n");
        let insertSuccess = true;

        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            // اضافه کردن line break
            const brResult = document.execCommand("insertHTML", false, "<br>");
            if (!brResult) insertSuccess = false;
          }

          if (lines[i]) {
            // اضافه کردن خط متن
            const textResult = document.execCommand(
              "insertText",
              false,
              lines[i]
            );
            if (!textResult) insertSuccess = false;
          }
        }

        if (insertSuccess) {
          logME(
            "[tryContentEditableInsertion] ✅ Used execCommand for undo preservation"
          );

          // رویدادهای ضروری
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));

          return true;
        }
      }
    }

    // fallback: جایگزینی مستقیم (بدون undo)
    logME(
      "[tryContentEditableInsertion] ⚠️ Falling back to direct DOM manipulation (no undo)"
    );

    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // تبدیل متن به HTML ساده با حفظ خطوط جدید
      const lines = text.split("\n");
      const fragment = document.createDocumentFragment();

      lines.forEach((line, index) => {
        if (index > 0) {
          fragment.appendChild(document.createElement("br"));
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
      element.textContent = "";
      const lines = text.split("\n");

      lines.forEach((line, index) => {
        if (index > 0) {
          element.appendChild(document.createElement("br"));
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
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  } catch (error) {
    logME("[tryContentEditableInsertion] Error:", error);
    return false;
  }
}

/**
 * روش عمومی input/textarea (با حفظ undo)
 */
async function tryInputInsertion(element, text, hasSelection, start, end) {
  try {
    logME(
      "[tryInputInsertion] Attempting input/textarea insertion with undo preservation"
    );

    // Focus element
    element.focus();
    await smartDelay(10);

    const currentValue = element.value || "";
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
    if (typeof document.execCommand === "function") {
      const execResult = document.execCommand("insertText", false, text);
      if (execResult) {
        logME("[tryInputInsertion] ✅ Used execCommand for undo preservation");

        // رویدادهای ضروری
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        return true;
      }
    }

    // fallback: جایگزینی مستقیم (بدون undo)
    logME(
      "[tryInputInsertion] ⚠️ Falling back to direct value assignment (no undo)"
    );
    const newValue =
      currentValue.substring(0, startPos) +
      text +
      currentValue.substring(endPos);
    element.value = newValue;

    // تنظیم cursor
    const newCursorPosition = startPos + text.length;
    element.setSelectionRange(newCursorPosition, newCursorPosition);

    // رویدادهای ضروری
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  } catch (error) {
    logME("[tryInputInsertion] Error:", error);
    return false;
  }
}

/**
 * تأیید موفقیت‌آمیز بودن تزریق متن
 * @param {HTMLElement} element - المان هدف
 * @param {string} expectedText - متن مورد انتظار
 * @param {string} initialContent - محتوای اولیه برای مقایسه
 * @returns {Promise<boolean>}
 */
async function verifyTextInsertion(element, expectedText, initialContent = "") {
  try {
    await smartDelay(50); // اجازه به DOM برای به‌روزرسانی

    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    // بررسی که متن جدید اضافه شده یا تغییری رخ داده
    const hasNewText = currentText && currentText.includes(expectedText);
    const contentChanged = currentText !== initialContent;

    logME("[verifyTextInsertion]", {
      hasNewText,
      contentChanged,
      currentLength: currentText?.length || 0,
      initialLength: initialContent.length,
      expectedTextLength: expectedText.length,
    });

    return hasNewText && contentChanged;
  } catch (error) {
    logME("[verifyTextInsertion] Error:", error);
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
    logME("[findTextNodeAtPosition] Error:", error);
    return element.firstChild || element;
  }
}

/**
 * تاخیر ساده
 */
export function smartDelay(baseDelay = 100) {
  return new Promise((resolve) => setTimeout(resolve, baseDelay));
}
