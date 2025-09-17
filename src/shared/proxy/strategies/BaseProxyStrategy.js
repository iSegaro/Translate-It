import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * Base class for proxy strategies
 * Provides common functionality for all proxy types
 */
export class BaseProxyStrategy {
  constructor(config) {
    this.config = config;
    this.logger = getScopedLogger(LOG_COMPONENTS.PROXY, `${this.constructor.name}`);
  }

  /**
   * Execute fetch request through proxy
   * Must be implemented by subclasses
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async execute() {
    throw new Error(`execute method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Add proxy authentication headers
   * @protected
   * @param {Object} headers - Existing headers
   * @returns {Object} Headers with proxy auth
   */
  _addProxyHeaders(headers = {}) {
    const newHeaders = { ...headers };

    if (this.config.auth?.username) {
      const auth = btoa(`${this.config.auth.username}:${this.config.auth.password || ''}`);
      newHeaders['Proxy-Authorization'] = `Basic ${auth}`;
    }

    return newHeaders;
  }

  /**
   * Validate proxy configuration
   * @protected
   * @returns {boolean}
   */
  _validateConfig() {
    if (!this.config) {
      this.logger.debug('No proxy config provided');
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

    if (!port || isNaN(port) || port < 1 || port > 65535) {
      this.logger.debug('Invalid proxy port:', port);
      return false;
    }

    return true;
  }

  /**
   * Get proxy URL for this strategy
   * @protected
   * @returns {string}
   */
  _getProxyUrl() {
    const { host, port } = this.config;
    return `${this.config.type}://${host}:${port}`;
  }

  /**
   * Get strategy info for logging
   * @protected
   * @returns {Object}
   */
  _getStrategyInfo() {
    return {
      strategy: this.constructor.name,
      type: this.config.type,
      host: this.config.host,
      port: this.config.port
    };
  }
}