import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import ExtensionContextManager from '@/core/extensionContext.js';

/**
 * Extension-Only Proxy Manager
 * Uses strategy pattern for different proxy types without affecting browser-wide settings
 */
export class ProxyManager {
  constructor() {
    this.config = null;
    this.strategies = new Map();
    this.logger = getScopedLogger(LOG_COMPONENTS.PROXY, 'ProxyManager');
    this.errorHandler = ErrorHandler.getInstance();
    this._initializeStrategies();
  }

  /**
   * Initialize proxy strategies
   * @private
   */
  async _initializeStrategies() {
    try {
      // Lazy load strategies to avoid circular dependencies
      const { HttpProxyStrategy } = await import('./strategies/HttpProxyStrategy.js');
      const { HttpsProxyStrategy } = await import('./strategies/HttpsProxyStrategy.js');
      const { SocksProxyStrategy } = await import('./strategies/SocksProxyStrategy.js');

      this.strategies.set('http', HttpProxyStrategy);
      this.strategies.set('https', HttpsProxyStrategy);
      this.strategies.set('socks', SocksProxyStrategy);

      this.logger.debug('Proxy strategies initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize proxy strategies', error);
    }
  }

  /**
   * Set proxy configuration
   * @param {Object} config - Proxy configuration
   * @param {boolean} config.enabled - Whether proxy is enabled
   * @param {string} config.type - Proxy type: 'http', 'https', 'socks'
   * @param {string} config.host - Proxy host
   * @param {number} config.port - Proxy port
   * @param {Object} config.auth - Authentication (optional)
   * @param {string} config.auth.username - Username
   * @param {string} config.auth.password - Password
   */
  setConfig(config) {
    this.config = config;

    this.logger.debug('Proxy config updated:', {
      enabled: config?.enabled,
      type: config?.type,
      host: config?.host,
      port: config?.port,
      hasAuth: !!(config?.auth?.username)
    });

    if (config?.enabled) {
      this.logger.info(`[Proxy] Enabled: ${config.type}://${config.host}:${config.port}`);
    } else {
      this.logger.info('[Proxy] Disabled');
    }
  }

  /**
   * Check if proxy is enabled and configured
   * @returns {boolean}
   */
  isEnabled() {
    return this.config?.enabled &&
           this.config?.host &&
           this.config?.port &&
           this.config?.type;
  }

  /**
   * Create fetch options with proxy support
   * @param {string} url - Target URL
   * @param {Object} originalOptions - Original fetch options
   * @returns {Object} - Modified fetch options
   */
  createFetchOptions(url, originalOptions = {}) {
    if (!this.isEnabled()) {
      return originalOptions;
    }

    // For browser extensions, we need to use a proxy agent or similar approach
    // Since fetch doesn't directly support proxy, we'll modify the approach
    const options = { ...originalOptions };

    // Add proxy headers if needed
    if (this.config.auth?.username) {
      const auth = btoa(`${this.config.auth.username}:${this.config.auth.password || ''}`);
      options.headers = {
        ...options.headers,
        'Proxy-Authorization': `Basic ${auth}`
      };
    }

    // Note: In browser extension context, actual proxy implementation
    // may require using chrome.proxy API or similar browser-specific APIs
    // For now, we'll prepare the configuration for potential integration

    this.logger.debug('Proxy fetch options prepared', {
      url: this._sanitizeUrl(url),
      hasAuth: !!(this.config.auth?.username),
      proxyType: this.config.type
    });
    return options;
  }

  /**
   * Make a fetch request through proxy (extension-only)
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}) {
    // Check extension context first
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Extension context invalid, using direct fetch');
      return fetch(url, options);
    }

    if (!this.isEnabled()) {
      this.logger.debug('Proxy disabled, using direct fetch');
      return fetch(url, options);
    }

    const startTime = Date.now();

    try {
      this.logger.debug('Initiating proxy fetch', {
        url: this._sanitizeUrl(url),
        proxyType: this.config.type,
        proxyHost: this.config.host,
        proxyPort: this.config.port
      });

      const strategy = await this._getStrategy(url);
      const result = await strategy.execute(url, options);

      const duration = Date.now() - startTime;
      this.logger.info(`[Proxy] Request successful: ${this._sanitizeUrl(url)} (${duration}ms via ${this.config.type})`);
      this.logger.debug('Proxy request details', {
        url: this._sanitizeUrl(url),
        duration,
        proxyType: this.config.type,
        proxyHost: this.config.host
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      await this.errorHandler.handle(error, {
        context: 'proxy-manager-fetch',
        showToast: false, // Silent for proxy errors
        metadata: {
          url: this._sanitizeUrl(url),
          proxyConfig: this._getConfigSummary(),
          duration: `${duration}ms`
        }
      });

      this.logger.error(`[Proxy] Request failed: ${this._sanitizeUrl(url)} - ${error.message} (${duration}ms)`);
      this.logger.debug('Proxy failure details', {
        url: this._sanitizeUrl(url),
        error: error.message,
        duration,
        proxyType: this.config.type,
        proxyHost: this.config.host
      });

      // Do NOT fall back to direct connection - rethrow the error
      throw error;
    }
  }

  /**
   * Get appropriate strategy for URL and proxy type
   * @private
   * @param {string} url - Target URL
   * @returns {Object} Strategy instance
   */
  async _getStrategy() {
    if (!this.strategies.size) {
      await this._initializeStrategies();
    }

    const StrategyClass = this.strategies.get(this.config.type);
    if (!StrategyClass) {
      throw new Error(`Unsupported proxy type: ${this.config.type}`);
    }

    return new StrategyClass(this.config);
  }

  /**
   * Initialize proxy configuration from settings
   * @private
   */
  async _initializeProxy() {
    try {
      const { getSettingsAsync } = await import('@/shared/config/config.js');
      const settings = await getSettingsAsync();

      if (settings.PROXY_ENABLED) {
        this.setConfig({
          enabled: settings.PROXY_ENABLED,
          type: settings.PROXY_TYPE,
          host: settings.PROXY_HOST,
          port: settings.PROXY_PORT,
          auth: {
            username: settings.PROXY_USERNAME,
            password: settings.PROXY_PASSWORD
          }
        });
      }
    } catch (error) {
      this.logger.warn('Failed to initialize proxy from settings', error);
    }
  }

  /**
   * Test proxy connection
   * @param {string} testUrl - URL to test against (optional)
   * @returns {Promise<boolean>}
   */
  async testConnection(testUrl = 'https://httpbin.org/ip') {
    const startTime = Date.now();

    // This method is specifically for testing proxy connection
    if (!this.isEnabled()) {
      this.logger.warn('Proxy test called but proxy is not enabled');
      return false;
    }

    // Test proxy connection
    try {
      this.logger.info(`[Proxy] Testing connection: ${this.config.type}://${this.config.host}:${this.config.port}`);
      this.logger.debug('Connection test details', {
        testUrl,
        proxyType: this.config.type,
        proxyHost: this.config.host,
        proxyPort: this.config.port
      });

      // Validate proxy configuration
      if (!this._validateProxyConfig()) {
        this.logger.warn('Proxy configuration validation failed - please check your proxy settings');
        return false;
      }

      // Test through proxy manager's fetch method
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await this.fetch(testUrl, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (response.ok) {
        try {
          const data = await response.json();
          this.logger.info(`[Proxy] Connection test successful (${duration}ms) - IP: ${data.ip}`);
          this.logger.debug('Test success details', {
            ip: data.ip,
            duration,
            proxyType: this.config.type
          });
        } catch {
          this.logger.info(`[Proxy] Connection test successful (${duration}ms) - Status: ${response.status}`);
          this.logger.debug('Test success details', {
            status: response.status,
            duration,
            proxyType: this.config.type
          });
        }
        return true;
      } else {
        this.logger.warn(`[Proxy] Connection test failed: HTTP ${response.status} (${duration}ms)`);
        this.logger.debug('Test failure details', {
          status: response.status,
          duration,
          proxyType: this.config.type
        });
        return false;
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.warn(`[Proxy] Connection test failed: ${error.message} (${duration}ms)`);
      this.logger.debug('Test error details', {
        error: error.message,
        duration,
        proxyType: this.config.type,
        proxyHost: this.config.host
      });
      return false;
    }
  }

  /**
   * Validate proxy configuration
   * @private
   * @returns {boolean}
   */
  _validateProxyConfig() {
    if (!this.config) {
      this.logger.debug('No proxy config found');
      return false;
    }

    const { type, host, port } = this.config;

    if (!type || !['http', 'https', 'socks'].includes(type)) {
      this.logger.debug('Invalid proxy type:', type);
      return false;
    }

    if (!host || typeof host !== 'string' || host.trim() === '') {
      this.logger.debug('Invalid proxy host:', host);
      return false;
    }

    // More strict hostname/IP validation
    if (!this._isValidHostname(host.trim())) {
      this.logger.debug('Invalid proxy hostname format:', host);
      return false;
    }

    if (!port || isNaN(port) || port < 1 || port > 65535) {
      this.logger.debug('Invalid proxy port:', port);
      return false;
    }

    // Check for common mistakes
    if (host.trim() === port.toString()) {
      this.logger.debug('Host cannot be the same as port:', { host, port });
      return false;
    }

    return true;
  }

  /**
   * Validate hostname format more strictly
   * @private
   * @param {string} hostname
   * @returns {boolean}
   */
  _isValidHostname(hostname) {
    // Check if it's just a number (common mistake - using port as host)
    if (/^\d+$/.test(hostname)) {
      this.logger.debug('Hostname cannot be just a number:', hostname);
      return false;
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) {
      this.logger.debug('Hostname contains invalid characters:', hostname);
      return false;
    }

    // Check if it starts or ends with a dot or hyphen
    if (/^[.-]/.test(hostname) || /[.-]$/.test(hostname)) {
      this.logger.debug('Hostname cannot start or end with dot or hyphen:', hostname);
      return false;
    }

    // Check for consecutive dots
    if (/\.\./.test(hostname)) {
      this.logger.debug('Hostname cannot contain consecutive dots:', hostname);
      return false;
    }

    // Valid IP address regex
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // If it's a valid IP, accept it
    if (ipRegex.test(hostname)) {
      return true;
    }

    // Valid hostname regex - each label must be 1-63 characters and can contain a-z, A-Z, 0-9, and hyphens (but not at start/end)
    const labels = hostname.split('.');

    // Must have at least one label
    if (labels.length === 0) {
      this.logger.debug('Hostname must have at least one label:', hostname);
      return false;
    }

    // Validate each label
    for (const label of labels) {
      if (label.length === 0 || label.length > 63) {
        this.logger.debug('Hostname label must be 1-63 characters:', label);
        return false;
      }

      if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
        this.logger.debug('Hostname label contains invalid characters or format:', label);
        return false;
      }
    }

    // All checks passed
    return true;
  }

  /**
   * Test if proxy server is reachable (basic connectivity)
   * @private
   * @returns {Promise<boolean>}
   */
  async _testProxyReachability() {
    try {
      const { host } = this.config;

      // Use the improved hostname validation
      if (!this._isValidHostname(host.trim())) {
        this.logger.debug('Proxy hostname validation failed:', host);
        return false;
      }

      this.logger.debug('Proxy host format validation passed:', host);

      // Since we can't actually connect to proxy in browser extension,
      // we'll just return true if validation passed
      // In a real implementation, we would test actual connectivity
      return true;

    } catch (error) {
      this.logger.debug('Proxy reachability test error:', error.message);
      return false;
    }
  }

  /**
   * Get proxy status information
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.isEnabled(),
      config: this.config ? {
        type: this.config.type,
        host: this.config.host,
        port: this.config.port,
        hasAuth: !!(this.config.auth?.username)
      } : null
    };
  }

  /**
   * Sanitize URL for logging (remove sensitive data)
   * @private
   * @param {string} url
   * @returns {string}
   */
  _sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }

  /**
   * Get proxy config summary for logging
   * @private
   * @returns {Object}
   */
  _getConfigSummary() {
    if (!this.config) return null;

    return {
      type: this.config.type,
      host: this.config.host,
      port: this.config.port,
      hasAuth: !!(this.config.auth?.username)
    };
  }

  /**
   * Build proxy URL for debugging (with masked credentials)
   * @private
   */
  _buildProxyUrl() {
    if (!this.config) return null;

    const { type, host, port, auth } = this.config;
    const authStr = auth?.username ? `${auth.username}:***@` : '';
    return `${type}://${authStr}${host}:${port}`;
  }
}

// Singleton instance
export const proxyManager = new ProxyManager();
export default proxyManager;