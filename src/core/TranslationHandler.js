// src/core/TranslationHandler.js
import WhatsAppStrategy from "@/features/text-field-interaction/strategies/WhatsAppStrategy.js";
import InstagramStrategy from "@/features/text-field-interaction/strategies/InstagramStrategy.js";
import TwitterStrategy from "@/features/text-field-interaction/strategies/TwitterStrategy.js";
import TelegramStrategy from "@/features/text-field-interaction/strategies/TelegramStrategy.js";
import MediumStrategy from "@/features/text-field-interaction/strategies/MediumStrategy.js";
import ChatGPTStrategy from "@/features/text-field-interaction/strategies/ChatGPTStrategy.js";
import YoutubeStrategy from "@/features/text-field-interaction/strategies/YoutubeStrategy.js";
import DefaultStrategy from "@/features/text-field-interaction/strategies/DefaultStrategy.js";
import DiscordStrategy from "@/features/text-field-interaction/strategies/DiscordStrategy.js";
import NotificationManager from "@/core/managers/core/NotificationManager.js";


import { debounce } from "../core/debounce.js";
import { state, TranslationMode } from "@/shared/config/config.js";
import { logMethod } from "../core/helpers.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import EventCoordinator from "./EventCoordinator.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import FeatureManager from "@/core/managers/content/FeatureManager.js";
import { translateFieldViaSmartHandler } from "../handlers/smartTranslationIntegration.js";
import ExtensionContextManager from "../core/extensionContext.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from './PageEventBus.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

// Singleton instance
let translationHandlerInstance = null;

export default class TranslationHandler {
  constructor(featureManager = null) {
    // Enforce singleton pattern
    if (translationHandlerInstance) {
      const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'TranslationHandler');
      logger.debug('TranslationHandler singleton already exists, returning existing instance');
      return translationHandlerInstance;
    }
    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'TranslationHandler');

    this.notifier = new NotificationManager();
    this.errorHandler = new ErrorHandler(this.notifier);

    this.ErrorTypes = ErrorTypes;
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);

    this.strategies = {
      [Platform.WhatsApp]: new WhatsAppStrategy(this.errorHandler),
      [Platform.Instagram]: new InstagramStrategy(this.errorHandler),
      [Platform.Medium]: new MediumStrategy(this.errorHandler),
      [Platform.Telegram]: new TelegramStrategy(this.errorHandler),
      [Platform.Twitter]: new TwitterStrategy(this.errorHandler),
      [Platform.ChatGPT]: new ChatGPTStrategy(this.errorHandler),
      [Platform.Youtube]: new YoutubeStrategy(this.errorHandler),
      [Platform.Default]: new DefaultStrategy(this.errorHandler),
      [Platform.Discord]: new DiscordStrategy(this.errorHandler),
    };

    this.validateStrategies();
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.select_Element_ModeActive = false;

    // Use provided FeatureManager or get singleton instance (for backward compatibility)
    this.featureManager = featureManager || FeatureManager.getInstance();

    this.logger.debug('Creating EventCoordinator...');
    this.eventCoordinator = new EventCoordinator(this, this.featureManager);
    this.logger.debug('EventCoordinator created successfully');

    // Store singleton instance
    translationHandlerInstance = this;
    this.logger.debug('TranslationHandler singleton created');
  }

  @logMethod
  reinitialize() {
  this.logger.debug('Reinitializing state after update...');
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
  this.logger.error('Error handling failed:', error);
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
  this.logger.debug('Ctrl+/ handling delegated to ShortcutManager');
  }

  async handleEditableElement(event) {
    await this.eventCoordinator.handleEditableElement(event);
  }

  @logMethod
  async processTranslation_with_CtrlSlash(params) {
    try {
      if (!ExtensionContextManager.isValidSync()) {
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


      state.translateMode = TranslationMode.Field;

      //ارسال دقیق target برای جلوگیری از undefined
      await translateFieldViaSmartHandler({
        text: params.text,
        target: params.target,
        selectionRange: params.selectionRange,
        tabId: null,
        // Don't pass toastId - let smartTranslationIntegration create and manage its own notification
      });
    } catch (error) {
      const processed = await ErrorHandler.processError(error);

      const handlerError = await this.errorHandler.handle(processed, {
        type: processed.type || ErrorTypes.CONTEXT,
        context: "TranslationHandler-processTranslation",
        translationParams: params,
        isPrimary: true,
      });

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

  // Static method to get singleton instance
  static getInstance(featureManager = null) {
    if (!translationHandlerInstance) {
      translationHandlerInstance = new TranslationHandler(featureManager);
    }
    return translationHandlerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (translationHandlerInstance) {
      translationHandlerInstance = null;
    }
  }
}
