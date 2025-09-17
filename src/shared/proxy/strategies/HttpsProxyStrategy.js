import { BaseProxyStrategy } from './BaseProxyStrategy.js';

/**
 * HTTPS Proxy Strategy
 * Handles HTTPS requests through HTTPS proxy server
 */
export class HttpsProxyStrategy extends BaseProxyStrategy {
  constructor(config) {
    super(config);
  }

  /**
   * Execute request through HTTPS proxy
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async execute(url, options = {}) {
    if (!this._validateConfig()) {
      throw new Error('Invalid HTTPS proxy configuration');
    }

    this.logger.debug('Executing HTTPS proxy request', {
      ...this._getStrategyInfo(),
      url: this._sanitizeUrl(url)
    });

    try {
      // For HTTPS proxy, we use the proxy as an HTTPS endpoint
      const proxyOptions = {
        ...options,
        headers: this._addProxyHeaders(options.headers)
      };

      // Route through HTTPS proxy server
      return await this._proxyThroughHttps(url, proxyOptions);

    } catch (error) {
      this.logger.error('HTTPS proxy request failed', {
        ...this._getStrategyInfo(),
        url: this._sanitizeUrl(url),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Route request through HTTPS proxy
   * @private
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _proxyThroughHttps(url, options) {
    const proxyUrl = `https://${this.config.host}:${this.config.port}`;

    // Parse target URL
    const targetUrl = new URL(url);

    const proxyOptions = {
      ...options,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        'Host': targetUrl.host,
        'X-Target-URL': url  // Custom header to indicate target URL
      }
    };

    this.logger.debug('Sending request through HTTPS proxy', {
      proxyUrl,
      targetUrl: this._sanitizeUrl(url)
    });

    // Simple approach: send request to proxy with target info
    // Note: This assumes the proxy server supports URL forwarding
    return fetch(proxyUrl, proxyOptions);
  }

  /**
   * Sanitize URL for logging
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
}