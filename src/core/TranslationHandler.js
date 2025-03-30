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
import {
  CONFIG,
  state,
  TranslationMode,
  TRANSLATION_ERRORS,
} from "../config.js";
import { translateText } from "../utils/api.js";
import { logMethod, isExtensionContextValid } from "../utils/helpers.js";
import {
  detectPlatform,
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
    this.select_Element_ModeActive = false;
    this.eventHandler = new EventHandler(this);
  }

  @logMethod
  reinitialize() {
    console.debug(
      "[TranslationHandler] Reinitializing TranslationHandler state after update..."
    );
    this.isProcessing = false;
    this.select_Element_ModeActive = false;
    // در صورت نیاز، متغیرهای داخلی دیگر مانند caches یا stateهای دیگر را هم ریست کنید
    // برای مثال:
    // state.originalTexts.clear();
    // this.IconManager.cleanup();
  }

  /**
   * Main event handler router
   */
  @logMethod
  async handleEvent(event) {
    try {
      await this.eventHandler.handleEvent(event);
    } catch (error) {
      throw await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.UI,
        context: "handleEvent",
        eventType: event.type,
      });
    }
  }

  @logMethod
  handleError(error, meta = {}) {
    try {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      this.errorHandler.handle(normalizedError, {
        ...meta,
        origin: "TranslationHandler",
      });
    } catch (error) {
      console.debug("[TranslationHandler] Error handling failed:", error);
      throw this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "TranslationHandler-handleError",
      });
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

  async handleEditableElement(event) {
    await this.eventHandler.handleEditableElement(event);
  }

  @logMethod
  async processTranslation_with_CtrlSlash(params) {
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    try {
      if (!isExtensionContextValid()) {
        this.errorHandler.handle(
          new Error(TRANSLATION_ERRORS.INVALID_CONTEXT),
          {
            type: ErrorTypes.CONTEXT,
            context: "TranslationHandler-processTranslation-context",
          }
        );
        return;

        // OR
        // throw new Error(
        //   "TranslationHandler: Translation failed: Context Invalid",
        //   {
        //     type: ErrorTypes.CONTEXT,
        //     translationParams: params,
        //   }
        // );
      }

      // if (!params.text || !params.target) {
      //   console.warn("[TranslationHandler] Invalid parameter", params);
      //   throw new Error("TranslationHandler: Translation failed, Invalid parameter", {
      //     type: ErrorTypes.CONTEXT,
      //     translationParams: params,
      //   });
      // }

      const platform =
        params.target ? detectPlatform(params.target) : detectPlatformByURL();

      // state.translateMode =
      //   params.selectionRange ? "select_element" : "field";
      state.translateMode =
        params.selectionRange ?
          TranslationMode.SelectElement
        : TranslationMode.Field;

      const translated = await translateText(params.text);
      if (!translated) {
        // await this.errorHandler.handle(
        //   new Error(TRANSLATION_ERRORS.INVALID_CONTEXT),
        //   {
        //     type: ErrorTypes.CONTEXT,
        //     context: "TranslationHandler-processTranslation-translated",
        //   }
        // );
        return;
      }

      // اگر کاربر متنی را انتخاب کرده باشد، آن را ترجمه کن
      if (params.selectionRange) {
        this.handleSelect_ElementTranslation(platform, params, translated);
      }
      // در غیر این صورت، ترجمه را در عنصر هدف نمایش بده
      else if (params.target) {
        this.updateTargetElement(params.target, translated);
      }
    } catch (error) {
      // TODO: Requires further review, possible bug detected
      error = await ErrorHandler.processError(error);

      // هندل اولیه خطا توسط ErrorHandler (instance)
      const handlerError = await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.CONTEXT,
        context: "TranslationHandler-processTranslation",
        translationParams: params,
        isPrimary: true,
      });

      // اگر خطا به عنوان نهایی علامت‌گذاری شده باشد، دیگر نیازی به throw نیست
      if (handlerError.isFinal || handlerError.suppressSecondary) {
        return; // یا می‌توانید null برگردانید
      }

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

  @logMethod
  async handleSelect_ElementTranslation(platform, params, translated) {
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
            context: "selecti-element-translation-replace",
            platform: platform,
          }
        );
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "select-element-translation",
        platform: platform,
      });
    }
  }

  @logMethod
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

  getSelectElementContext() {
    return {
      select_element: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  extractFromActiveElement(element) {
    const platform = detectPlatform(element);
    return this.strategies[platform].extractText(element);
  }

  @logMethod
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
