// src/managers/content/windows/theme/ThemeManager.js

import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { getThemeAsync } from "../../../../config.js";
import { getResolvedUserTheme } from "../../../../utils/ui/theme.js";
import { storageManager } from "../../../../storage/core/StorageCore.js";

/**
 * Manages theme application and changes for WindowsManager
 */
export class ThemeManager {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ThemeManager');
    this.currentTheme = 'light';
    this.themeChangeListener = null;
    this.boundHandleThemeChange = null;
  }

  /**
   * Initialize theme manager
   */
  async initialize() {
    await this.loadCurrentTheme();
    this.setupThemeChangeListener();
    this.logger.debug('ThemeManager initialized', { currentTheme: this.currentTheme });
  }

  /**
   * Load current theme from storage
   */
  async loadCurrentTheme() {
    try {
      const storedTheme = await getThemeAsync();
      this.currentTheme = getResolvedUserTheme(storedTheme);
      this.logger.debug('Theme loaded', { storedTheme, resolvedTheme: this.currentTheme });
    } catch (error) {
      this.logger.warn('Failed to load theme, using default:', error);
      this.currentTheme = 'light';
    }
  }

  /**
   * Apply theme to host element
   */
  async applyThemeToHost(hostElement) {
    if (!hostElement) {
      this.logger.warn('No host element provided for theme application');
      return;
    }

    // Load current theme if not already loaded
    if (!this.currentTheme) {
      await this.loadCurrentTheme();
    }

    // Remove existing theme classes
    hostElement.classList.remove(
      WindowsConfig.CSS_CLASSES.THEME_LIGHT, 
      WindowsConfig.CSS_CLASSES.THEME_DARK
    );
    
    // Apply current theme class
    const themeClass = `theme-${this.currentTheme}`;
    hostElement.classList.add(themeClass);
    
    this.logger.debug('Theme applied to host', { 
      theme: this.currentTheme, 
      className: themeClass 
    });
  }

  /**
   * Setup theme change listener
   */
  setupThemeChangeListener() {
    if (this.themeChangeListener) return; // Already setup

    this.boundHandleThemeChange = this._handleThemeChange.bind(this);
    storageManager.on("change:THEME", this.boundHandleThemeChange);
    
    this.logger.debug('Theme change listener added');
  }

  /**
   * Remove theme change listener
   */
  removeThemeChangeListener() {
    if (this.boundHandleThemeChange) {
      storageManager.off("change:THEME", this.boundHandleThemeChange);
      this.boundHandleThemeChange = null;
      this.logger.debug('Theme change listener removed');
    }
  }

  /**
   * Handle theme change event
   */
  async _handleThemeChange({ newValue }) {
    if (!newValue) return;

    const previousTheme = this.currentTheme;
    this.currentTheme = getResolvedUserTheme(newValue);
    
    this.logger.debug('Theme changed', { 
      from: previousTheme, 
      to: this.currentTheme 
    });

    // Apply theme to all managed elements
    await this.applyThemeToAllElements();
    
    // Notify about theme change
    if (this.onThemeChange) {
      this.onThemeChange(this.currentTheme, previousTheme);
    }
  }

  /**
   * Apply theme to all currently managed elements
   */
  async applyThemeToAllElements() {
    // Apply to all popup hosts
    const popupHosts = document.querySelectorAll(`.${WindowsConfig.CSS_CLASSES.POPUP_HOST}`);
    for (const host of popupHosts) {
      await this.applyThemeToHost(host);
    }

    this.logger.debug('Theme applied to all elements', { 
      elementCount: popupHosts.length 
    });
  }

  /**
   * Get theme-specific CSS variables
   */
  getThemeVariables(theme = this.currentTheme) {
    return WindowsConfig.STYLES.POPUP_VARIABLES[theme] || WindowsConfig.STYLES.POPUP_VARIABLES.light;
  }

  /**
   * Apply theme variables to element
   */
  applyThemeVariables(element, theme = this.currentTheme) {
    if (!element) return;

    const variables = this.getThemeVariables(theme);
    
    for (const [property, value] of Object.entries(variables)) {
      element.style.setProperty(property, value);
    }

    this.logger.debug('Theme variables applied to element', { theme });
  }

  /**
   * Get current theme
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Check if current theme is dark
   */
  isDarkTheme() {
    return this.currentTheme === 'dark';
  }

  /**
   * Check if current theme is light
   */
  isLightTheme() {
    return this.currentTheme === 'light';
  }

  /**
   * Toggle theme (for testing purposes)
   */
  async toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.currentTheme = newTheme;
    await this.applyThemeToAllElements();
    
    this.logger.debug('Theme toggled', { newTheme });
    return newTheme;
  }

  /**
   * Get theme-specific icon filter
   */
  getIconFilter(theme = this.currentTheme) {
    if (theme === 'dark') {
      return 'invert(90%) brightness(1.1)';
    }
    return 'none';
  }

  /**
   * Apply icon theme
   */
  applyIconTheme(iconElement, theme = this.currentTheme) {
    if (!iconElement) return;

    const filter = this.getIconFilter(theme);
    iconElement.style.filter = filter;
    
    this.logger.debug('Icon theme applied', { theme, filter });
  }

  /**
   * Create theme-aware styles
   */
  createThemedStyles(additionalStyles = '') {
    const baseStyles = this.getBaseThemedStyles();
    return baseStyles + additionalStyles;
  }

  /**
   * Get base themed styles
   */
  getBaseThemedStyles() {
    return `
      :host {
        font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      :host(.theme-light) {
        ${this._variablesToCSS(WindowsConfig.STYLES.POPUP_VARIABLES.light)}
      }
      :host(.theme-dark) {
        ${this._variablesToCSS(WindowsConfig.STYLES.POPUP_VARIABLES.dark)}
      }
    `;
  }

  /**
   * Convert variables object to CSS string
   */
  _variablesToCSS(variables) {
    return Object.entries(variables)
      .map(([prop, value]) => `${prop}: ${value};`)
      .join(' ');
  }

  /**
   * Set theme change callback
   */
  setThemeChangeCallback(callback) {
    this.onThemeChange = callback;
  }

  /**
   * Force refresh theme
   */
  async refreshTheme() {
    await this.loadCurrentTheme();
    await this.applyThemeToAllElements();
    this.logger.debug('Theme refreshed');
  }

  /**
   * Get theme class name
   */
  getThemeClassName(theme = this.currentTheme) {
    return `theme-${theme}`;
  }

  /**
   * Check if element has theme class
   */
  hasThemeClass(element, theme = this.currentTheme) {
    if (!element) return false;
    return element.classList.contains(this.getThemeClassName(theme));
  }

  /**
   * Cleanup theme manager
   */
  cleanup() {
    this.removeThemeChangeListener();
    this.onThemeChange = null;
    this.currentTheme = 'light';
    this.logger.debug('ThemeManager cleanup completed');
  }
}