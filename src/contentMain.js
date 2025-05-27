// src/contentMain.js

import Browser from "webextension-polyfill";
import { CONFIG, state } from "./config.js";
import { injectPageBridge } from "./backgrounds/bridgeIntegration.js";
import {
  isExtensionContextValid,
  taggleLinks,
  injectStyle,
  logME,
  logMethod,
} from "./utils/helpers.js";
import { revertTranslations } from "./utils/textExtraction.js";
import { getTranslationHandlerInstance } from "./core/InstanceManager.js";
import { detectPlatform } from "./utils/platformDetector.js";
import { ErrorTypes } from "./services/ErrorTypes.js";

// اکشن‌های پیام برای پاپ‌آپ (باید با پاپ‌آپ یکسان باشند)
const MSG_POPUP_OPENED_CHECK_MOUSE = "POPUP_OPENED_CHECK_MOUSE_V3";
const MSG_MOUSE_MOVED_ON_PAGE = "MOUSE_MOVED_ON_PAGE_BY_CONTENT_SCRIPT_V3";
const MSG_STOP_MOUSE_MOVE_CHECK = "STOP_MOUSE_MOVE_CHECK_BY_POPUP_V3";
const MOUSE_MOVE_THRESHOLD_ON_PAGE = 15; // پیکسل - آستانه حرکت موس روی صفحه

let translationHandler = null;

export function initContentScript() {
  if (window.__AI_WRITING_EXTENSION_ACTIVE__) {
    logME("[AIWriting] Skipping double init.");
    return;
  }

  window.__AI_WRITING_EXTENSION_ACTIVE__ = true;

  class ContentScript {
    constructor() {
      this.boundHandlePageMouseMoveForPopup = null; // برای bind کردن this
      this.initialMousePositionOnPageForContent = null;
      this.popupJustClosedForSelection = false;
      this.popupJustClosedForSelectionTimeout = null;

      injectPageBridge();
      injectStyle();
      this.translationHandler = getTranslationHandlerInstance();
      this.initPolyfills();
      this.init();
    }

    initPolyfills() {
      if (!Element.prototype.matches) {
        Element.prototype.matches =
          Element.prototype.msMatchesSelector ||
          function (selector) {
            const matches = (
              this.document || this.ownerDocument
            ).querySelectorAll(selector);
            let i = matches.length;
            // eslint-disable-next-line no-empty
            while (--i >= 0 && matches.item(i) !== this) {
              // ignore error
            }
            return i > -1;
          };
      }

      if (!Element.prototype.closest) {
        Element.prototype.closest = function (selector) {
          let el = this;
          while (el) {
            if (el.matches(selector)) return el;
            el = el.parentElement;
          }
          return null;
        };
      }
    }

    init() {
      if (!isExtensionContextValid()) {
        console.warn(
          "[AI Writing Companion] ❌ Extension context is not valid"
        );
        this.translationHandler.notifier.show(
          "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
          "error",
          true
        );
        return;
      }

      Object.freeze(CONFIG);
      this.setupUpdateSelectElementState();
      this.setupPagehideListener();
      this.setupMessageListener(); // شنونده پیام اصلی افزونه
      this.setupBridgeListener();

      logME("[AI Writing Companion] ✅ Extension initialized successfully!");
    }

    setupPagehideListener() {
      window.addEventListener("pagehide", () => {
        logME("[ContentCS] Pagehide event triggered.");
        this.translationHandler.IconManager?.cleanup?.();
        if (state.selectElementActive) { // فقط اگر فعال بود، غیرفعال کن
            this.updateSelectElementState(false);
        }
        this._removePageMouseMoveListenerForPopup();
        // پاک کردن فلگ و تایمر در صورت خروج از صفحه
        if (this.popupJustClosedForSelectionTimeout) clearTimeout(this.popupJustClosedForSelectionTimeout);
        this.popupJustClosedForSelection = false;
      });

      window.addEventListener("blur", () => {
        logME("[ContentCS] Main window blurred. Current selectElementActive state:", state.selectElementActive, "popupJustClosedForSelection:", this.popupJustClosedForSelection);
        
        // اگر پاپ‌آپ به تازگی برای انتخاب بسته شده، این blur را نادیده بگیر
        if (this.popupJustClosedForSelection) {
            logME("[ContentCS] Main window blur: Ignoring due to recent popup closure for selection.");
            // فلگ پس از تاخیرش خود به خود false می‌شود، یا اینجا هم می‌توان false کرد اگر تاخیر کوتاه است
            // this.popupJustClosedForSelection = false; // اگر می‌خواهید بلافاصله پس از اولین blur ریست شود
            return; 
        }

        // اگر حالت انتخاب فعال است و دلیل خاصی برای نادیده گرفتن blur نیست، آن را غیرفعال کن
        if (state.selectElementActive) {
          logME("[ContentCS] Main window blur: Standard deactivation of select element state.");
          this.updateSelectElementState(false);
        }
        this._removePageMouseMoveListenerForPopup(); // شنونده موس را هم متوقف کن
      });
    }

    setupUpdateSelectElementState() {
      this.translationHandler.updateSelectElementState =
        this.updateSelectElementState.bind(this);
    }

    @logMethod
    async updateSelectElementState(newState) {
      if (!isExtensionContextValid()) {
        logME("[Content] Invalid context, skipping updateSelectElementState.");
        return;
      }

      // این بخش ممکن است نیاز به بررسی داشته باشد که آیا featureManager قبل از translationHandler مقداردهی شده
      if (this.translationHandler.featureManager && !this.translationHandler.featureManager.isOn("EXTENSION_ENABLED")) {
        newState = false;
      } else if (!this.translationHandler.featureManager) {
        // اگر featureManager هنوز آماده نیست، ممکن است بخواهید یک رفتار پیش‌فرض داشته باشید
        // یا صبر کنید. برای سادگی فعلا اینگونه رها شده.
        logME("[Content] featureManager not available in updateSelectElementState");
      }

      try {
        // اگر حالت انتخاب در حال فعال شدن است (توسط پاپ‌آپ)، فلگ مربوط به blur را تنظیم کن
        // این کار بهتر است در پاسخ به پیامی باشد که مستقیماً از پاپ‌آپ می‌آید و نشان‌دهنده این اتفاق است.
        // `TOGGLE_SELECT_ELEMENT_MODE` که از پاپ‌آپ می‌آید، جای بهتری برای تنظیم این فلگ است.
        // if (newState === true) {
        //   this.popupJustClosedForSelection = true;
        //   logME("[ContentCS] Flag 'popupJustClosedForSelection' set TRUE during updateSelectElementState(true).");
        //   if (this.popupJustClosedForSelectionTimeout) clearTimeout(this.popupJustClosedForSelectionTimeout);
        //   this.popupJustClosedForSelectionTimeout = setTimeout(() => {
        //     this.popupJustClosedForSelection = false;
        //     logME("[ContentCS] Flag 'popupJustClosedForSelection' auto-reset to FALSE after timeout.");
        //   }, 500); // 500 میلی‌ثانیه برای پوشش دادن رویداد blur
        // }

        state.selectElementActive = newState;
        await Browser.runtime.sendMessage({
          action: "UPDATE_SELECT_ELEMENT_STATE",
          data: newState,
        });

        taggleLinks(newState);

        if (!newState) {
          this.translationHandler.IconManager?.cleanup?.();
        }
      } catch (error) {
        logME("[Content] Error in updateSelectElementState => ", error);
        this.translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.CONTEXT,
          context: "updateSelectElementState",
        });
      }
    }

    // --- متدهای مربوط به تشخیص حرکت موس برای پاپ‌آپ ---
    _getMousePagePosition(event) {
      return { x: event.clientX, y: event.clientY };
    }

    _hasMouseMovedSignificantlyOnPage(currentPos) {
      if (!this.initialMousePositionOnPageForContent) return false;
      const deltaX = Math.abs(currentPos.x - this.initialMousePositionOnPageForContent.x);
      const deltaY = Math.abs(currentPos.y - this.initialMousePositionOnPageForContent.y);
      return deltaX > MOUSE_MOVE_THRESHOLD_ON_PAGE || deltaY > MOUSE_MOVE_THRESHOLD_ON_PAGE;
    }

    _handlePageMouseMoveForPopup(event) {
      if (!this.initialMousePositionOnPageForContent) {
        this.initialMousePositionOnPageForContent = this._getMousePagePosition(event);
        logME("[ContentCS] Initial mouse position captured on page for popup check (class):", this.initialMousePositionOnPageForContent);
        return;
      }
      const currentMousePosition = this._getMousePagePosition(event);
      if (this._hasMouseMovedSignificantlyOnPage(currentMousePosition)) {
        logME("[ContentCS] Significant mouse movement detected on page (class method).");
        Browser.runtime.sendMessage({ action: MSG_MOUSE_MOVED_ON_PAGE })
          .then(() => logME("[ContentCS] Sent MSG_MOUSE_MOVED_ON_PAGE to popup/runtime."))
          .catch(err => logME("[ContentCS] Error sending MSG_MOUSE_MOVED_ON_PAGE:", err));
        this._removePageMouseMoveListenerForPopup(); // پس از ارسال پیام، شنونده را حذف کن
      }
    }
    
    _addPageMouseMoveListenerForPopup() {
      if (this.boundHandlePageMouseMoveForPopup) { // اگر شنونده‌ای از قبل وجود دارد، حذفش کن
        this._removePageMouseMoveListenerForPopup();
      }
      this.initialMousePositionOnPageForContent = null; // موقعیت اولیه را ریست کن
      // bind(this) برای حفظ context صحیح this در داخل _handlePageMouseMoveForPopup
      this.boundHandlePageMouseMoveForPopup = this._handlePageMouseMoveForPopup.bind(this); 
      document.addEventListener('mousemove', this.boundHandlePageMouseMoveForPopup, { passive: true });
      logME("[ContentCS] Added mousemove listener to page document (class method for popup).");
    }

    _removePageMouseMoveListenerForPopup() {
      if (this.boundHandlePageMouseMoveForPopup) {
        document.removeEventListener('mousemove', this.boundHandlePageMouseMoveForPopup);
        this.boundHandlePageMouseMoveForPopup = null;
        this.initialMousePositionOnPageForContent = null;
        logME("[ContentCS] Removed mousemove listener from page document (class method for popup).");
      }
    }
    // --- پایان متدهای تشخیص حرکت موس ---

    setupMessageListener() {
      Browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    @logMethod
    async handleMessage(message, sender, sendResponse) {
      try {
        const action = message.action || message.type;
        // logME(`[ContentCS] handleMessage received action: ${action}`, message); // برای دیباگ اولیه پیام‌ها

        switch (action) {
          // --- Case های جدید برای ارتباط با پاپ‌آپ ---
          case MSG_POPUP_OPENED_CHECK_MOUSE:
            logME(`[ContentCS] Received ${MSG_POPUP_OPENED_CHECK_MOUSE}. Starting to listen for mouse movement.`);
            this._addPageMouseMoveListenerForPopup();
            // پاسخی برای این پیام لازم نیست، مگر اینکه پاپ‌آپ منتظر تایید باشد
            // if (sendResponse) sendResponse({status: "listening_started"});
            return false; // چون sendResponse بلافاصله فراخوانی نمی‌شود

          case MSG_STOP_MOUSE_MOVE_CHECK:
            logME(`[ContentCS] Received ${MSG_STOP_MOUSE_MOVE_CHECK}. Reason: ${message.reason}. Stopping mouse movement listener.`);
            this._removePageMouseMoveListenerForPopup();
            // if (sendResponse) sendResponse({status: "listening_stopped"});
            return false;
          // --- پایان Case های جدید ---

          // --- Case های اصلی شما ---
          case "TOGGLE_SELECT_ELEMENT_MODE": // این پیام از پاپ‌آپ برای تغییر حالت می‌آید
            logME("[ContentCS] Received TOGGLE_SELECT_ELEMENT_MODE with data:", message.data);
            if (message.data === true) { // اگر پاپ‌آپ دستور فعال‌سازی داده
                this.popupJustClosedForSelection = true;
                logME("[ContentCS] Flag 'popupJustClosedForSelection' set TRUE via TOGGLE_SELECT_ELEMENT_MODE.");
                if (this.popupJustClosedForSelectionTimeout) clearTimeout(this.popupJustClosedForSelectionTimeout);
                this.popupJustClosedForSelectionTimeout = setTimeout(() => {
                    this.popupJustClosedForSelection = false;
                    logME("[ContentCS] Flag 'popupJustClosedForSelection' auto-reset to FALSE after timeout.");
                }, 500); // 500 میلی‌ثانیه برای پوشش دادن رویداد blur
            }
            this.updateSelectElementState(message.data); // وضعیت را به‌روز کن
            return false;

          case "getSelectedText": {
            const selectedText =
              window.getSelection()?.toString()?.trim() ?? "";
            // برای sendResponse آسنکرون، باید promise برگردانده شود یا true و sendResponse بعداً فراخوانی شود
            Promise.resolve({ selectedText }).then(sendResponse);
            return true; 
          }

          case "CONTEXT_INVALID":
          case "EXTENSION_RELOADED": {
            Browser.runtime.sendMessage({
              action: "CONTENT_SCRIPT_WILL_RELOAD",
            });
            const reloadNotif = this.translationHandler.notifier.show(
              "لطفا صفحه را رفرش کنید", "info", true, 2000
            );
            setTimeout(() => {
              this.translationHandler.notifier.dismiss(reloadNotif);
            }, 3000);
            return false;
          }

          case "applyTranslationToActiveElement": {
            const active = document.activeElement;
            const translated = message.payload?.translatedText;
            let didApply = false; // استفاده از خروجی استراتژی برای تعیین موفقیت

            if (active && typeof translated === "string") {
              try {
                const platform =
                  this.translationHandler.detectPlatform?.(active) ??
                  detectPlatform(active);

                if (
                  this.translationHandler.strategies[platform]?.updateElement &&
                  typeof this.translationHandler.strategies[platform]
                    .updateElement === "function"
                ) {
                  didApply = await this.translationHandler.strategies[
                    platform
                  ].updateElement(active, translated);
                } else {
                  if (active.isContentEditable) {
                    active.innerText = translated;
                    didApply = true;
                  } else if ("value" in active) {
                    active.value = translated;
                    didApply = true;
                  }
                  logME("[Content] Applied via fallback method");
                }

                // اطلاع‌رسانی به فرم برای بروزرسانی
                active.dispatchEvent(new Event("input", { bubbles: true }));
                active.dispatchEvent(new Event("change", { bubbles: true }));

                Promise.resolve({ success: !!didApply }).then(sendResponse); // ارسال نتیجه واقعی
              } catch (err) {
                logME("[Content] Strategy failed", err);
                Promise.resolve({
                  success: false,
                  error: err?.message || "Strategy failed",
                }).then(sendResponse);
              }
            } else {
              Promise.resolve({
                success: false,
                error: "No active field or invalid content.",
              }).then(sendResponse);
            }
            return true; // برای sendResponse آسنکرون
          }
          
          case "revertAllAndEscape":
            logME("Received revertAllAndEscape in content script");
            revertTranslations({
              state, 
              errorHandler: this.translationHandler.errorHandler,
              notifier: this.translationHandler.notifier,
              IconManager: this.translationHandler.IconManager,
            });
            return false;
          // --- پایان Case های اصلی شما ---

          default:
            logME("[ContentCS] Unknown message in handleMessage:", message);
            // اگر sendResponse مورد انتظار بوده و هیچ case ای آن را مدیریت نکرده، false برگردانید
            return false; 
        }
      } catch (error) {
        logME("[ContentCS] Error in handleMessage:", error);
        this.translationHandler.notifier?.dismiss();
        this.translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.INTEGRATION,
          context: "message-listener",
        });
        // اگر در حین پردازش خطا رخ دهد و sendResponse هنوز فراخوانی نشده،
        // بهتر است یک پاسخ خطا ارسال شود اگر کانال پیام هنوز باز است.
        // این بخش نیاز به بررسی دقیق‌تر دارد که آیا sendResponse باید اینجا فراخوانی شود یا خیر.
        // به طور کلی، هر path ای که sendResponse را فراخوانی می‌کند باید true برگرداند.
        // Promise.reject(error).catch(sendResponse); // راهی برای ارسال خطا
        return false; // یا true بسته به مدیریت خطا و sendResponse
      }
    }

    setupBridgeListener() {
      window.addEventListener("message", async (event) => {
        if (
          event.source !== window ||
          event.data?.type !== "AI_WRITING_TRANSLATE_REQUEST"
        )
          return;

        const { text, translateMode } = event.data;

        try {
          const response = await Browser.runtime.sendMessage({
            action: "fetchTranslation",
            payload: {
              promptText: text,
              translationMode: translateMode,
            },
          });

          window.postMessage(
            {
              type: "AI_WRITING_TRANSLATE_RESPONSE",
              result: response,
              original: { ...event.data },
            },
            "*"
          );
        } catch (err) {
          window.postMessage(
            {
              type: "AI_WRITING_TRANSLATE_RESPONSE",
              error: err?.message || err?.toString() || "bridge content error",
              original: { ...event.data },
            },
            "*"
          );
        }
      });
    }
  } // پایان کلاس ContentScript

  const contentScriptInstance = new ContentScript(); // نمونه سازی از کلاس
  translationHandler = contentScriptInstance.translationHandler; // مقداردهی translationHandler عمومی
} // پایان initContentScript

export { translationHandler };