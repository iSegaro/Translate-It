/**
 * Text Field Interaction Store
 * Manages state for text field icons and keyboard shortcuts
 */

import { defineStore } from 'pinia';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export const useTextFieldInteractionStore = defineStore('textFieldInteraction', {
  state: () => ({
    // Text field icons
    activeIcons: [],
    iconIdCounter: 0,
    
    // Keyboard shortcuts
    shortcutStats: {
      attempts: 0,
      successes: 0,
      errors: 0,
      lastResult: null
    },
    
    // Feature flags
    iconEnabled: true,
    shortcutEnabled: true,
    
    // Debug info
    initialized: false,
    lastActivity: null
  }),
  
  getters: {
    /**
     * Check if any icon is active
     */
    isIconActive: (state) => state.activeIcons.length > 0,
    
    /**
     * Get total number of active icons
     */
    iconCount: (state) => state.activeIcons.length,
    
    /**
     * Get icon by ID
     */
    getIcon: (state) => (iconId) => {
      return state.activeIcons.find(icon => icon.id === iconId) || null;
    },
    
    /**
     * Check if icon exists
     */
    hasIcon: (state) => (iconId) => {
      return state.activeIcons.some(icon => icon.id === iconId);
    },
    
    /**
     * Get shortcut success rate
     */
    shortcutSuccessRate: (state) => {
      if (state.shortcutStats.attempts === 0) return 0;
      return (state.shortcutStats.successes / state.shortcutStats.attempts) * 100;
    },
    
    /**
     * Get store information for debugging
     */
    getInfo: (state) => ({
      initialized: state.initialized,
      activeIcons: state.activeIcons.length,
      shortcutStats: state.shortcutStats,
      features: {
        iconEnabled: state.iconEnabled,
        shortcutEnabled: state.shortcutEnabled
      },
      lastActivity: state.lastActivity
    })
  },
  
  actions: {
    /**
     * Initialize the store
     */
    initialize() {
      this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextFieldInteractionStore');
      this.initialized = true;
      this.updateActivity('initialize');
      
      this.logger.debug('Text field interaction store initialized');
    },
    
    /**
     * Add a new text field icon
     * @param {Object} iconData - Icon data { id, position }
     */
    addIcon(iconData) {
      if (!iconData.id || !iconData.position) {
        this.logger?.error('Invalid icon data provided:', iconData);
        return false;
      }
      
      // Check if icon already exists
      if (this.hasIcon(iconData.id)) {
        this.logger?.debug('Icon already exists:', iconData.id);
        return false;
      }
      
      // Add icon with additional metadata
      const icon = {
        id: iconData.id,
        position: { ...iconData.position },
        created: Date.now(),
        clicked: false,
        active: true
      };
      
      this.activeIcons.push(icon);
      this.updateActivity('addIcon');
      
      this.logger?.debug('Added text field icon:', icon.id);
      return true;
    },
    
    /**
     * Remove a text field icon
     * @param {string} iconId - Icon ID to remove
     */
    removeIcon(iconId) {
      const index = this.activeIcons.findIndex(icon => icon.id === iconId);
      
      if (index === -1) {
        this.logger?.debug('Icon not found for removal:', iconId);
        return false;
      }
      
      this.activeIcons.splice(index, 1);
      this.updateActivity('removeIcon');
      
      this.logger?.debug('Removed text field icon:', iconId);
      return true;
    },
    
    /**
     * Clear all active icons
     */
    clearAllIcons() {
      const count = this.activeIcons.length;
      this.activeIcons = [];
      this.updateActivity('clearAllIcons');
      
      this.logger?.debug(`Cleared ${count} text field icons`);
      return count;
    },
    
    /**
     * Mark an icon as clicked
     * @param {string} iconId - Icon ID
     */
    markIconClicked(iconId) {
      const icon = this.getIcon(iconId);
      if (icon) {
        icon.clicked = true;
        icon.clickedAt = Date.now();
        this.updateActivity('iconClick');
        
        this.logger?.debug('Marked icon as clicked:', iconId);
        return true;
      }
      
      return false;
    },
    
    /**
     * Update icon position
     * @param {string} iconId - Icon ID
     * @param {Object} position - New position
     */
    updateIconPosition(iconId, position) {
      const icon = this.getIcon(iconId);
      if (icon && position) {
        icon.position = { ...position };
        icon.updated = Date.now();
        this.updateActivity('updateIconPosition');
        
        this.logger?.debug('Updated icon position:', iconId);
        return true;
      }
      
      return false;
    },
    
    /**
     * Increment shortcut attempt counter
     */
    incrementShortcutAttempt() {
      this.shortcutStats.attempts++;
      this.updateActivity('shortcutAttempt');
      
      this.logger?.debug('Shortcut attempt incremented:', this.shortcutStats.attempts);
    },
    
    /**
     * Increment shortcut success counter
     */
    incrementShortcutSuccess() {
      this.shortcutStats.successes++;
      this.updateActivity('shortcutSuccess');
      
      this.logger?.debug('Shortcut success incremented:', this.shortcutStats.successes);
    },
    
    /**
     * Increment shortcut error counter
     */
    incrementShortcutError() {
      this.shortcutStats.errors++;
      this.updateActivity('shortcutError');
      
      this.logger?.debug('Shortcut error incremented:', this.shortcutStats.errors);
    },
    
    /**
     * Update last shortcut result
     * @param {Object} result - Shortcut execution result
     */
    updateLastShortcutResult(result) {
      this.shortcutStats.lastResult = {
        ...result,
        timestamp: result.timestamp || Date.now()
      };
      
      this.updateActivity('shortcutResult');
      
      this.logger?.debug('Updated last shortcut result:', result.success ? 'success' : 'error');
    },
    
    /**
     * Reset shortcut statistics
     */
    resetShortcutStats() {
      this.shortcutStats = {
        attempts: 0,
        successes: 0,
        errors: 0,
        lastResult: null
      };
      
      this.updateActivity('resetStats');
      
      this.logger?.debug('Shortcut statistics reset');
    },
    
    /**
     * Enable/disable text field icon feature
     * @param {boolean} enabled - Whether to enable
     */
    setIconEnabled(enabled) {
      this.iconEnabled = Boolean(enabled);
      this.updateActivity('setIconEnabled');
      
      // Clear icons if disabling
      if (!enabled) {
        this.clearAllIcons();
      }
      
      this.logger?.debug('Icon feature enabled:', enabled);
    },
    
    /**
     * Enable/disable keyboard shortcut feature
     * @param {boolean} enabled - Whether to enable
     */
    setShortcutEnabled(enabled) {
      this.shortcutEnabled = Boolean(enabled);
      this.updateActivity('setShortcutEnabled');
      
      this.logger?.debug('Shortcut feature enabled:', enabled);
    },
    
    /**
     * Update last activity timestamp
     * @param {string} action - Action name
     */
    updateActivity(action) {
      this.lastActivity = {
        action,
        timestamp: Date.now()
      };
    },
    
    /**
     * Get detailed statistics
     * @returns {Object} Detailed statistics
     */
    getDetailedStats() {
      return {
        icons: {
          active: this.activeIcons.length,
          clicked: this.activeIcons.filter(icon => icon.clicked).length,
          oldest: this.activeIcons.length > 0 
            ? Math.min(...this.activeIcons.map(icon => icon.created))
            : null,
          newest: this.activeIcons.length > 0
            ? Math.max(...this.activeIcons.map(icon => icon.created))
            : null
        },
        shortcuts: {
          ...this.shortcutStats,
          successRate: this.shortcutSuccessRate,
          errorRate: this.shortcutStats.attempts > 0 
            ? (this.shortcutStats.errors / this.shortcutStats.attempts) * 100 
            : 0
        },
        features: {
          iconEnabled: this.iconEnabled,
          shortcutEnabled: this.shortcutEnabled
        },
        system: {
          initialized: this.initialized,
          lastActivity: this.lastActivity
        }
      };
    },
    
    /**
     * Cleanup store state
     */
    cleanup() {
      this.clearAllIcons();
      this.resetShortcutStats();
      this.initialized = false;
      this.lastActivity = null;
      
      this.logger?.debug('Store cleaned up');
    }
  }
});