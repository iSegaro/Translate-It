/**
 * Site Handler Registry - Manages dynamic loading and caching of site handlers
 * Provides centralized access to site-specific functionality
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { BaseSiteHandler } from "../sites/base/BaseSiteHandler.js";
import { FieldTypes, SelectionMethods, SiteHandlerResult } from "../core/types.js";

// Static imports for all handlers
import { ZohoWriterHandler } from "../sites/ZohoWriterHandler.js";
import { GoogleSuiteHandler } from "../sites/base/GoogleSuiteHandler.js";
import { MicrosoftOfficeHandler } from "../sites/base/MicrosoftOfficeHandler.js";
import { WPSHandler } from "../sites/WPSHandler.js";
import { NotionHandler } from "../sites/NotionHandler.js";

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SiteHandlerRegistry');

class SiteHandlerRegistry {
  constructor() {
    this._handlers = new Map();
    this._cache = new Map();
    this._defaultHandler = null;
    this._initialized = false;
  }

  /**
   * Initialize registry with built-in handlers
   */
  async initialize() {
    if (this._initialized) return;

    try {
      // Create default handler for unknown sites
      this._defaultHandler = new DefaultSiteHandler();
      
      // Register known site patterns
      this.registerSitePatterns();
      
      this._initialized = true;
      logger.debug('SiteHandlerRegistry initialized successfully', {
        registeredPatterns: Object.keys(this._sitePatterns || {}),
        patternsCount: Object.keys(this._sitePatterns || {}).length
      });
    } catch (error) {
      logger.error('Failed to initialize SiteHandlerRegistry:', error);
      throw error;
    }
  }

  /**
   * Register site patterns for lazy loading
   */
  registerSitePatterns() {
    // Map hostnames to handler classes
    this._sitePatterns = {
      // Zoho Writer
      'writer.zoho.com': {
        handlerClass: ZohoWriterHandler,
        className: 'ZohoWriterHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'zoho-writer',
          selectors: ['.zw-line-div', '.zw-text-portion', '#editorpane'],
          features: ['office-suite', 'cloud-sync', 'transparent-selection'],
          selectionStrategy: 'double-click-required',
          selectionEventStrategy: 'mouse-based'
        }
      },
      
      // Google Suite (will be handled by GoogleSuiteHandler)
      'docs.google.com': {
        handlerClass: GoogleSuiteHandler,
        className: 'GoogleSuiteHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'iframe-based',
          selectors: ['[contenteditable="true"]', '.kix-page'],
          selectionStrategy: 'double-click-required',
          selectionEventStrategy: 'mouse-based'
        }
      },

      'slides.google.com': {
        handlerClass: GoogleSuiteHandler,
        className: 'GoogleSuiteHandler'
      },

      'sites.google.com': {
        handlerClass: GoogleSuiteHandler,
        className: 'GoogleSuiteHandler'
      },

      // Microsoft Office (will be handled by MicrosoftOfficeHandler)
      'office.live.com': {
        handlerClass: MicrosoftOfficeHandler,
        className: 'MicrosoftOfficeHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'iframe-based'
        }
      },

      'word-edit.officeapps.live.com': {
        handlerClass: MicrosoftOfficeHandler,
        className: 'MicrosoftOfficeHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'content-editable',
          selectors: ['.NormalTextRun', '[contenteditable="true"]']
        }
      },

      // WPS Office
      'wps.com': {
        handlerClass: WPSHandler,
        className: 'WPSHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'input-based'
        }
      },

      // Notion
      'notion.so': {
        handlerClass: NotionHandler,
        className: 'NotionHandler',
        config: {
          type: FieldTypes.PROFESSIONAL_EDITOR,
          selectionMethod: 'content-editable',
          selectors: ['[contenteditable="true"]', '.notion-text-block']
        }
      }
    };
  }

  /**
   * Get handler for specific hostname
   * @param {string} hostname - Target hostname
   * @returns {Promise<BaseSiteHandler>} Site handler instance
   */
  async getHandler(hostname) {
    if (!this._initialized) {
      await this.initialize();
    }

    // Check cache first
    if (this._cache.has(hostname)) {
      const cached = this._cache.get(hostname);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
        return cached.handler;
      }
    }

    // Find matching pattern
    const pattern = this.findMatchingPattern(hostname);
    if (!pattern) {
      logger.debug(`No specific handler for ${hostname}, using default`, {
        hostname,
        availablePatterns: Object.keys(this._sitePatterns || {})
      });
      this._cache.set(hostname, {
        handler: this._defaultHandler,
        timestamp: Date.now()
      });
      return this._defaultHandler;
    }

    // Load handler dynamically
    const handler = await this.loadHandler(hostname, pattern);
    
    // Cache handler
    this._cache.set(hostname, {
      handler,
      timestamp: Date.now()
    });

    return handler;
  }

  /**
   * Find matching pattern for hostname
   * @param {string} hostname - Target hostname
   * @returns {Object|null} Matching pattern or null
   */
  findMatchingPattern(hostname) {
    logger.debug(`Finding pattern for hostname: ${hostname}`, {
      hostname,
      availablePatterns: Object.keys(this._sitePatterns || {}),
      patternsInitialized: !!this._sitePatterns
    });
    
    // Exact match first
    if (this._sitePatterns[hostname]) {
      logger.debug(`Exact match found for ${hostname}`);
      return { hostname, ...this._sitePatterns[hostname] };
    }

    // Pattern matching
    for (const [pattern, config] of Object.entries(this._sitePatterns)) {
      if (hostname === pattern || 
          hostname.endsWith('.' + pattern) || 
          hostname.includes(pattern)) {
        logger.debug(`Pattern match found: ${pattern} for ${hostname}`);
        return { hostname: pattern, ...config };
      }
    }

    logger.debug(`No pattern match found for ${hostname}`);
    return null;
  }

  /**
   * Load handler using static class reference
   * @param {string} hostname - Target hostname
   * @param {Object} pattern - Handler pattern
   * @returns {Promise<BaseSiteHandler>} Handler instance
   */
  async loadHandler(hostname, pattern) {
    try {
      // Check if handler is already instantiated
      const handlerKey = `${pattern.className}:${hostname}`;
      if (this._handlers.has(handlerKey)) {
        return this._handlers.get(handlerKey);
      }

      // Use static class reference
      const HandlerClass = pattern.handlerClass;
      
      if (!HandlerClass) {
        throw new Error(`Handler class ${pattern.className} not found in registry`);
      }

      // Create handler instance
      const handler = new HandlerClass(hostname, pattern.config || {});
      
      // Store handler
      this._handlers.set(handlerKey, handler);
      
      logger.debug(`Loaded handler ${pattern.className} for ${hostname}`);
      return handler;

    } catch (error) {
      logger.error(`Failed to load handler for ${hostname}:`, error);
      // Fallback to default handler
      return this._defaultHandler;
    }
  }

  /**
   * Register custom handler
   * @param {string} hostname - Target hostname
   * @param {BaseSiteHandler} handler - Handler instance
   */
  registerHandler(hostname, handler) {
    const handlerKey = `${handler.constructor.name}:${hostname}`;
    this._handlers.set(handlerKey, handler);
    
    // Update cache
    this._cache.set(hostname, {
      handler,
      timestamp: Date.now()
    });

    logger.debug(`Registered custom handler ${handler.constructor.name} for ${hostname}`);
  }

  /**
   * Get current hostname
   * @returns {string} Current hostname
   */
  getCurrentHostname() {
    const hostname = window.location.hostname.toLowerCase();
    logger.debug('Getting current hostname', { hostname });
    return hostname;
  }

  /**
   * Test registry pattern matching - for debugging
   */
  testPatternMatching(testHostname) {
    const hostname = testHostname || this.getCurrentHostname();
    logger.debug('Testing pattern matching', {
      hostname,
      patternsInitialized: !!this._sitePatterns,
      initialized: this._initialized,
      patterns: this._sitePatterns ? Object.keys(this._sitePatterns) : 'null'
    });
    
    const pattern = this.findMatchingPattern(hostname);
    logger.debug('Pattern matching result', {
      hostname,
      foundPattern: pattern,
      patternExists: !!pattern
    });
    
    return pattern;
  }

  /**
   * Get handler for current site
   * @returns {Promise<BaseSiteHandler>} Current site handler
   */
  async getCurrentHandler() {
    const hostname = this.getCurrentHostname();
    logger.debug('Getting current site handler', { hostname });
    const handler = await this.getHandler(hostname);
    logger.debug('Current site handler resolved', {
      hostname,
      handlerName: handler?.constructor.name,
      handlerType: typeof handler
    });
    return handler;
  }

  /**
   * Clear handler cache
   */
  clearCache() {
    this._cache.clear();
    logger.debug('Handler cache cleared');
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry stats
   */
  getStats() {
    return {
      initialized: this._initialized,
      loadedHandlers: this._handlers.size,
      cachedHandlers: this._cache.size,
      registeredPatterns: Object.keys(this._sitePatterns || {}).length,
      currentHostname: this.getCurrentHostname()
    };
  }

  /**
   * Cleanup registry
   */
  cleanup() {
    // Cleanup all handlers
    for (const handler of this._handlers.values()) {
      if (handler && typeof handler.cleanup === 'function') {
        handler.cleanup();
      }
    }

    this._handlers.clear();
    this._cache.clear();
    this._initialized = false;

    logger.debug('SiteHandlerRegistry cleaned up');
  }
}

/**
 * Default handler for unknown sites
 */
class DefaultSiteHandler extends BaseSiteHandler {
  constructor() {
    super('default', {
      type: FieldTypes.REGULAR_INPUT,
      selectionMethod: SelectionMethods.STANDARD,
      selectors: ['input', 'textarea', '[contenteditable="true"]'],
      features: ['basic-text']
    });
  }

  async detectSelection(element /* , options = {} */) {
    try {
      let selectedText = '';

      // Try standard selection methods
      selectedText = this.getStandardSelection(element);
      
      if (!selectedText) {
        selectedText = this.getInputSelection(element);
      }

      if (!selectedText) {
        selectedText = this.getContentEditableSelection(element);
      }

      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: { method: 'default', element: element?.tagName }
      });

    } catch (error) {
      this.logger.error('Default selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  async calculatePosition(element, options = {}) {
    try {
      const position = this.calculateStandardPosition(element, options);
      return position;
    } catch (error) {
      this.logger.error('Default position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }
}

// Export singleton instance
export const siteHandlerRegistry = new SiteHandlerRegistry();

// Also export class for testing
export { SiteHandlerRegistry };

// Expose debugging functions globally
if (typeof window !== 'undefined') {
  window.siteHandlerRegistry = siteHandlerRegistry;
  window.debugSiteHandlers = () => siteHandlerRegistry.testPatternMatching();
}