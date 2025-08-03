/**
 * Shortcut Manager - Modular keyboard shortcut system for content scripts
 * Handles ESC, Ctrl+/, and other shortcuts in an organized manner
 */

export class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.listeners = new Map();
    this.initialized = false;
    this.globalListener = null;
  }

  /**
   * Initialize the shortcut manager
   */
  initialize() {
    if (this.initialized) {
      console.warn('[ShortcutManager] Already initialized');
      return;
    }

    console.log('[ShortcutManager] Initializing shortcut manager');

    // Setup global keyboard listener
    this.setupGlobalListener();

    // Register default shortcuts
    this.registerDefaultShortcuts();
    
    this.initialized = true;
    console.log('[ShortcutManager] ✅ Initialized successfully');
  }

  /**
   * Setup global keyboard event listener
   */
  setupGlobalListener() {
    this.globalListener = this.handleKeyboardEvent.bind(this);
    
    // Use capture phase to catch events before other handlers
    document.addEventListener('keydown', this.globalListener, {
      capture: true,
      passive: false
    });
    
    console.log('[ShortcutManager] Global keyboard listener setup');
  }

  /**
   * Register default shortcuts
   */
  async registerDefaultShortcuts() {
    // Import shortcut handlers
    const { RevertShortcut } = await import('./RevertShortcut.js');
    
    // Register ESC shortcut for revert
    this.registerShortcut('Escape', new RevertShortcut());
    
    console.log('[ShortcutManager] Default shortcuts registered');
  }

  /**
   * Register a shortcut handler
   * @param {string} key - Key combination (e.g., 'Escape', 'Ctrl+/', 'Alt+t')
   * @param {Object} handler - Shortcut handler instance
   */
  registerShortcut(key, handler) {
    if (this.shortcuts.has(key)) {
      console.warn(`[ShortcutManager] Overwriting shortcut for key: ${key}`);
    }
    
    this.shortcuts.set(key, handler);
    console.log(`[ShortcutManager] ✅ Registered shortcut for: ${key}`);
  }

  /**
   * Unregister a shortcut
   * @param {string} key - Key combination
   */
  unregisterShortcut(key) {
    if (this.shortcuts.has(key)) {
      this.shortcuts.delete(key);
      console.log(`[ShortcutManager] Unregistered shortcut for: ${key}`);
    }
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event - Keyboard event
   */
  async handleKeyboardEvent(event) {
    if (!this.initialized) return;

    // Build key combination string
    const keyCombo = this.buildKeyCombo(event);
    
    // Check if we have a handler for this key combination
    const handler = this.shortcuts.get(keyCombo);
    if (!handler) return;

    console.log(`[ShortcutManager] Processing shortcut: ${keyCombo}`);

    try {
      // Check if shortcut should be executed (conditions)
      const shouldExecute = await handler.shouldExecute(event);
      if (!shouldExecute) {
        console.log(`[ShortcutManager] Shortcut ${keyCombo} conditions not met`);
        return;
      }

      // Prevent default behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Execute shortcut
      const result = await handler.execute(event);
      
      console.log(`[ShortcutManager] Shortcut ${keyCombo} executed:`, result);
      
    } catch (error) {
      console.error(`[ShortcutManager] Error executing shortcut ${keyCombo}:`, error);
    }
  }

  /**
   * Build key combination string from event
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {string} Key combination string
   */
  buildKeyCombo(event) {
    const parts = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    
    // Add the main key
    if (event.key) {
      parts.push(event.key);
    } else if (event.code) {
      parts.push(event.code);
    }
    
    return parts.join('+');
  }

  /**
   * Get registered shortcuts info
   * @returns {Object} Shortcuts info
   */
  getShortcutsInfo() {
    const shortcuts = {};
    
    for (const [key, handler] of this.shortcuts.entries()) {
      shortcuts[key] = {
        type: handler.constructor.name,
        description: handler.getDescription ? handler.getDescription() : 'No description'
      };
    }
    
    return {
      initialized: this.initialized,
      shortcutCount: this.shortcuts.size,
      shortcuts
    };
  }

  /**
   * Cleanup shortcut manager
   */
  cleanup() {
    // Remove global listener
    if (this.globalListener) {
      document.removeEventListener('keydown', this.globalListener, { capture: true });
      this.globalListener = null;
    }

    // Clear shortcuts
    this.shortcuts.clear();
    this.listeners.clear();
    this.initialized = false;
    
    console.log('[ShortcutManager] Cleaned up');
  }
}

// Export singleton instance
export const shortcutManager = new ShortcutManager();