// ModeManager Service - Handles mode switching and configuration

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { CONFIG, KEY_CODES } from "../constants/selectElementConstants.js";
import { SelectElementValidation } from "@/features/element-selection/constants/SelectElementModes.js";

export class ModeManager {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ModeManager');
    this.config = { ...CONFIG };
    this.state = {
      isCtrlPressed: false,
      isActive: false
    };
  }

  /**
   * Initialize the mode manager
   */
  async initialize() {
    this.logger.debug('ModeManager initialized');
  }

  /**
   * Setup keyboard listeners for Ctrl key dynamic mode switching
   */
  setupKeyboardListeners() {
    // Listen for keydown events
    document.addEventListener('keydown', (event) => {
      if (event.key === KEY_CODES.CONTROL && !this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = true;
        this.setMode('simple');
        const emoji = SelectElementValidation.getModeEmoji('simple');
        this.logger.info(`${emoji} Ctrl pressed: Dynamic switch to ${SelectElementValidation.getDisplayName('simple')}`);
      }
    }, true);

    // Listen for keyup events
    document.addEventListener('keyup', (event) => {
      if (event.key === KEY_CODES.CONTROL && this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = false;
        this.setMode(this.config.baseMode);
        const emoji = SelectElementValidation.getModeEmoji(this.config.baseMode);
        const displayName = SelectElementValidation.getDisplayName(this.config.baseMode);
        this.logger.info(`${emoji} Ctrl released: Dynamic switch back to ${displayName}`);
      }
    }, true);

    // Handle window blur (when user switches to another window/tab while holding Ctrl)
    window.addEventListener('blur', () => {
      if (this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = false;
        this.setMode(this.config.baseMode);
        const displayName = SelectElementValidation.getDisplayName(this.config.baseMode);
        this.logger.info(`🌫️ Window blur: Auto-reset to ${displayName}`);
      }
    });

    // Handle tab visibility change (when user switches to another tab)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.isActive) {
        this.logger.info('🔄 Tab became hidden: Deactivating select element mode');
      }
    });

    this.logger.debug('Keyboard listeners setup completed');
  }

  /**
   * Update configuration for text validation
   * @param {Object} newConfig - Configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.debug('Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Switch between simple and smart modes
   * @param {string} mode - Validation mode
   */
  setMode(mode) {
    if (SelectElementValidation.isValidMode(mode)) {
      this.config.mode = mode;
      
      // If not triggered by Ctrl key, update base mode too
      if (!this.state.isCtrlPressed) {
        this.config.baseMode = mode;
      }
      
      const trigger = this.state.isCtrlPressed ? '(Ctrl key)' : '(manual/base)';
      const displayName = SelectElementValidation.getDisplayName(mode);
      this.logger.info(`Mode switched to: ${displayName} ${trigger}`);
    } else {
      const validModes = SelectElementValidation.getAllModes().join(', ');
      this.logger.warn(`Invalid mode: ${mode}. Valid modes: ${validModes}`);
    }
  }

  /**
   * Get current mode
   * @returns {string} Current mode
   */
  getMode() {
    return this.config.mode;
  }

  /**
   * Update activity state
   * @param {boolean} isActive - Whether select element mode is active
   */
  setActiveState(isActive) {
    this.state.isActive = isActive;
    if (!isActive) {
      this.state.isCtrlPressed = false;
    }
  }

  /**
   * Get current activity state
   * @returns {boolean} Whether select element mode is active
   */
  isActive() {
    return this.state.isActive;
  }

  /**
   * Get Ctrl key state
   * @returns {boolean} Whether Ctrl key is pressed
   */
  isCtrlPressed() {
    return this.state.isCtrlPressed;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Remove event listeners if needed
    this.state.isCtrlPressed = false;
    this.state.isActive = false;
    this.logger.debug('ModeManager cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      config: this.config,
      state: this.state
    };
  }
}
