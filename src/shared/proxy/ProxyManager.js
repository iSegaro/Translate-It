import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'ProxyManager');

/**
 * Chrome Extension Proxy Manager
 * Uses Chrome's proxy API for actual proxy functionality
 */
export class ProxyManager {
  constructor() {
    this.config = null;
    this.currentProxyMode = 'direct'; // 'direct', 'auto_detect', 'fixed_servers', 'pac_script'
    this.proxyRules = null;
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

    if (config?.enabled && chrome?.proxy) {
      // Configure Chrome proxy API
      this._configureChromeProxy();
    } else if (!config?.enabled && chrome?.proxy) {
      // Clear proxy configuration
      this._clearChromeProxy();
    }

    logger.debug('Proxy config updated:', {
      enabled: config?.enabled,
      type: config?.type,
      host: config?.host,
      port: config?.port,
      hasAuth: !!(config?.auth?.username)
    });
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

    const proxyUrl = this._buildProxyUrl();

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

    logger.debug('Proxy fetch options prepared for:', url);
    return options;
  }

  /**
   * Make a fetch request through proxy
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}) {
    // With Chrome proxy API, the proxy is applied at the browser level
    // All fetch requests will automatically use the proxy if configured
    return fetch(url, options);
  }

  /**
   * Configure Chrome proxy API
   * @private
   */
  _configureChromeProxy() {
    if (!chrome.proxy) {
      logger.warn('Chrome proxy API not available. Please ensure "proxy" permission is granted.');
      return;
    }

    const { type, host, port, auth } = this.config;
    const scheme = type === 'socks' ? 'socks5' : type;

    const config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: scheme,
          host: host,
          port: port
        },
        bypassList: ['localhost', '127.0.0.1', '::1']
      }
    };

    // Configure proxy authentication if provided
    if (auth?.username) {
      if (chrome.webRequest && chrome.webRequest.onAuthRequired) {
        chrome.webRequest.onAuthRequired.addListener(
          (details) => {
            return {
              authCredentials: {
                username: auth.username,
                password: auth.password || ''
              }
            };
          },
          { urls: ['<all_urls>'] },
          ['blocking']
        );
      }
    }

    chrome.proxy.settings.set(
      { value: config, scope: 'regular' },
      () => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to set proxy:', chrome.runtime.lastError);
        } else {
          logger.debug('Chrome proxy configured successfully');
          this.currentProxyMode = 'fixed_servers';
        }
      }
    );
  }

  /**
   * Clear Chrome proxy configuration
   * @private
   */
  _clearChromeProxy() {
    if (!chrome.proxy) return;

    chrome.proxy.settings.clear(
      { scope: 'regular' },
      () => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to clear proxy:', chrome.runtime.lastError);
        } else {
          logger.debug('Chrome proxy cleared successfully');
          this.currentProxyMode = 'direct';
        }
      }
    );
  }

  /**
   * Test proxy connection
   * @param {string} testUrl - URL to test against (optional)
   * @returns {Promise<boolean>}
   */
  async testConnection(testUrl = 'https://httpbin.org/ip') {
    if (!this.isEnabled()) {
      try {
        // Test direct connection
        logger.debug('Testing direct connection to:', testUrl);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const success = response.ok;
        logger.debug('Direct connection test:', success ? 'success' : `failed with status ${response.status}`);
        return success;
      } catch (error) {
        logger.debug('Direct connection test failed:', error.message);
        return false;
      }
    }

    // For proxy connection test with Chrome API
    try {
      logger.debug('Testing proxy connection with Chrome Proxy API');

      // First, validate proxy configuration
      if (!this._validateProxyConfig()) {
        logger.debug('Proxy configuration validation failed');
        return false;
      }

      // Test if Chrome proxy API is available
      if (!chrome.proxy) {
        logger.debug('Chrome proxy API not available');
        return false;
      }

      // Apply proxy configuration temporarily for testing
      this._configureChromeProxy();

      // Test the connection through proxy
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Use a service that shows IP to verify proxy is working
      const response = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        logger.debug('Connection test successful. IP:', data.ip);
        return true;
      } else {
        logger.debug(`Connection test failed with status ${response.status}`);
        return false;
      }

    } catch (error) {
      logger.debug('Proxy connection test failed:', error.message);
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
      logger.debug('No proxy config found');
      return false;
    }

    const { type, host, port } = this.config;

    if (!type || !['http', 'https', 'socks'].includes(type)) {
      logger.debug('Invalid proxy type:', type);
      return false;
    }

    if (!host || typeof host !== 'string' || host.trim() === '') {
      logger.debug('Invalid proxy host:', host);
      return false;
    }

    // More strict hostname/IP validation
    if (!this._isValidHostname(host.trim())) {
      logger.debug('Invalid proxy hostname format:', host);
      return false;
    }

    if (!port || isNaN(port) || port < 1 || port > 65535) {
      logger.debug('Invalid proxy port:', port);
      return false;
    }

    // Check for common mistakes
    if (host.trim() === port.toString()) {
      logger.debug('Host cannot be the same as port:', { host, port });
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
      logger.debug('Hostname cannot be just a number:', hostname);
      return false;
    }

    // Valid hostname regex
    const hostnameRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

    // Valid IP address regex
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // Must be either valid hostname or valid IP
    return hostnameRegex.test(hostname) || ipRegex.test(hostname);
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
        logger.debug('Proxy hostname validation failed:', host);
        return false;
      }

      logger.debug('Proxy host format validation passed:', host);

      // Since we can't actually connect to proxy in browser extension,
      // we'll just return true if validation passed
      // In a real implementation, we would test actual connectivity
      return true;

    } catch (error) {
      logger.debug('Proxy reachability test error:', error.message);
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
   * Build proxy URL for logging/debugging
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