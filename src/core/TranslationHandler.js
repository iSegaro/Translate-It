// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
import InstagramStrategy from "../strategies/InstagramStrategy.js";
import TwitterStrategy from "../strategies/TwitterStrategy.js";
import TelegramStrategy from "../strategies/TelegramStrategy.js";
import MediumStrategy from "../strategies/MediumStrategy.js";
import ChatGPTStrategy from "../strategies/ChatGPTStrategy.js";
import YoutubeStrategy from "../strategies/YoutubeStrategy.js";
import DefaultStrategy from "../strategies/DefaultStrategy.js";
import DiscordStrategy from "../strategies/DiscordStrategy.js";
import NotificationManager from "../managers/core/NotificationManager.js";
import IconManager from "../managers/IconManager.js";
import { debounce } from "../utils/core/debounce.js";
import { state, TranslationMode, CONFIG } from "../config.js";
import { logMethod, isExtensionContextValid} from "../utils/core/helpers.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import EventCoordinator from "./EventCoordinator.js";
import { ErrorHandler } from "../error-management/ErrorHandler.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import FeatureManager from "../managers/core/FeatureManager.js";
import { translateFieldViaSmartHandler } from "../handlers/smartTranslationIntegration.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

export default class TranslationHandler {
  constructor() {
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'TranslationHandler');
    
    // IMPORTANT: FIRST initialize the notifier, then the errorHandler
    // This ensures that the errorHandler can use the notifier for displaying errors.
    // ابتدا notifier سپس errorHandler
    this.notifier = new NotificationManager();
    this.errorHandler = new ErrorHandler(this.notifier);

    this.ErrorTypes = ErrorTypes;
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);

    this.strategies = {
      [Platform.WhatsApp]: new WhatsAppStrategy(
        this.notifier,
        this.errorHandler,
      ),
      [Platform.Instagram]: new InstagramStrategy(
        this.notifier,
        this.errorHandler,
      ),
      [Platform.Medium]: new MediumStrategy(this.notifier, this.errorHandler),
      [Platform.Telegram]: new TelegramStrategy(
        this.notifier,
        this.errorHandler,
      ),
      [Platform.Twitter]: new TwitterStrategy(this.notifier, this.errorHandler),
      [Platform.ChatGPT]: new ChatGPTStrategy(this.notifier, this.errorHandler),
      [Platform.Youtube]: new YoutubeStrategy(this.notifier, this.errorHandler),
      [Platform.Default]: new DefaultStrategy(this.notifier, this.errorHandler),
      [Platform.Discord]: new DiscordStrategy(this.notifier, this.errorHandler),
    };

    this.validateStrategies();
    this.IconManager = new IconManager(this.errorHandler);
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.select_Element_ModeActive = false;

    this.featureManager = new FeatureManager({
      TEXT_FIELDS: CONFIG.TRANSLATE_ON_TEXT_FIELDS,
      SHORTCUT_TEXT_FIELDS: CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS,
      SELECT_ELEMENT: CONFIG.TRANSLATE_WITH_SELECT_ELEMENT,
      TEXT_SELECTION: CONFIG.TRANSLATE_ON_TEXT_SELECTION,
      DICTIONARY: CONFIG.ENABLE_DICTIONARY,
      SUBTITLE_TRANSLATION: CONFIG.ENABLE_SUBTITLE_TRANSLATION,
    });

    this.logger.debug('Creating EventCoordinator...');
    this.eventCoordinator = new EventCoordinator(this, this.featureManager);
    this.logger.debug('EventCoordinator created successfully');
  }

  @logMethod
  reinitialize() {
  logger.debug('Reinitializing state after update...');
    this.isProcessing = false;
    this.select_Element_ModeActive = false;
  }

  @logMethod
  async handleEvent(event) {
    try {
      await this.eventCoordinator.handleEvent(event);
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
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    this.errorHandler.handle(normalized, {
      ...meta,
      origin: "TranslationHandler",
    });
  }

  @logMethod
  handleError_OLD(error, meta = {}) {
    try {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      this.errorHandler.handle(normalizedError, {
        ...meta,
        origin: "TranslationHandler",
      });
    } catch (error) {
  logger.error('Error handling failed:', error);
      throw this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "TranslationHandler-handleError",
      });
    }
  }

  handleEditableFocus(element) {
    this.eventCoordinator.handleEditableFocus(element);
  }

  handleEditableBlur() {
    this.eventCoordinator.handleEditableBlur();
  }

  handleEscape(event) {
    this.eventCoordinator.handleEscape(event);
  }

  async handleCtrlSlash() {
    // Note: handleCtrlSlash is now handled by ShortcutManager in content-scripts
  logger.debug('Ctrl+/ handling delegated to ShortcutManager');
  }

  async handleEditableElement(event) {
    await this.eventCoordinator.handleEditableElement(event);
  }

  @logMethod
  async processTranslation_with_CtrlSlash(params) {
    let statusNotification = null;
    try {
      if (!isExtensionContextValid()) {
        if (!params.target) {
          this.errorHandler.handle(new Error(ErrorTypes.CONTEXT), {
            type: ErrorTypes.CONTEXT,
            context: "TranslationHandler-processTranslation-context",
            code: "context-invalid",
            statusCode: "context-invalid",
          });
          return;
        }
      }

      statusNotification = await this.notifier.show(
        (await getTranslationString("STATUS_TRANSLATING_CTRLSLASH")) ||
          "(translating...)",
        "status",
      );

      state.translateMode = params.selectionRange
        ? TranslationMode.SelectElement
        : TranslationMode.Field;

      // Store notification for dismissal after translation completes (only in window context)
      if (typeof window !== 'undefined') {
        window.pendingTranslationStatusNode = statusNotification;
        window.pendingTranslationNotifier = this.notifier;
      }
      
      //ارسال دقیق target برای جلوگیری از undefined
      await translateFieldViaSmartHandler({
        text: params.text,
        target: params.target,
        selectionRange: params.selectionRange,
        tabId: null
      });
    } catch (error) {
      const processed = await ErrorHandler.processError(error);

      const handlerError = await this.errorHandler.handle(processed, {
        type: processed.type || ErrorTypes.CONTEXT,
        context: "TranslationHandler-processTranslation",
        translationParams: params,
        isPrimary: true,
      });

      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }

      if (handlerError.isFinal || handlerError.suppressSecondary) return;

      const finalError = new Error(handlerError.message);
      Object.assign(finalError, {
        type: handlerError.type,
        statusCode: handlerError.statusCode,
        isFinal: true,
        originalError: error,
      });

      throw finalError;
    } finally {
      // Note: For success case, notification is dismissed in applyTranslationToTextField
      // Finally block should only clear references without dismissing
      // because the notification might already be dismissed
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
            `استراتژی ${name} متد extractText را پیاده‌سازی نکرده است`,
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
  async updateTargetElement(target, translated) {
    try {
      if (typeof translated === "string" && translated) {
        const platform = detectPlatform(target);
        if (
          this.strategies[platform]?.updateElement &&
          typeof this.strategies[platform].updateElement === "function"
        ) {
          return await this.strategies[platform].updateElement(
            target,
            translated,
          );
        }
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "update-target-element",
        platform: detectPlatform(target),
      });
    }
    return false;
  }

  getSelectElementContext() {
    // Only available in window context (content scripts/web pages)
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return {
        select_element: window.getSelection(),
        activeElement: document.activeElement,
      };
    }
    // Fallback for service worker context
    return {
      select_element: null,
      activeElement: null,
    };
  }

  extractFromActiveElement(element) {
    const platform = detectPlatform(element);
    const strategy = this.strategies[platform];

    if (!strategy || typeof strategy.extractText !== "function") {
      this.errorHandler.handle(
        new Error("extractText method not implemented for this platform"),
        {
          type: ErrorTypes.SERVICE,
          context: `TranslationHandler-extractFromActiveElement-${platform}`,
        },
      );
      return "";
    }

    return strategy.extractText(element);
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
