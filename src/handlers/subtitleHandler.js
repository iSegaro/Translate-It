// src/handlers/subtitleHandler.js
import Browser from "webextension-polyfill";
import { createSubtitleManager } from "../subtitle/index.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { logME } from "../utils/helpers.js";

export class SubtitleHandler {
  /**
   * @param {import("../core/TranslationHandler.js").TranslationHandler} translationHandler
   */
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

  /**
   * Detects the current video platform.
   * @returns {'youtube' | 'netflix' | null} The name of the site or null.
   */
  detectSite() {
    const hostname = window.location.hostname;
    if (hostname.includes("youtube.") || hostname.includes("youtu.be")) {
      return "youtube";
    }
    if (hostname.includes("netflix.")) {
      return "netflix";
    }
    return null;
  }

  /**
   * Initializes the handler, sets up listeners and site-specific features.
   */
  async initialize() {
    logME(`[SubtitleHandler] Initializing for ${this.site}...`);

    if (!this.featureManager) {
      logME("[SubtitleHandler] FeatureManager not ready, retrying...");
      setTimeout(() => this.initialize(), 200);
      return;
    }

    this.featureManager.on("SUBTITLE_TRANSLATION", () => {
      this.handleSubtitleFeatureToggle();
    });

    // Initialize site-specific UI elements
    if (this.site === "youtube") {
      this.initializeYouTubeUI();
    }

    // Perform initial check to start or stop the integration
    this.handleSubtitleFeatureToggle();
  }

  /**
   * Sets up the UI elements specific to YouTube.
   */
  initializeYouTubeUI() {
    this.injectYouTubeButtonStyles();
    this.youtubeButtonInterval = setInterval(
      () => this.createYouTubeButton(),
      1000
    );
  }

  /**
   * Injects CSS styles for the custom YouTube button.
   */
  injectYouTubeButtonStyles() {
    const styleId = "translate-it-yt-button-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .translate-it-yt-button {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        position: relative; /* Required for pseudo-element positioning */
        opacity: 0.9;
      }
      .translate-it-yt-icon {
        width: 20px;
        height: 18px;
        filter: grayscale(1) invert(1);
      }
      .translate-it-yt-button.translate-it-active .translate-it-yt-icon {
        filter: none;
      }
      /* Mimic YouTube's active subtitle button underline */
      .translate-it-yt-button.translate-it-active::after {
        content: '';
        position: absolute;
        bottom: 9px; /* Position it just below the icon */
        left: 25%;
        width: 50%;
        height: 3px;
        background-color: #f00;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Creates and injects the subtitle toggle button into the YouTube player controls.
   */
  createYouTubeButton() {
    const controls = document.querySelector(".ytp-right-controls");
    if (!controls || document.getElementById("translate-it-yt-btn")) {
      return;
    }

    const captionsButton = controls.querySelector(".ytp-subtitles-button");
    if (!captionsButton) {
      return;
    }

    const button = document.createElement("button");
    button.id = "translate-it-yt-btn";
    button.className = "ytp-button translate-it-yt-button";
    button.title = "Toggle Translate-It Subtitles";

    const icon = document.createElement("img");
    icon.src = Browser.runtime.getURL("icons/extension_icon_48.png");
    icon.className = "translate-it-yt-icon";
    button.appendChild(icon);

    button.addEventListener("click", () => this.toggleSubtitleSetting());

    controls.insertBefore(button, captionsButton);
    logME("[SubtitleHandler] YouTube button created.");

    this.updateYouTubeButtonState();
  }

  /**
   * Toggles the ENABLE_SUBTITLE_TRANSLATION setting in storage.
   */
  async toggleSubtitleSetting() {
    const key = "ENABLE_SUBTITLE_TRANSLATION";
    const result = await Browser.storage.local.get(key);
    const currentVal = result[key] ?? true;
    await Browser.storage.local.set({ [key]: !currentVal });
    // The storage listener will trigger the update, but we call this directly for immediate feedback.
    if (this.site === "youtube") {
      this.updateYouTubeButtonState(!currentVal);
    }
  }

  /**
   * Updates the YouTube button's visual state based on the setting.
   * @param {boolean} [isEnabled] - The current state. If not provided, it's fetched from storage.
   */
  async updateYouTubeButtonState(isEnabled) {
    const button = document.getElementById("translate-it-yt-btn");
    if (!button) return;

    let enabled = isEnabled;
    if (typeof enabled !== "boolean") {
      const result = await Browser.storage.local.get(
        "ENABLE_SUBTITLE_TRANSLATION"
      );
      enabled = result.ENABLE_SUBTITLE_TRANSLATION ?? true;
    }

    button.classList.toggle("translate-it-active", enabled);
  }

  /**
   * Starts the subtitle manager and observes for subtitles.
   */
  async startSubtitleIntegration() {
    logME(`[SubtitleHandler] Starting subtitle integration for ${this.site}.`);
    try {
      const subtitleTranslationProvider = {
        translate: async (text, mode) => {
          try {
            const response = await Browser.runtime.sendMessage({
              action: "fetchTranslation",
              payload: { promptText: text, translationMode: mode },
            });

            let translatedText = null;

            // Check for nested structure first e.g., { success: true, data: { translatedText: '...' } }
            if (response && response.success && response.data) {
              if (typeof response.data.translatedText === "string") {
                translatedText = response.data.translatedText;
              } else if (typeof response.data.result === "string") {
                translatedText = response.data.result;
              } else if (typeof response.data === "string") {
                // Sometimes data itself is the string
                translatedText = response.data;
              }
            }

            // Fallback to checking top-level properties or if the response is a plain string
            if (!translatedText) {
              if (typeof response === "string") {
                translatedText = response;
              } else if (response && typeof response === "object") {
                translatedText =
                  response.translatedText ||
                  response.result ||
                  response.translation ||
                  response.text;
              }
            }

            if (
              typeof translatedText === "string" &&
              translatedText.trim().length > 0
            ) {
              return translatedText;
            } else {
              logME(
                "[SubtitleHandler] Could not extract translated text from response:",
                response
              );
              return text; // Return original text on failure
            }
          } catch (error) {
            logME("[SubtitleHandler] Translation provider error:", error);
            return text; // Return original text on error
          }
        },
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
    const container = document.querySelector(
      "#translate-it-subtitle-container"
    );
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

    if (this.site === "youtube") {
      this.updateYouTubeButtonState(isEnabled);
    }

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
    if (this.site === "youtube") {
      if (this.youtubeButtonInterval) {
        clearInterval(this.youtubeButtonInterval);
      }
      const button = document.getElementById("translate-it-yt-btn");
      if (button) button.remove();
      const style = document.getElementById("translate-it-yt-button-style");
      if (style) style.remove();
    }

    this.stopSubtitleIntegration();
  }
}
