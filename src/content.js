// src/content.js
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

let translationHandler = null; // ← متغیر exportی تعریف می‌شود

(function initOnce() {
  if (window.__AI_WRITING_EXTENSION_ACTIVE__) {
    console.debug("[AIWriting] Skipping double init.");
    return;
  }

  class ContentScript {
    constructor() {
      injectPageBridge(); // ← تزریق bridge در شروع
      injectStyle();
      this.translationHandler = getTranslationHandlerInstance();
      this.initPolyfills();
      this.init();
      this.markScriptAsInjected();
    }

    markScriptAsInjected() {
      window.__AI_WRITING_EXTENSION_ACTIVE__ = true;
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
      if (isExtensionContextValid()) {
        console.info("[AIWriting:Content] Extension initialized successfully!");
        this.setupUpdateSelectElementState();
        Object.freeze(CONFIG);
        this.setupPagehideListener();
        this.setupMessageListener();
        this.setupBridgeListener();
      } else {
        console.warn("[AIWriting:Content] Extension context is not valid");
        this.translationHandler.notifier.show(
          "خطای بارگذاری افزونه - لطفا صفحه را رفرش کنید",
          "error",
          true
        );
      }
    }

    setupPagehideListener() {
      window.addEventListener("pagehide", () => {
        if (this.translationHandler.IconManager) {
          this.translationHandler.IconManager.cleanup();
        }
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
      if (isExtensionContextValid()) {
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
          if (!newState && this.translationHandler.IconManager) {
            this.translationHandler.IconManager.cleanup();
          }
        } catch (error) {
          logME("[Content] Error in updateSelectElementState => ", error);
          if (error.message?.includes("context invalidated")) {
            logME("[Content] Extension context invalidated");
          } else {
            throw this.translationHandler.errorHandler.handle(error, {
              type: this.translationHandler.ErrorTypes.CONTEXT,
              context: "updateSelectElementState",
            });
          }
        }
      } else {
        logME("[Content] Invalid context, skipping updateSelectElementState.");
      }
    }

    setupMessageListener() {
      Browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    @logMethod
    async handleMessage(message, sender, sendResponse) {
      try {
        if (message && (message.action || message.type)) {
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

              console.log("[Content] activeElement is:", active);
              console.log("[Content] translated text is:", translated);

              if (active && typeof translated === "string") {
                try {
                  const platform =
                    this.translationHandler.detectPlatform?.(active) ??
                    detectPlatform(active);

                  console.log(
                    "[Content] Detected platform for applyTranslation:",
                    platform
                  );

                  if (
                    this.translationHandler.strategies[platform]
                      ?.updateElement &&
                    typeof this.translationHandler.strategies[platform]
                      .updateElement === "function"
                  ) {
                    await this.translationHandler.strategies[
                      platform
                    ].updateElement(active, translated);
                    console.log("[Content] Applied via platform strategy");
                  } else {
                    if (active.isContentEditable) {
                      active.innerText = translated;
                    } else if ("value" in active) {
                      active.value = translated;
                    }
                    console.log("[Content] Applied via fallback method");
                  }

                  active.dispatchEvent(new Event("input", { bubbles: true }));
                  active.dispatchEvent(new Event("change", { bubbles: true }));

                  sendResponse({ success: true });
                } catch (err) {
                  console.warn("[Content] Strategy failed", err);
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
        }
      } catch (error) {
        this.translationHandler.notifier?.dismiss();
        this.translationHandler.errorHandler.handle(error, {
          type: this.translationHandler.ErrorTypes.INTEGRATION,
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

        const { text, translateMode, __requestId } = event.data;

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

  // 👇 شروع main اصلی content script
  window.__AI_WRITING_EXTENSION_ACTIVE__ = true;
  const contentScript = new ContentScript();
  translationHandler = contentScript.translationHandler;
})();

export { translationHandler };
