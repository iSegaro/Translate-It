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
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import { openOptionsPage } from "../utils/helpers.js";
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
      whatsapp: new WhatsAppStrategy(this.notifier, this.eventHandler),
      instagram: new InstagramStrategy(this.notifier, this.eventHandler),
      medium: new MediumStrategy(this.notifier, this.eventHandler),
      telegram: new TelegramStrategy(this.notifier, this.eventHandler),
      twitter: new TwitterStrategy(this.notifier, this.eventHandler),
      chatgpt: new ChatGPTStrategy(this.notifier, this.eventHandler),
      youtube: new YoutubeStrategy(this.notifier, this.eventHandler),
      default: new DefaultStrategy(this.notifier, this.eventHandler),
    };

    for (const [name, strategy] of Object.entries(this.strategies)) {
      if (typeof strategy.extractText !== "function") {
        console.error(`استراتژی ${name} متد extractText را ندارد!`);
      }
    }

    this.IconManager = new IconManager();
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.selectionModeActive = false;
    this.eventHandler = new EventHandler(this);

    // اعتبارسنجی استراتژی‌ها
    Object.entries(this.strategies).forEach(([name, strategy]) => {
      if (typeof strategy.extractText !== "function") {
        throw new Error(
          `استراتژی ${name} متد extractText را پیاده‌سازی نکرده است`
        );
      }
    });
  }

  /**
   * Main event handler router
   */
  async handleEvent(event) {
    await this.eventHandler.handleEvent(event);
  }

  handleError(error, meta = {}) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    this.errorHandler.handle(normalizedError, meta);
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
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");

    try {
      const platform =
        params.target ? detectPlatform(params.target) : detectPlatformByURL();

      // تنظیم حالت ترجمه
      state.translationMode = params.selectionRange ? "selection" : "field";

      const translated = await translateText(params.text);

      if (params.selectionRange) {
        if (
          this.strategies[platform] &&
          typeof this.strategies[platform].replaceSelection === "function"
        ) {
          this.strategies[platform].replaceSelection(
            params.selectionRange,
            translated
          );
        } else {
          // console.error(
          //   `استراتژی برای پلتفرم ${platform} یا متد replaceSelection در آن تعریف نشده است.`
          // );
          this.errorHandler.handle(
            new Error(
              `متد replaceSelection برای پلتفرم ${platform} تعریف نشده است.`
            ),
            {
              type: ErrorTypes.UI,
              context: "processTranslation",
              platform: platform,
            }
          );
        }
      } else if (params.target) {
        await this.updateTargetElement(params.target, translated);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "translation-process",
      });
    } finally {
      this.notifier.dismiss(statusNotification);
    }
  }

  revertTranslations() {
    console.info("TranslationHandler: Starting revert process...");
    let successfulReverts = 0;

    // پیمایش بر روی شناسه‌های یکتا
    for (const [uniqueId, data] of state.originalTexts.entries()) {
      try {
        if (!data.parent || !data.originalInnerHTML) {
          continue;
        }

        if (!data.parent.isConnected) {
          continue;
        }

        data.parent.innerHTML = data.originalInnerHTML;
        successfulReverts++;
      } catch (error) {
        this.errorHandler.handle(error, {
          type: ErrorTypes.UI,
          context: "revert-translations",
        });
      }
    }

    if (successfulReverts > 0) {
      this.notifier.show(`${successfulReverts}`, "revert");
    } else {
      if (process.env.NODE_ENV === "development") {
        this.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
      }
    }

    // پاکسازی state
    state.originalTexts.clear();
    if (this.IconManager) {
      this.IconManager.cleanup();
    }
  }

  async updateTargetElement(target, translated) {
    try {
      const platform = detectPlatform(target);
      await this.strategies[platform].updateElement(target, translated);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI, // یا SERVICE بسته به نوع خطا
        context: "update-target-element",
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
    const platform = detectPlatform(element);
    this.strategies[platform].pasteContent(element, content);
  }
}
