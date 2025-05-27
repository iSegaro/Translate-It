// src/popup/popupInteractionManager.js

import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import {
  getTranslateWithSelectElementAsync,
  getExtensionEnabledAsync,
} from "../config.js";
import { logME } from "../utils/helpers.js";
import Browser from "webextension-polyfill";

const HOVER_TIMEOUT = 1000;
const AUTO_CLOSE_TIMEOUT = 800;  // زمان انتظار برای بررسی اولیه ورود موس به پاپ‌آپ
const NO_INTERACTION_TIMEOUT = 1000;

// اکشن‌های پیام برای ارتباط با اسکریپت محتوا
const MSG_POPUP_OPENED_CHECK_MOUSE = "POPUP_OPENED_CHECK_MOUSE_V3";
const MSG_MOUSE_MOVED_ON_PAGE = "MOUSE_MOVED_ON_PAGE_BY_CONTENT_SCRIPT_V3";
const MSG_STOP_MOUSE_MOVE_CHECK = "STOP_MOUSE_MOVE_CHECK_BY_POPUP_V3";

// eslint-disable-next-line no-unused-vars
let isMouseOverPopup = false;
let hasEnteredPopup = false;
let hoverStayTimer = null;
let autoCloseTimer = null;
let noInteractionTimer = null;
let interactionLocked = false;

// فلگ برای اینکه آیا اسکریپت محتوا حرکت موس روی صفحه را تایید کرده یا خیر
let mouseConfirmedOnPageByContentScript = false;
let messageListenerAttached = false; // برای جلوگیری از ثبت چندباره شنونده پیام

function logPopupEvent(message, data = null) {
  logME(`📦[PopupDebug]: ${message}`, data || "");
}

function clearAllTimers(reason = "") {
  if (hoverStayTimer) {
    clearTimeout(hoverStayTimer);
    hoverStayTimer = null;
    logPopupEvent("Hover timer canceled", reason);
  }
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
    logPopupEvent("Auto-close timer canceled", reason);
  }
  if (noInteractionTimer) {
    clearTimeout(noInteractionTimer);
    noInteractionTimer = null;
    logPopupEvent("No interaction timer canceled", reason);
  }
}

// تابع برای اطلاع به اسکریپت محتوا جهت توقف بررسی حرکت موس
async function tellContentScriptToStopMouseCheck(reason = "unknown") {
  if (!Browser.runtime?.id) return; // اگر در زمینه نامعتبر هستیم، کاری نکن
  try {
    const tabs = await Browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await Browser.tabs.sendMessage(tabs[0].id, { action: MSG_STOP_MOUSE_MOVE_CHECK, reason });
      logPopupEvent("Sent MSG_STOP_MOUSE_MOVE_CHECK to content script", { reason });
    }
  } catch (error) {
    // اگر اسکریپت محتوا وجود نداشته باشد یا خطایی رخ دهد، مهم نیست، چون هدف توقف تلاش است
    logPopupEvent("Error or no content script to send MSG_STOP_MOUSE_MOVE_CHECK to", { error, reason });
  }
}

function resetState() {
  isMouseOverPopup = false;
  hasEnteredPopup = false;
  interactionLocked = false;
  mouseConfirmedOnPageByContentScript = false;
  
  clearAllTimers("resetState");
  
  // شنونده کلیک خارج از پاپ‌آپ شما حذف می‌شود چون برای کلیک روی صفحه اصلی،
  // ارتباط با اسکریپت محتوا یا رویداد blur پنجره پاپ‌آپ مناسب‌تر است.
  // if (outsideClickListener) {
  //   document.removeEventListener("mousedown", outsideClickListener);
  //   outsideClickListener = null;
  // }

  // اطمینان از اینکه به اسکریپت محتوا گفته می‌شود بررسی را متوقف کند
  // این ممکن است اگر resetState زیاد فراخوانی شود، زیاد ارسال شود، اما برای پاکسازی خوب است.
  tellContentScriptToStopMouseCheck("resetState");
}

// تابع handleOutsideClick شما - این کلیک‌های داخل iframe پاپ‌آپ اما خارج از کانتینر اصلی را تشخیص می‌دهد
// و برای کلیک روی صفحه اصلی قابل اتکا نیست. فعلاً آن را کامنت می‌کنیم.
// function handleOutsideClick(event) {
//   if (!elements.popupContainer?.contains(event.target) && Browser.runtime?.id) {
//     logPopupEvent("Click outside popup container detected (within popup iframe)");
//     if (!interactionLocked) {
//       // Active_SelectElement(true, true);
//       // resetState();
//     }
//   }
// }

async function ensureSelectElementActive() {
  const isEnabled = await getExtensionEnabledAsync();
  const isSelectAllowed = await getTranslateWithSelectElementAsync();

  if (isEnabled && isSelectAllowed && Browser.runtime?.id) {
    setTimeout(() => Active_SelectElement(true, false, true), 100);
    return true;
  }
  return false;
}

// شنونده پیام از اسکریپت محتوا
function handleRuntimeMessages(message, sender) {
  // فقط به پیام‌های اسکریپت محتوای تب فعال گوش بده
  if (sender.tab && message.action === MSG_MOUSE_MOVED_ON_PAGE) {
    logPopupEvent("Received MSG_MOUSE_MOVED_ON_PAGE from content script", { tabId: sender.tab.id });
    
    // اگر این پیام قبل از تعامل با پاپ‌آپ دریافت شده
    if (!hasEnteredPopup && !interactionLocked) {
      mouseConfirmedOnPageByContentScript = true; // فلگ برای جلوگیری از اجرای noInteractionTimer
      logPopupEvent("Mouse on page confirmed by CS. Closing popup, select ON.");
      Active_SelectElement(true, true); // انتخاب فعال، پاپ‌آپ بسته
      clearAllTimers("mouse_on_page_confirmed_by_cs"); // پاک کردن تایمر noInteractionTimer
      // نیازی به resetState() نیست چون پاپ‌آپ بسته می‌شود و unload آن را مدیریت می‌کند.
      // اسکریپت محتوا خودش شنونده‌اش را حذف می‌کند، اما برای اطمینان می‌توانیم دوباره بگوییم.
      tellContentScriptToStopMouseCheck("mouse_on_page_confirmed_and_popup_closing");
    } else {
      logPopupEvent("MSG_MOUSE_MOVED_ON_PAGE received, but popup interaction already started or locked. Ignoring for action.");
      // حتی اگر پاپ‌آپ تعامل داشته، بهتر است به اسکریپت محتوا بگوییم متوقف شود.
      tellContentScriptToStopMouseCheck("mouse_on_page_too_late_popup_interacted");
    }
    // اگر نیاز به پاسخ به اسکریپت محتوا بود، اینجا انجام می‌شد.
    // return Promise.resolve({ received: true }); // اگر نیاز به پاسخ async باشد
  }
  // برای پیام‌های دیگر یا پیام‌های بدون sender.tab (مثلاً از خود افزونه)
  return false; // یا true اگر از sendResponse استفاده می‌کنید و async است
}


function setupInteractionListeners() {
  clearAllTimers("setupInteractionListeners_start");
  mouseConfirmedOnPageByContentScript = false; // ریست کردن فلگ

  // تایمر عدم تعامل کاربر
  noInteractionTimer = setTimeout(async () => { // async برای استفاده از await در tellContentScript...
    // این تایمر اجرا می‌شود اگر:
    // 1. پیام MSG_MOUSE_MOVED_ON_PAGE از اسکریپت محتوا دریافت *نشده* باشد.
    // 2. موس وارد UI پاپ‌آپ نشده باشد (hasEnteredPopup برابر false است).
    // 3. تعامل با کلیک یا هاور طولانی در پاپ‌آپ قفل نشده باشد.
    if (!mouseConfirmedOnPageByContentScript && !hasEnteredPopup && !interactionLocked) {
      logPopupEvent(
        "No interaction timeout: Mouse not on page (no CS confirmation) and no popup interaction. Deactivate select, popup STAYS."
      );
      Active_SelectElement(false); // انتخاب غیرفعال، پاپ‌آپ باز می‌ماند
      // به اسکریپت محتوا اطلاع بده که بررسی را متوقف کند چون ما تصمیم گرفته‌ایم.
      await tellContentScriptToStopMouseCheck("noInteractionTimeout_fired");
      // interactionLocked = true; // این خط توسط شما حذف شده بود که خوب است.
    } else {
      logPopupEvent("No interaction timeout: Conditions not met or already handled.", {
          mouseConfirmedOnPageByContentScript, hasEnteredPopup, interactionLocked
      });
      // اگر پیام از اسکریپت محتوا دریافت نشده ولی شرایط دیگر برقرار نیستند (مثلا hasEnteredPopup)
      // باز هم بهتر است به اسکریپت محتوا اطلاع دهیم که متوقف شود.
      if (!mouseConfirmedOnPageByContentScript) {
          await tellContentScriptToStopMouseCheck("noInteractionTimeout_conditions_not_met_but_no_cs_confirm");
      }
    }
  }, NO_INTERACTION_TIMEOUT);

  // شنونده کلیک خارج از پاپ‌آپ شما (outsideClickListener) برای کلیک روی صفحه اصلی قابل اتکا نیست.
  // برای کلیک روی صفحه اصلی، رویداد blur پنجره پاپ‌آپ (که در راه‌حل‌های قبلی بود) یا پیام از اسکریپت محتوا بهتر است.
  // اگر می‌خواهید کلیک روی قسمت خالی خود پنجره پاپ‌آپ (نه المنت‌ها) را مدیریت کنید، منطق آن متفاوت خواهد بود.

  elements.popupContainer?.addEventListener("mouseenter", async () => {
    isMouseOverPopup = true;
    hasEnteredPopup = true;
    // اگر موس وارد پاپ‌آپ شد، دیگر بررسی حرکت موس روی صفحه توسط اسکریپت محتوا برای این جریان اهمیتی ندارد.
    // همچنین noInteractionTimer باید پاک شود.
    await tellContentScriptToStopMouseCheck("mouseenter_on_popup");
    clearAllTimers("mouseenter_on_popup"); // تایمر noInteractionTimer و دیگر تایمرها را پاک می‌کند

    logPopupEvent("Mouse entered popup");
    
    if (!interactionLocked) {
      hoverStayTimer = setTimeout(async () => {
        interactionLocked = true;
        // نیازی به اطلاع به اسکریپت محتوا نیست، در mouseenter انجام شده.
        logPopupEvent("Hover timeout passed – locking interaction & deactivating select");
        Active_SelectElement(false);
      }, HOVER_TIMEOUT);
    }
  });

  elements.popupContainer?.addEventListener("mouseleave", () => {
    isMouseOverPopup = false;
    if (hoverStayTimer) {
      clearTimeout(hoverStayTimer);
      hoverStayTimer = null;
      logPopupEvent("Hover timer canceled", "mouseleave_from_popup");
    }

    if (!interactionLocked && hasEnteredPopup) { // فقط اگر قبلا وارد شده باشد
      autoCloseTimer = setTimeout(async () => {
        // اگر پاپ‌آپ خودکار بسته می‌شود، یعنی کاربر پس از ورود به آن، روی آن تمرکز نکرده.
        // مثل این است که به صفحه رفته است.
        await tellContentScriptToStopMouseCheck("mouseleave_autoclose_popup");
        logPopupEvent("Mouse left early after entering – closing popup (select remains active)");
        Active_SelectElement(true, true);
        // resetState(); // تابع unload این کار را انجام می‌دهد. از فراخوانی دوباره خودداری کنید.
      }, AUTO_CLOSE_TIMEOUT);
    }
  });

  elements.popupContainer?.addEventListener("mousedown", async () => {
    if (!interactionLocked) {
      interactionLocked = true;
      hasEnteredPopup = true; // کلیک داخل پاپ‌آپ به معنی "ورود" و تعامل است
      await tellContentScriptToStopMouseCheck("mousedown_on_popup");
      clearAllTimers("popup_click");
      logPopupEvent("User clicked inside popup – locking & deactivating select");
      Active_SelectElement(false);
    }
  });
}

export async function init() {
  logPopupEvent("INIT");
  resetState(); // این تابع در ابتدا tellContentScriptToStopMouseCheck را فراخوانی می‌کند.
  
  // ثبت شنونده پیام‌ها
  if (!messageListenerAttached) {
    Browser.runtime.onMessage.addListener(handleRuntimeMessages);
    messageListenerAttached = true;
  }

  const isActive = await ensureSelectElementActive();
  if (isActive && Browser.runtime?.id) { // بررسی زمینه افزونه
    setupInteractionListeners();
    // به اسکریپت محتوا اطلاع بده که بررسی حرکت موس روی صفحه را شروع کند
    try {
      const tabs = await Browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        logPopupEvent("Sending POPUP_OPENED_CHECK_MOUSE to content script", {tabId: tabs[0].id});
        await Browser.tabs.sendMessage(tabs[0].id, { action: MSG_POPUP_OPENED_CHECK_MOUSE });
      } else {
        logPopupEvent("No active tab found to send POPUP_OPENED_CHECK_MOUSE");
        // اگر نتوانیم به اسکریپت محتوا اطلاع دهیم، noInteractionTimer در نهایت اجرا شده
        // و منجر به "پاپ‌آپ باز، انتخاب غیرفعال" می‌شود که یک رفتار بازگشتی امن است.
      }
    } catch (error) {
      logPopupEvent("Error sending POPUP_OPENED_CHECK_MOUSE to content script", error);
    }
  }

  // رویداد 'unload' روی window برای بسته شدن پاپ‌آپ قابل اتکاترین است.
  window.addEventListener("unload", () => {
    logPopupEvent("Popup unload event triggered.");
    // شنونده پیام باید حذف شود تا از خطا در صورت رسیدن پیام پس از بسته شدن پاپ‌آپ جلوگیری شود.
    // اگرچه در پاپ‌آپ‌ها، context از بین می‌رود و شنونده‌ها معمولاً با آن می‌میرند.
    if (messageListenerAttached) {
      Browser.runtime.onMessage.removeListener(handleRuntimeMessages);
      messageListenerAttached = false;
    }
    resetState(); // این تابع tellContentScriptToStopMouseCheck را فراخوانی می‌کند
  });
  logPopupEvent("READY");
}

export function cleanup() { // تابع شما
  logPopupEvent("CLEANUP called by external");
  // window.removeEventListener("unload", resetState); // این در کد شما مشکل‌ساز بود، resetState کافی است.
  // شنونده unload بهتر است درون init مدیریت شود.
  if (messageListenerAttached) {
    Browser.runtime.onMessage.removeListener(handleRuntimeMessages);
    messageListenerAttached = false;
  }
  resetState();
}