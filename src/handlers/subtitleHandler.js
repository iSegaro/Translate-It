// src/handlers/subtitleHandler.js
import Browser from "webextension-polyfill";
import { createSubtitleManager } from '../subtitle/index.js';
import { ErrorTypes } from "../services/ErrorTypes.js";
import { logME } from "../utils/helpers.js";

/**
 * Checks if the current site is a supported video platform.
 * @returns {boolean} True if it's a video site, false otherwise.
 */
function isVideoSite() {
  const hostname = window.location.hostname;
  return hostname.includes('youtube.') || 
         hostname.includes('youtu.be') || 
         hostname.includes('netflix.');
}

export class SubtitleHandler {
  /**
   * @param {import("../core/TranslationHandler.js").TranslationHandler} translationHandler
   */
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.subtitleIntegration = null;
    this.featureManager = translationHandler.featureManager;

    // Only initialize on video sites.
    if (isVideoSite()) {
        this.initialize();
    }
  }

  /**
   * Initializes the handler, sets up listeners and initial state.
   */
  async initialize() {
    logME("[SubtitleHandler] Initializing...");
    
    if (!this.featureManager) {
        logME("[SubtitleHandler] FeatureManager not ready, retrying...");
        setTimeout(() => this.initialize(), 200); // Increased delay slightly
        return;
    }

    // Listen for feature flag changes.
    this.featureManager.on("SUBTITLE_TRANSLATION", () => {
        this.handleSubtitleFeatureToggle();
    });

    // Run initial check.
    this.handleSubtitleFeatureToggle();
  }
  
  /**
   * Creates the subtitle manager and starts observing for subtitles.
   */
  async startSubtitleIntegration() {
    logME("[SubtitleHandler] Starting subtitle integration.");
    
    try {
      const subtitleTranslationProvider = {
        translate: async (text, mode) => {
          try {
            const response = await Browser.runtime.sendMessage({
              action: "fetchTranslation",
              payload: {
                promptText: text,
                translationMode: mode,
              },
            });
            
            let translatedText = null;
            if (typeof response === 'string') {
              translatedText = response;
            } else if (response && typeof response === 'object') {
              translatedText = response.translatedText || response.result || response.translation || response.text || response.data?.translatedText || response.data?.result;
            }
            
            if (!translatedText || typeof translatedText !== 'string') {
              logME("[SubtitleHandler] Invalid translation response:", response);
              return text; // Return original text on failure.
            }
            
            return translatedText;
          } catch (error) {
            logME("[SubtitleHandler] Translation provider error:", error);
            return text; // Return original text on error.
          }
        }
      };

      if (this.subtitleIntegration) {
        logME("[SubtitleHandler] Integration already active.");
        return;
      }

      this.subtitleIntegration = createSubtitleManager(
        subtitleTranslationProvider,
        this.translationHandler.errorHandler,
        this.translationHandler.notifier
      );
      await this.subtitleIntegration.start();
      
      logME("[SubtitleHandler] Subtitle integration started successfully.");
    } catch (error) {
      logME("[SubtitleHandler] Failed to start subtitle integration:", error);
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.SUBTITLE,
        context: "subtitleHandler-start",
      });
    }
  }

  /**
   * Stops the subtitle manager and cleans up UI elements.
   */
  stopSubtitleIntegration() {
    logME("[SubtitleHandler] Stopping subtitle integration.");
    if (this.subtitleIntegration) {
        this.subtitleIntegration.stop();
        this.subtitleIntegration = null;
    }
    // Clean up UI elements.
    const container = document.querySelector("#translate-it-subtitle-container");
    if (container) container.remove();
    
    const style = document.querySelector("#youtube-subtitle-style");
    if (style) style.remove();
    
    logME("[SubtitleHandler] Subtitle integration stopped and UI cleaned up.");
  }

  /**
   * Handles the feature toggle for subtitle translation.
   */
  handleSubtitleFeatureToggle() {
    if (!this.featureManager) {
      logME("[SubtitleHandler] FeatureManager not available for toggle.");
      return;
    }
    
    const isEnabled = this.featureManager.isOn("SUBTITLE_TRANSLATION");
    logME(`[SubtitleHandler] Feature toggled. Enabled: ${isEnabled}`);
    
    if (isEnabled && !this.subtitleIntegration) {
      this.startSubtitleIntegration();
    } else if (!isEnabled && this.subtitleIntegration) {
      this.stopSubtitleIntegration();
    }
  }

  /**
   * Cleans up all resources used by the handler.
   */
  cleanup() {
    logME("[SubtitleHandler] Cleanup initiated.");
    this.stopSubtitleIntegration();
  }
}
