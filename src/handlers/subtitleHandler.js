// src/handlers/subtitleHandler.js
import { Browser } from "@/utils/browser-polyfill.js";
import { createSubtitleManager } from "../subtitle/index.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { logME } from "../utils/helpers.js";
import { isUrlExcluded } from "../utils/exclusion.js";
import { matchErrorToType } from "../services/ErrorMatcher.js";
import { getSettingsAsync } from "../config.js";

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

    // Listen for global extension enable/disable
    this.featureManager.on("EXTENSION_ENABLED", () => {
      this.handleExtensionToggle();
    });

    this.featureManager.on("SUBTITLE_TRANSLATION", () => {
      this.handleSubtitleFeatureToggle();
    });

    // Listen for SHOW_SUBTITLE_ICON changes to toggle YouTube UI
    this.featureManager.on("SHOW_SUBTITLE_ICON", () => {
      this.handleSubtitleIconToggle();
    });

    // Wait for FeatureManager to load from storage before initial check
    await this.waitForFeatureManagerReady();
    
    // Check if extension is globally enabled first
    if (!this.featureManager.isOn("EXTENSION_ENABLED")) {
      logME("[SubtitleHandler] Extension globally disabled, skipping initialization");
      return;
    }

    // Check if current site is excluded
    const isExcluded = await this.checkSiteExclusion();
    if (isExcluded) {
      logME("[SubtitleHandler] Current site is excluded, skipping initialization");
      return;
    }

    // Initialize site-specific UI elements
    if (this.site === "youtube") {
      this.initializeYouTubeUI();
    }
    
    // Perform initial check to start or stop the integration
    this.handleSubtitleFeatureToggle();

    // Perform initial check for icon visibility (in case it was disabled initially)
    if (this.site === "youtube") {
      this.handleSubtitleIconToggle();
    }
  }

  /**
   * Checks if the current site is in the excluded sites list.
   */
  async checkSiteExclusion() {
    try {
      const settings = await getSettingsAsync();
      const excludedSites = settings.EXCLUDED_SITES || [];
      return isUrlExcluded(window.location.href, excludedSites);
    } catch (error) {
      logME("[SubtitleHandler] Error checking site exclusion:", error);
      return false; // If error, don't exclude
    }
  }

  /**
   * Waits for FeatureManager to load settings from storage.
   */
  async waitForFeatureManagerReady() {
    // Check if we can access actual storage values directly
    try {
      const settings = await getSettingsAsync();
      const actualExtensionValue = settings.EXTENSION_ENABLED ?? true;
      const actualSubtitleValue = settings.ENABLE_SUBTITLE_TRANSLATION ?? true;
      const actualIconValue = settings.SHOW_SUBTITLE_ICON ?? true;
      
      // If FeatureManager hasn't loaded the values yet, wait a bit
      if (this.featureManager.isOn("EXTENSION_ENABLED") !== actualExtensionValue ||
          this.featureManager.isOn("SUBTITLE_TRANSLATION") !== actualSubtitleValue ||
          this.featureManager.isOn("SHOW_SUBTITLE_ICON") !== actualIconValue) {
        logME("[SubtitleHandler] Waiting for FeatureManager to sync with storage...");
        // Give FeatureManager time to load from storage
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      logME("[SubtitleHandler] Error checking storage, proceeding with current state:", error);
    }
  }

  /**
   * Sets up the UI elements specific to YouTube.
   */
  initializeYouTubeUI() {
    // Only initialize UI if SHOW_SUBTITLE_ICON is enabled
    if (!this.featureManager.isOn("SHOW_SUBTITLE_ICON")) {
      logME("[SubtitleHandler] SHOW_SUBTITLE_ICON is disabled, skipping YouTube UI initialization");
      return;
    }

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
        filter: grayscale(1) invert(0);
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
    try {
      // Check if we should create the button at all
      if (!this.featureManager.isOn("EXTENSION_ENABLED") || 
          !this.featureManager.isOn("SHOW_SUBTITLE_ICON")) {
        return;
      }

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
    } catch (error) {
      const errorType = matchErrorToType(error);
      
      // Handle extension context invalidation
      if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
        logME("[SubtitleHandler] Extension context invalidated, cannot create YouTube button");
        return;
      }
      
      // Log other errors but don't crash
      logME("[SubtitleHandler] Error creating YouTube button:", error);
    }
  }

  /**
   * Toggles the ENABLE_SUBTITLE_TRANSLATION setting in storage.
   */
  async toggleSubtitleSetting() {
    try {
      const key = "ENABLE_SUBTITLE_TRANSLATION";
      const settings = await getSettingsAsync();
      const currentVal = settings[key] ?? true;
      await Browser.storage.local.set({ [key]: !currentVal });
      // The storage listener will trigger the update, but we call this directly for immediate feedback.
      if (this.site === "youtube") {
        this.updateYouTubeButtonState(!currentVal);
      }
    } catch (error) {
      const errorType = matchErrorToType(error);
      
      // Handle extension context invalidation
      if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
        logME("[SubtitleHandler] Extension context invalidated, cannot toggle subtitle setting");
        // Optionally disable the button to prevent further clicks
        const button = document.querySelector(".translate-it-yt-button");
        if (button) {
          button.disabled = true;
          button.style.opacity = "0.5";
          button.title = "Extension reloaded, please refresh page";
        }
        return;
      }
      
      // Handle other errors through the error service
      this.translationHandler.errorHandler.handle(error, {
        type: errorType,
        context: "subtitle-toggle-setting",
      });
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
      try {
        const settings = await getSettingsAsync();
        enabled = settings.ENABLE_SUBTITLE_TRANSLATION ?? true;
      } catch (error) {
        const errorType = matchErrorToType(error);
        
        // Handle extension context invalidation
        if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
          logME("[SubtitleHandler] Extension context invalidated, cannot update button state");
          // Default to disabled state and mark button as non-functional
          enabled = false;
          button.disabled = true;
          button.style.opacity = "0.5";
          button.title = "Extension reloaded, please refresh page";
          return;
        }
        
        // For other errors, default to true
        logME("[SubtitleHandler] Error getting button state, defaulting to enabled:", error);
        enabled = true;
      }
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
            const errorType = matchErrorToType(error);
            
            // Handle extension context invalidation specifically
            if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
              logME("[SubtitleHandler] Extension context invalidated, disabling subtitle translation");
              // Stop subtitle translation to prevent further errors
              if (this.subtitleIntegration) {
                try {
                  this.subtitleIntegration.destroy();
                  this.subtitleIntegration = null;
                } catch (destroyError) {
                  logME("[SubtitleHandler] Error stopping subtitle integration:", destroyError);
                }
              }
              return text; // Return original text
            }
            
            // Use the error service to handle other errors properly
            this.translationHandler.errorHandler.handle(error, {
              type: errorType,
              context: "subtitle-translation-provider",
            });
            
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
  async handleSubtitleFeatureToggle() {
    if (!this.featureManager) {
      logME("[SubtitleHandler] FeatureManager not available for toggle.");
      return;
    }

    // Check if extension is globally enabled first
    if (!this.featureManager.isOn("EXTENSION_ENABLED")) {
      logME("[SubtitleHandler] Extension globally disabled, stopping subtitle integration");
      this.stopSubtitleIntegration();
      return;
    }

    // Check site exclusion
    const isExcluded = await this.checkSiteExclusion();
    if (isExcluded) {
      logME("[SubtitleHandler] Site is excluded, stopping subtitle integration");
      this.stopSubtitleIntegration();
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
   * Handles the toggle for showing/hiding subtitle icon in YouTube.
   */
  async handleSubtitleIconToggle() {
    if (this.site !== "youtube") {
      return;
    }

    // Check if extension is globally enabled first
    if (!this.featureManager.isOn("EXTENSION_ENABLED")) {
      this.cleanupYouTubeUI();
      return;
    }

    // Check site exclusion
    const isExcluded = await this.checkSiteExclusion();
    if (isExcluded) {
      this.cleanupYouTubeUI();
      return;
    }

    const showIcon = this.featureManager.isOn("SHOW_SUBTITLE_ICON");
    logME(`[SubtitleHandler] Subtitle icon toggle. Show: ${showIcon}`);

    if (showIcon) {
      // Start the YouTube UI if not already started
      if (!this.youtubeButtonInterval) {
        this.initializeYouTubeUI();
      }
    } else {
      // Remove the YouTube UI completely
      this.cleanupYouTubeUI();
      
      // Extra cleanup: make sure no button exists after cleanup
      setTimeout(() => {
        const button = document.getElementById("translate-it-yt-btn");
        if (button) {
          button.remove();
          logME("[SubtitleHandler] Removed lingering YouTube button.");
        }
      }, 50);
    }
  }

  /**
   * Handles the global extension enable/disable toggle.
   */
  async handleExtensionToggle() {
    const isExtensionEnabled = this.featureManager.isOn("EXTENSION_ENABLED");
    logME(`[SubtitleHandler] Extension toggle. Enabled: ${isExtensionEnabled}`);

    if (!isExtensionEnabled) {
      // Extension is disabled - stop everything
      this.stopSubtitleIntegration();
      if (this.site === "youtube") {
        this.cleanupYouTubeUI();
      }
    } else {
      // Check site exclusion before re-enabling
      const isExcluded = await this.checkSiteExclusion();
      if (isExcluded) {
        logME("[SubtitleHandler] Site is excluded, not re-enabling features");
        return;
      }

      // Extension is re-enabled - reinitialize based on current settings
      if (this.site === "youtube") {
        this.handleSubtitleIconToggle();
      }
      this.handleSubtitleFeatureToggle();
    }
  }

  /**
   * Cleans up YouTube UI elements only.
   */
  cleanupYouTubeUI() {
    logME("[SubtitleHandler] Cleaning up YouTube UI.");
    
    // Stop the button creation interval first
    if (this.youtubeButtonInterval) {
      clearInterval(this.youtubeButtonInterval);
      this.youtubeButtonInterval = null;
    }
    
    // Remove the button element
    const button = document.getElementById("translate-it-yt-btn");
    if (button) {
      button.remove();
      logME("[SubtitleHandler] YouTube button removed.");
    }
    
    // Remove the style element
    const style = document.getElementById("translate-it-yt-button-style");
    if (style) {
      style.remove();
      logME("[SubtitleHandler] YouTube button styles removed.");
    }
  }

  /**
   * Cleans up all resources used by the handler.
   */
  cleanup() {
    logME("[SubtitleHandler] Cleanup initiated.");
    if (this.site === "youtube") {
      this.cleanupYouTubeUI();
    }

    this.stopSubtitleIntegration();
  }
}
