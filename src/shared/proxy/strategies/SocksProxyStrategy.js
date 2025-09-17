import { BaseProxyStrategy } from './BaseProxyStrategy.js';

/**
 * SOCKS Proxy Strategy
 * Handles requests through SOCKS proxy server
 * Note: SOCKS is complex to implement in browser environment
 */
export class SocksProxyStrategy extends BaseProxyStrategy {
  constructor(config) {
    super(config);
  }

  /**
   * Execute request through SOCKS proxy
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async execute(url, options = {}) {
    if (!this._validateConfig()) {
      throw new Error('Invalid SOCKS proxy configuration');
    }

    this.logger.debug('Executing SOCKS proxy request', {
      ...this._getStrategyInfo(),
      url: this._sanitizeUrl(url)
    });

    // SOCKS proxy implementation is complex in browser environment
    // We provide a simplified approach that may work with some SOCKS proxies
    try {
      return await this._socksProxy(url, options);
    } catch (error) {
      this.logger.error('SOCKS proxy failed', {
        ...this._getStrategyInfo(),
        url: this._sanitizeUrl(url),
        error: error.message
      });

      // Do NOT fall back to direct connection - rethrow the error
      throw new Error(`SOCKS proxy connection failed: ${error.message}`);
    }
  }

  /**
   * Attempt SOCKS proxy connection
   * @private
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _socksProxy(url, options) {
    // Note: True SOCKS implementation requires binary protocol handling
    // Some SOCKS proxies support HTTP-over-SOCKS which we can attempt

    this.logger.debug('Attempting SOCKS proxy connection', {
      proxyHost: this.config.host,
      proxyPort: this.config.port,
      targetUrl: this._sanitizeUrl(url)
    });

    // First, validate that we can reach the proxy server itself
    // This helps distinguish between invalid proxy host vs proxy connectivity issues
    try {
      const proxyUrl = `http://${this.config.host}:${this.config.port}`;

      // Test basic connectivity to the proxy
      await fetch(proxyUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      // If we can reach the proxy, continue with proxy attempt
      return await this._attemptProxyRequest(url, options, proxyUrl);

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Cannot connect to SOCKS proxy at ${this.config.host}:${this.config.port}. Connection timed out.`);
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error(`Cannot connect to SOCKS proxy at ${this.config.host}:${this.config.port}. Please check the proxy address and port.`);
      } else {
        throw new Error(`SOCKS proxy connection failed: ${error.message}`);
      }
    }
  }

  /**
   * Attempt to make the actual proxy request
   * @private
   */
  async _attemptProxyRequest(url, options, proxyUrl) {
    const proxyOptions = {
      ...options,
      headers: this._addProxyHeaders(options.headers)
    };

    try {
      this.logger.debug('Attempting HTTP-over-SOCKS request');

      // For HTTP URLs, we can try to proxy directly
      if (url.startsWith('http://')) {
        const fullProxyUrl = `${proxyUrl}/${url}`;
        return await fetch(fullProxyUrl, {
          ...proxyOptions,
          headers: {
            ...proxyOptions.headers,
            'Host': new URL(url).host
          }
        });
      }
      // For HTTPS URLs through SOCKS, we need a different approach
      else if (url.startsWith('https://')) {
        return await this._socksHttpsConnect(url, proxyOptions);
      }

      throw new Error('Unsupported URL scheme for SOCKS proxy');
    } catch (error) {
      this.logger.debug('HTTP-over-SOCKS failed', {
        error: error.message
      });
      throw new Error(`SOCKS proxy request failed: ${error.message}`);
    }
  }

  /**
   * Try SOCKS connection using HTTP CONNECT method
   * @private
   * @param {string} url - Target URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async _socksHttpsConnect(url, options) {
    const targetUrl = new URL(url);
    const proxyUrl = `http://${this.config.host}:${this.config.port}`;

    this.logger.debug('Attempting HTTPS through SOCKS proxy', {
      proxyUrl,
      targetHost: targetUrl.hostname,
      targetPort: targetUrl.port || 443
    });

    // In browser extensions, we cannot implement proper SOCKS CONNECT tunnel
    // Instead, we'll try to use the proxy as a regular HTTP proxy
    // This works if the SOCKS proxy also supports HTTP proxy mode

    try {
      // Try to fetch through the proxy directly
      // Some SOCKS proxies support this hybrid mode
      const response = await fetch(proxyUrl, {
        ...options,
        method: options.method || 'GET',
        headers: {
          ...options.headers,
          'Host': targetUrl.host,
          'X-Target-URL': url,
          'X-Proxy-Mode': 'socks'
        }
      });

      // If we get a response, consider it successful
      if (response.status < 500) {
        return response;
      } else {
        throw new Error(`Proxy returned error status: ${response.status}`);
      }
    } catch (error) {
      this.logger.debug('HTTPS through SOCKS failed', {
        error: error.message
      });
      throw new Error(`Cannot establish HTTPS connection through SOCKS proxy: ${error.message}`);
    }
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