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

let translationHandler = null;

export function initContentScript() {
  if (window.__AI_WRITING_EXTENSION_ACTIVE__) {
    logME("[AIWriting] Skipping double init.");
    return;
  }

  window.__AI_WRITING_EXTENSION_ACTIVE__ = true;

  class ContentScript {
    constructor() {
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
              ).querySelectorAll(selector),
              i = matches.length;
            while (--i >= 0 && matches.item(i) !== this) {}
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
      this.setupMessageListener();
      this.setupBridgeListener();

      logME("[AI Writing Companion] ✅ Extension initialized successfully!");
    }

    setupPagehideListener() {
      window.addEventListener("pagehide", () => {
        this.translationHandler.IconManager?.cleanup?.();
        state.selectElementActive = false;
        this.updateSelectElementState(false);
      });

      window.addEventListener("blur", () => {
        if (state.selectElementActive) {
          state.selectElementActive = false;
          this.updateSelectElementState(false);
        }
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

      if (!this.translationHandler.featureManager.isOn("EXTENSION_ENABLED")) {
        newState = false;
      }

      try {
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

    setupMessageListener() {
      Browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    @logMethod
    async handleMessage(message, sender, sendResponse) {
      try {
        if (!message?.action && !message?.type) return false;

        switch (message.action || message.type) {
          case "TOGGLE_SELECT_ELEMENT_MODE":
            this.updateSelectElementState(message.data);
            return false;

          case "getSelectedText":
            const selectedText =
              window.getSelection()?.toString()?.trim() ?? "";
            sendResponse({ selectedText });
            return true;

          case "CONTEXT_INVALID":
          case "EXTENSION_RELOADED":
            Browser.runtime.sendMessage({
              action: "CONTENT_SCRIPT_WILL_RELOAD",
            });

            const reloadNotif = this.translationHandler.notifier.show(
              "لطفا صفحه را رفرش کنید",
              "info",
              true,
              2000
            );

            setTimeout(() => {
              this.translationHandler.notifier.dismiss(reloadNotif);
            }, 3000);

            return false;

          case "applyTranslationToActiveElement": {
            const active = document.activeElement;
            const translated = message.payload?.translatedText;

            if (active && typeof translated === "string") {
              try {
                const platform =
                  this.translationHandler.detectPlatform?.(active) ??
                  detectPlatform(active);

                // استفاده از خروجی استراتژی برای تعیین موفقیت
                let didApply = false;

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

                sendResponse({ success: !!didApply }); // ارسال نتیجه واقعی
              } catch (err) {
                logME("[Content] Strategy failed", err);
                sendResponse({
                  success: false,
                  error: err?.message || "Strategy failed",
                });
              }
            } else {
              sendResponse({
                success: false,
                error: "No active field or invalid content.",
              });
            }

            return true;
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

          default:
            logME("[Content] Unknown message:", message);
            return false;
        }
      } catch (error) {
        this.translationHandler.notifier?.dismiss();
        this.translationHandler.errorHandler.handle(error, {
          type: ErrorTypes.INTEGRATION,
          context: "message-listener",
        });
        return false;
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
  }

  const contentScript = new ContentScript();
  translationHandler = contentScript.translationHandler;
}

export { translationHandler };
