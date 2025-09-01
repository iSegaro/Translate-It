import { MessagingContexts, MessageFormat } from "@/shared/messaging/core/MessagingCore.js";
import { createSubtitleManager } from "@/features/subtitle/core/index.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'subtitle');

import { isUrlExcluded } from "../utils/ui/exclusion.js";
import { matchErrorToType } from "@/shared/error-management/ErrorMatcher.js";
import { getSettingsAsync } from "@/shared/config/config.js";
import browser from "webextension-polyfill";
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';

// removed legacy createLogger import


export class SubtitleHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.subtitleIntegration = null;
    this.featureManager = translationHandler.featureManager;
    this.site = this.detectSite();
    this.youtubeButtonInterval = null;

    if (this.site) {
      this.initialize();
    }
  }

  detectSite() {
    const hostname = window.location.hostname;
    if (hostname.includes("youtube.") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("netflix.")) return "netflix";
    return null;
  }

  async initialize() {
  logger.debug('Initializing for', this.site, '...');
    if (!this.featureManager) {
      setTimeout(() => this.initialize(), 200);
      return;
    }

    this.featureManager.on("EXTENSION_ENABLED", () => this.handleExtensionToggle());
    this.featureManager.on("SUBTITLE_TRANSLATION", () => this.handleSubtitleFeatureToggle());
    this.featureManager.on("SHOW_SUBTITLE_ICON", () => this.handleSubtitleIconToggle());

    await this.waitForFeatureManagerReady();

    if (!this.featureManager.isOn("EXTENSION_ENABLED")) return;
    if (await this.checkSiteExclusion()) return;

    if (this.site === "youtube") this.initializeYouTubeUI();
    this.handleSubtitleFeatureToggle();
    if (this.site === "youtube") this.handleSubtitleIconToggle();
  }

  async checkSiteExclusion() {
    try {
      const { EXCLUDED_SITES } = await getSettingsAsync();
      return isUrlExcluded(window.location.href, EXCLUDED_SITES || []);
    } catch (error) {
  logger.error('Error checking site exclusion:', error);
      return false;
    }
  }

  async waitForFeatureManagerReady() {
    try {
      const settings = await getSettingsAsync();
      if (this.featureManager.isOn("EXTENSION_ENABLED") !== (settings.EXTENSION_ENABLED ?? true) ||
          this.featureManager.isOn("SUBTITLE_TRANSLATION") !== (settings.ENABLE_SUBTITLE_TRANSLATION ?? true) ||
          this.featureManager.isOn("SHOW_SUBTITLE_ICON") !== (settings.SHOW_SUBTITLE_ICON ?? true)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
  logger.error('Error checking storage, proceeding with current state:', error);
    }
  }

  initializeYouTubeUI() {
    if (!this.featureManager.isOn("SHOW_SUBTITLE_ICON")) return;
    this.injectYouTubeButtonStyles();
    this.youtubeButtonInterval = setInterval(() => this.createYouTubeButton(), 1000);
  }

  injectYouTubeButtonStyles() {
    if (document.getElementById("translate-it-yt-button-style")) return;
    const style = document.createElement("style");
    style.id = "translate-it-yt-button-style";
    style.textContent = `...`; // Styles remain the same
    document.head.appendChild(style);
  }

  createYouTubeButton() {
    try {
      if (!this.featureManager.isOn("EXTENSION_ENABLED") || !this.featureManager.isOn("SHOW_SUBTITLE_ICON")) return;
      const controls = document.querySelector(".ytp-right-controls");
      if (!controls || document.getElementById("translate-it-yt-btn")) return;
      const captionsButton = controls.querySelector(".ytp-subtitles-button");
      if (!captionsButton) return;

      const button = document.createElement("button");
      button.id = "translate-it-yt-btn";
      button.className = "ytp-button translate-it-yt-button";
      button.title = "Toggle Translate-It Subtitles";
      const icon = document.createElement("img");
      icon.src = browser.runtime.getURL("icons/extension_icon_48.png");
      icon.className = "translate-it-yt-icon";
      button.appendChild(icon);
      button.addEventListener("click", () => this.toggleSubtitleSetting());
      controls.insertBefore(button, captionsButton);
      this.updateYouTubeButtonState();
    } catch (error) {
      if (matchErrorToType(error) === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
        logger.debug('Extension context invalidated, cannot create YouTube button');
        return;
      }
      logger.error('Error creating YouTube button:', error);
    }
  }

  async toggleSubtitleSetting() {
    try {
      const settings = await getSettingsAsync();
      const newValue = !(settings.ENABLE_SUBTITLE_TRANSLATION ?? true);
      
      const message = MessageFormat.create(
        'subtitleToggle',
        { 
          enabled: newValue,
          site: this.site
        },
        MessagingContexts.CONTENT
      );
      
      const response = await sendSmart(message);
      
      if (response.success && this.site === "youtube") {
        this.updateYouTubeButtonState(newValue);
      }
    } catch (error) {
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
  logger.debug('Extension context invalidated, cannot toggle subtitle setting');
        const button = document.querySelector(".translate-it-yt-button");
        if (button) { button.disabled = true; button.style.opacity = "0.5"; button.title = "Extension reloaded, please refresh page"; }
        return;
      }
      this.translationHandler.errorHandler.handle(error, { type: errorType, context: "subtitle-toggle-setting" });
    }
  }

  async updateYouTubeButtonState(isEnabled) {
    const button = document.getElementById("translate-it-yt-btn");
    if (!button) return;
    let enabled = isEnabled;
    if (typeof enabled !== "boolean") {
      try {
        const settings = await getSettingsAsync();
        enabled = settings.ENABLE_SUBTITLE_TRANSLATION ?? true;
      } catch (error) {
        if (matchErrorToType(error) === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
          enabled = false;
          button.disabled = true; button.style.opacity = "0.5"; button.title = "Extension reloaded, please refresh page";
          return;
        }
        enabled = true;
      }
    }
    button.classList.toggle("translate-it-active", enabled);
  }

  async startSubtitleIntegration() {
  logger.debug('Starting subtitle integration for', this.site, '.');
    try {
      if (this.subtitleIntegration) return;

      const subtitleTranslationProvider = {
        translate: async (text, mode) => {
          try {
            const message = MessageFormat.create(
              'subtitleTranslate',
              { 
                text, 
                translationMode: mode,
                sourceLanguage: 'auto',
                targetLanguage: 'fa'
              },
              MessagingContexts.CONTENT
            );
            
            const response = await sendSmart(message);
            return response.translatedText || text;
          } catch (error) {
            const errorType = matchErrorToType(error);
            if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
              if (this.subtitleIntegration) this.subtitleIntegration.destroy();
              this.subtitleIntegration = null;
            }
            this.translationHandler.errorHandler.handle(error, { type: errorType, context: "subtitle-translation-provider" });
            return text;
          }
        },
      };

      this.subtitleIntegration = createSubtitleManager(subtitleTranslationProvider, this.translationHandler.errorHandler, this.translationHandler.notifier);
      await this.subtitleIntegration.start();
    } catch (error) {
      this.translationHandler.errorHandler.handle(error, { type: ErrorTypes.SUBTITLE, context: "subtitleHandler-start" });
    }
  }

  stopSubtitleIntegration() {
    if (this.subtitleIntegration) {
      this.subtitleIntegration.stop();
      this.subtitleIntegration = null;
    }
    const container = document.querySelector("#translate-it-subtitle-container");
    if (container) container.remove();
    const style = document.querySelector("#youtube-subtitle-style");
    if (style) style.remove();
  }

  async handleSubtitleFeatureToggle() {
    if (!this.featureManager) return;
    if (!this.featureManager.isOn("EXTENSION_ENABLED") || await this.checkSiteExclusion()) {
      this.stopSubtitleIntegration();
      return;
    }
    const isEnabled = this.featureManager.isOn("SUBTITLE_TRANSLATION");
    if (this.site === "youtube") this.updateYouTubeButtonState(isEnabled);
    if (isEnabled && !this.subtitleIntegration) this.startSubtitleIntegration();
    else if (!isEnabled && this.subtitleIntegration) this.stopSubtitleIntegration();
  }

  async handleSubtitleIconToggle() {
    if (this.site !== "youtube" || !this.featureManager.isOn("EXTENSION_ENABLED") || await this.checkSiteExclusion()) {
      this.cleanupYouTubeUI();
      return;
    }
    if (this.featureManager.isOn("SHOW_SUBTITLE_ICON")) {
      if (!this.youtubeButtonInterval) this.initializeYouTubeUI();
    } else {
      this.cleanupYouTubeUI();
    }
  }

  async handleExtensionToggle() {
    if (!this.featureManager.isOn("EXTENSION_ENABLED")) {
      this.stopSubtitleIntegration();
      if (this.site === "youtube") this.cleanupYouTubeUI();
    } else {
      if (await this.checkSiteExclusion()) return;
      if (this.site === "youtube") this.handleSubtitleIconToggle();
      this.handleSubtitleFeatureToggle();
    }
  }

  cleanupYouTubeUI() {
    if (this.youtubeButtonInterval) {
      clearInterval(this.youtubeButtonInterval);
      this.youtubeButtonInterval = null;
    }
    const button = document.getElementById("translate-it-yt-btn");
    if (button) button.remove();
    const style = document.getElementById("translate-it-yt-button-style");
    if (style) style.remove();
  }

  cleanup() {
    if (this.site === "youtube") this.cleanupYouTubeUI();
    this.stopSubtitleIntegration();
  }
}
