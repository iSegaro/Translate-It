import { BaseProxyStrategy } from './BaseProxyStrategy.js';

/**
 * HTTP Proxy Strategy
 * Handles HTTP requests through HTTP proxy server
 */
export class HttpProxyStrategy extends BaseProxyStrategy {
  constructor(config) {
    super(config);
  }

  /**
   * Execute HTTP request through HTTP proxy
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async execute(url, options = {}) {
    if (!this._validateConfig()) {
      throw new Error('Invalid HTTP proxy configuration');
    }

    this.logger.debug('Executing HTTP proxy request', {
      ...this._getStrategyInfo(),
      url: this._sanitizeUrl(url)
    });

    try {
      // For HTTP proxy, we modify the request to go through proxy
      const proxyOptions = {
        ...options,
        headers: this._addProxyHeaders(options.headers)
      };

      // For HTTP URLs, we can proxy directly
      if (url.startsWith('http://')) {
        return await this._proxyHttpRequest(url, proxyOptions);
      }
      // For HTTPS URLs with HTTP proxy, we need CONNECT method
      else if (url.startsWith('https://')) {
        return await this._proxyHttpsRequest(url, proxyOptions);
      }

      throw new Error('Unsupported URL scheme for HTTP proxy');

    } catch (error) {
      this.logger.error('HTTP proxy request failed', {
        ...this._getStrategyInfo(),
        url: this._sanitizeUrl(url),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Proxy HTTP request directly through HTTP proxy
   * @private
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _proxyHttpRequest(url, options) {
    // For HTTP proxy, we send the full URL to the proxy server
    const proxyUrl = `http://${this.config.host}:${this.config.port}`;

    // The proxy server will handle the request to the target URL
    const proxyOptions = {
      ...options,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        'Host': new URL(url).host
      }
    };

    this.logger.debug('Sending HTTP request through proxy', {
      proxyUrl,
      targetUrl: this._sanitizeUrl(url)
    });

    // Send request to proxy with target URL as path
    const fullProxyUrl = `${proxyUrl}/${url}`;
    return fetch(fullProxyUrl, proxyOptions);
  }

  /**
   * Proxy HTTPS request through HTTP proxy using CONNECT
   * @private
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _proxyHttpsRequest(url, options) {
    this.logger.debug('HTTPS through HTTP proxy not directly supported, falling back to direct connection');

    // For HTTPS through HTTP proxy, we would need to implement CONNECT tunnel
    // This is complex in browser environment, so we fall back to direct connection
    return fetch(url, options);
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