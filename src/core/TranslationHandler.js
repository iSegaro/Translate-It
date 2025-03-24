// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
import InstagramStrategy from "../strategies/InstagramStrategy.js";
import TwitterStrategy from "../strategies/TwitterStrategy.js";
import TelegramStrategy from "../strategies/TelegramStrategy.js";
import MediumStrategy from "../strategies/MediumStrategy.js";
import ChatGPTStrategy from "../strategies/ChatGPTStrategy.js";
import YoutubeStrategy from "../strategies/YoutubeStrategy.js";
import DefaultStrategy from "../strategies/DefaultStrategy.js";
import NotificationManager from "../managers/NotificationManager.js";
import IconManager from "../managers/IconManager.js";
import { debounce } from "../utils/debounce.js";
import { CONFIG, state, TRANSLATION_ERRORS } from "../config.js";
import { translateText } from "../utils/api.js";
import { openOptionsPage, isExtensionContextValid } from "../utils/helpers.js";
import {
  detectPlatform,
  getPlatformName,
  detectPlatformByURL,
} from "../utils/platformDetector.js";
import EventHandler from "./EventHandler.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

export default class TranslationHandler {
  constructor() {
    // ابتدا notifier را ایجاد می‌کنیم تا برای ErrorHandler موجود باشد
    this.notifier = new NotificationManager();
    this.errorHandler = new ErrorHandler(this.notifier);
    this.ErrorTypes = ErrorTypes;
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);

    this.strategies = {
      whatsapp: new WhatsAppStrategy(this.notifier, this.errorHandler),
      instagram: new InstagramStrategy(this.notifier, this.errorHandler),
      medium: new MediumStrategy(this.notifier, this.errorHandler),
      telegram: new TelegramStrategy(this.notifier, this.errorHandler),
      twitter: new TwitterStrategy(this.notifier, this.errorHandler),
      chatgpt: new ChatGPTStrategy(this.notifier, this.errorHandler),
      youtube: new YoutubeStrategy(this.notifier, this.errorHandler),
      default: new DefaultStrategy(this.notifier, this.errorHandler),
    };

    this.validateStrategies();
    this.IconManager = new IconManager(this.errorHandler);
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.selectionModeActive = false;
    this.eventHandler = new EventHandler(this);
  }

  // در TranslationHandler.js
  reinitialize() {
    console.debug("Reinitializing TranslationHandler state after update...");
    this.isProcessing = false;
    this.selectionModeActive = false;
    // در صورت نیاز، متغیرهای داخلی دیگر مانند caches یا stateهای دیگر را هم ریست کنید
    // برای مثال:
    // state.originalTexts.clear();
    // this.IconManager.cleanup();
  }

  /**
   * Main event handler router
   */
  async handleEvent(event) {
    try {
      await this.eventHandler.handleEvent(event);
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.UI,
        context: "handleEvent",
        eventType: event.type,
      });
      throw handlerError;
    }
  }

  handleError(error, meta = {}) {
    try {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      this.errorHandler.handle(normalizedError, {
        ...meta,
        origin: "TranslationHandler",
      });
    } catch (error) {
      console.debug("TranslationHandler:Error handling failed:", error);
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "TranslationHandler-handleError",
      });
      throw handlerError;
    }
  }

  handleEditableFocus(element) {
    this.eventHandler.handleEditableFocus(element);
  }

  handleEditableBlur() {
    this.eventHandler.handleEditableBlur();
  }

  handleEscape(event) {
    this.eventHandler.handleEscape(event);
  }

  async handleCtrlSlash(event) {
    await this.eventHandler.handleCtrlSlash(event);
  }

  async handleSelectElement(event) {
    await this.eventHandler.handleSelectElement(event);
  }

  async handleEditableElement(event) {
    await this.eventHandler.handleEditableElement(event);
  }

  async processTranslation(params) {
    console.debug("TranslationHandler: Processing translation...", params);
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    try {
      if (!isExtensionContextValid()) {
        throw new Error(
          "TranslationHandler: Translation failed: Context Invalid",
          {
            type: ErrorTypes.CONTEXT,
            translationParams: params,
          }
        );
      }

      // if (!params.text || !params.target) {
      //   console.warn("TranslationHandler: Invalid parameter", params);
      //   throw new Error("TranslationHandler: Translation failed, Invalid parameter", {
      //     type: ErrorTypes.CONTEXT,
      //     translationParams: params,
      //   });
      // }

      const platform =
        params.target ? detectPlatform(params.target) : detectPlatformByURL();
      state.translationMode = params.selectionRange ? "selection" : "field";

      const translated = await translateText(params.text);

      console.debug("TranslationHandler: Translation result => ", translated);
      if (!translated) {
        throw new Error(TRANSLATION_ERRORS.INVALID_CONTEXT, {
          type: ErrorTypes.CONTEXT,
          context: "processTranslation-text",
        });
      }

      // اگر کاربر متنی را انتخاب کرده باشد، آن را ترجمه کن
      if (params.selectionRange) {
        this.handleSelectionTranslation(platform, params, translated);
      }
      // در غیر این صورت، ترجمه را در عنصر هدف نمایش بده
      else if (params.target) {
        this.updateTargetElement(params.target, translated);
      }
    } catch (error) {
      const errorType = error.type || ErrorTypes.CONTEXT;

      const handlerError = this.errorHandler.handle(error, {
        type: errorType,
        context: "TranslationHandler-processTranslation",
        translationParams: params,
        isPrimary: true,
      });

      const finalError = new Error(handlerError.message);
      Object.assign(finalError, {
        type: handlerError.type,
        statusCode: handlerError.statusCode,
        isFinal: true,
        originalError: error,
      });

      throw finalError;
    } finally {
      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }
    }
  }

  /**
   * اعتبارسنجی استراتژیها
   */
  async validateStrategies() {
    try {
      Object.entries(this.strategies).forEach(([name, strategy]) => {
        if (typeof strategy.extractText !== "function") {
          throw new Error(
            `استراتژی ${name} متد extractText را پیاده‌سازی نکرده است`
          );
        }
      });
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: "strategy-validation",
      });
    }
  }

  async handleSelectionTranslation(platform, params, translated) {
    try {
      if (typeof translated !== "string" && !translated) {
        return;
      }
      if (this.strategies[platform]?.replaceSelection) {
        await this.strategies[platform].replaceSelection(
          params.selectionRange,
          translated
        );
      } else {
        this.errorHandler.handle(
          new Error(`متد replaceSelection برای ${platform} تعریف نشده`),
          {
            type: ErrorTypes.UI,
            context: "selection-translation-replace",
            platform: platform,
          }
        );
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "selection-translation",
        platform: platform,
      });
    }
  }

  revertTranslations() {
    let successfulReverts = 0;

    try {
      for (const [uniqueId, data] of state.originalTexts.entries()) {
        try {
          if (
            !data.parent ||
            !data.originalInnerHTML ||
            !data.parent.isConnected
          )
            continue;

          data.parent.innerHTML = data.originalInnerHTML;
          successfulReverts++;
        } catch (error) {
          this.errorHandler.handle(error, {
            type: ErrorTypes.UI,
            context: "revert-translations",
            elementId: uniqueId,
          });
        }
      }

      if (successfulReverts > 0) {
        this.notifier.show(`${successfulReverts}`, "revert");
      } else {
        if (
          process.env.NODE_ENV === "development" ||
          CONFIG.DEBUG_MODE === true
        ) {
          this.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
        }
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "revert-translations-main",
      });
    } finally {
      // پاکسازی state
      state.originalTexts.clear();
      this.IconManager?.cleanup();
    }
  }

  async updateTargetElement(target, translated) {
    try {
      if (typeof translated === "string" && translated) {
        const platform = detectPlatform(target);
        await this.strategies[platform].updateElement(target, translated);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "update-target-element",
        platform: detectPlatform(target),
      });
    }
  }

  getSelectionContext() {
    return {
      selection: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  extractFromActiveElement(element) {
    const platform = detectPlatform(element);
    return this.strategies[platform].extractText(element);
  }

  pasteContent(element, content) {
    try {
      const platform = detectPlatform(element);
      this.strategies[platform].pasteContent(element, content);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "paste-content",
        platform: detectPlatform(element),
      });
    }
  }
}
