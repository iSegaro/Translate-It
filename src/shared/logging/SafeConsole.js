/**
 * SafeConsole - Production-Safe Console Wrapper
 *
 * This console wrapper bypasses build-time removal by using alternative methods
 * that won't be detected by minifiers like Terser and ESBuild.
 *
 * Features:
 * - Bypasses console removal in production builds
 * - Runtime toggle based on DEBUG_MODE setting
 * - Queue system for logs when disabled
 * - Multiple fallback mechanisms for maximum compatibility
 * - Performance optimized when disabled
 */

// Global state for console output
let isEnabled = false;

// Store original console methods before they might be overwritten
// Use globalThis for cross-context compatibility (service worker, content script, etc.)
const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
const originalConsole = {
  log: globalScope.console?.log?.bind(globalScope.console),
  info: globalScope.console?.info?.bind(globalScope.console),
  warn: globalScope.console?.warn?.bind(globalScope.console),
  error: globalScope.console?.error?.bind(globalScope.console),
  debug: globalScope.console?.debug?.bind(globalScope.console),
};

/**
 * Get console reference using multiple fallback methods
 * This prevents build tools from detecting and removing console usage
 */
function getConsoleRef() {
  try {
    // Method 1: Window property access with string concatenation (for content scripts)
    if (typeof window !== 'undefined' && window['con' + 'sole']) {
      return window['con' + 'sole'];
    }

    // Method 2: GlobalThis access with computed property (works in all contexts)
    if (globalThis && globalThis['con' + 'sole']) {
      return globalThis['con' + 'sole'];
    }

    // Method 3: Self access for service workers
    if (typeof self !== 'undefined' && self['con' + 'sole']) {
      return self['con' + 'sole'];
    }

    // Method 4: Direct console access (fallback)
    if (typeof console !== 'undefined') {
      return console;
    }

    // Method 5: Direct return as final fallback
    // console is a global object, if we reach here it should be available
    // or we return the empty fallback object below
  } catch {
    // Silent fail - don't break the application
  }

  // Fallback to empty object with no-op methods
  return {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

/**
 * Safe console implementation that bypasses build-time removal
 */
const safeConsole = {
  /**
   * Enable or disable console output
   * @param {boolean} enabled - Whether console output should be enabled
   */
  setEnabled(enabled) {
    isEnabled = enabled;
    // No queue operations - performance optimized
  },

  /**
   * Check if console is currently enabled
   * @returns {boolean}
   */
  isLoggingEnabled() {
    return isEnabled;
  },

  /**
   * Flush queued logs when console is enabled
   * Note: Queue system removed for performance optimization
   */
  flushQueuedLogs() {
    // No-op - queue system removed for performance
    return;
  },

  /**
   * Clear all queued logs
   */
  clearQueue() {
    // No-op - queue system removed for performance
  },

  /**
   * Get current queue size
   * @returns {number}
   */
  getQueueSize() {
    return 0; // Always 0 - queue system removed
  },

  // Console methods implementation
  log(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        // Use multiple methods to bypass different minifiers
        const method1 = consoleRef['log'];
        const method2 = originalConsole.log;

        if (method1) {
          method1(...args);
        } else if (method2) {
          method2(...args);
        }
      } catch {
        // Fallback to original console if available
        originalConsole.log?.(...args);
      }
    }
    // No queue when disabled - waste of memory and CPU
  },

  info(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        const method1 = consoleRef['info'];
        const method2 = originalConsole.info;

        if (method1) {
          method1(...args);
        } else if (method2) {
          method2(...args);
        }
      } catch {
        originalConsole.info?.(...args);
      }
    }
    // No queue when disabled - waste of memory and CPU
  },

  warn(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        const method1 = consoleRef['warn'];
        const method2 = originalConsole.warn;

        if (method1) {
          method1(...args);
        } else if (method2) {
          method2(...args);
        }
      } catch {
        originalConsole.warn?.(...args);
      }
    }
    // No queue when disabled - waste of memory and CPU
  },

  error(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        const method1 = consoleRef['error'];
        const method2 = originalConsole.error;

        if (method1) {
          method1(...args);
        } else if (method2) {
          method2(...args);
        }
      } catch {
        originalConsole.error?.(...args);
      }
    }
    // No queue when disabled - waste of memory and CPU
  },

  debug(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        const method1 = consoleRef['debug'];
        const method2 = originalConsole.debug;

        if (method1) {
          method1(...args);
        } else if (method2) {
          method2(...args);
        }
      } catch {
        originalConsole.debug?.(...args);
      }
    }
    // No queue when disabled - waste of memory and CPU
  },

  // Advanced methods for special cases
  group(...args) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        consoleRef['group']?.(...args);
      } catch {
        originalConsole.group?.(...args);
      }
    }
  },

  groupEnd() {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        consoleRef['groupEnd']?.();
      } catch {
        originalConsole.groupEnd?.();
      }
    }
  },

  time(label) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        consoleRef['time']?.(label);
      } catch {
        originalConsole.time?.(label);
      }
    }
  },

  timeEnd(label) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        consoleRef['timeEnd']?.(label);
      } catch {
        originalConsole.timeEnd?.(label);
      }
    }
  },

  table(data) {
    if (isEnabled) {
      try {
        const consoleRef = getConsoleRef();
        consoleRef['table']?.(data);
      } catch {
        originalConsole.table?.(data);
      }
    }
  },

  /**
   * Create a context-specific console instance
   * @param {string} context - Context name to prefix to all logs
   * @returns {Object} Console instance with context prefix
   */
  createContext(context) {
    return {
      log: (...args) => this.log(`[${context}]`, ...args),
      info: (...args) => this.info(`[${context}]`, ...args),
      warn: (...args) => this.warn(`[${context}]`, ...args),
      error: (...args) => this.error(`[${context}]`, ...args),
      debug: (...args) => this.debug(`[${context}]`, ...args),
      group: (...args) => this.group(`[${context}]`, ...args),
      groupEnd: () => this.groupEnd(),
      time: (label) => this.time(`${context}:${label}`),
      timeEnd: (label) => this.timeEnd(`${context}:${label}`),
      table: (data) => this.table(data),
    };
  },
};

// Auto-detect if we're in development mode and enable by default
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
  safeConsole.setEnabled(true);
}

// Auto-enable in all contexts for development builds
try {
  // Check if we're in development environment
  const isDevelopment = typeof __IS_DEVELOPMENT__ !== 'undefined' ? __IS_DEVELOPMENT__ :
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

  if (isDevelopment) {
    safeConsole.setEnabled(true);
  }
} catch {
  // Silent fail - don't break if environment detection fails
}

export { safeConsole };
export default safeConsole;