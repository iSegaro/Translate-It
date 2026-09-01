import { BaseProxyStrategy } from './BaseProxyStrategy.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const SOCKS_PREFLIGHT_TIMEOUT_MS = 5000;
const SOCKS_TIMEOUT_FAILURE = 'socks-proxy-timeout';

function createAbortError(message = 'The operation was aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function createTimeoutError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation timed out', 'TimeoutError');
  }

  const error = new Error('The operation timed out');
  error.name = 'TimeoutError';
  return error;
}

function preserveCallerAbortReason(reason) {
  return reason instanceof Error ? reason : createAbortError();
}

function isAbortError(error, signal) {
  return signal?.aborted || error?.name === 'AbortError';
}

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
   * @param {Object} responsePolicy - Request-local response handling policy
   * @returns {Promise<Response>}
   */
  async execute(url, options = {}, responsePolicy = {}) {
    if (!this._validateConfig()) {
      throw new Error('Invalid SOCKS proxy configuration');
    }

    this.logger.debug('Executing SOCKS proxy request', {
      ...this._getStrategyInfo(),
      url: this._sanitizeUrl(url),
      method: options.method || 'GET'
    });

    // SOCKS proxy implementation is complex in browser environment
    // We provide a simplified approach that may work with some SOCKS proxies
    try {
      return await this._socksProxy(url, options, responsePolicy);
    } catch (error) {
      if (error?.type || error?.transportFailure || error?.operationAborted || error?.name === 'AbortError') {
        throw error;
      }

      this.logger.error(`[SocksProxy] Request failed: ${this._sanitizeUrl(url)} - ${error.message}`);
      this.logger.debug('SOCKS proxy failure details', {
        ...this._getStrategyInfo(),
        url: this._sanitizeUrl(url),
        error: error.message,
        method: options.method || 'GET'
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
  async _socksProxy(url, options, responsePolicy) {
    // Note: True SOCKS implementation requires binary protocol handling
    // Some SOCKS proxies support HTTP-over-SOCKS which we can attempt

    this.logger.debug('Attempting SOCKS proxy connection', {
      proxyHost: this.config.host,
      proxyPort: this.config.port,
      targetUrl: this._sanitizeUrl(url),
      method: options.method || 'GET'
    });

    // First, validate that we can reach the proxy server itself.
    // This helps distinguish between invalid proxy host vs proxy connectivity issues.
    try {
      const proxyUrl = `http://${this.config.host}:${this.config.port}`;
      const callerSignal = options.signal;
      const preflightController = new AbortController();
      let timeoutId = null;
      let callerAbortHandler = null;
      let timeoutWon = false;
      let callerAbortWon = false;

      const abortFromCaller = () => {
        if (preflightController.signal.aborted) return;
        callerAbortWon = true;
        preflightController.abort(preserveCallerAbortReason(callerSignal.reason));
      };

      if (callerSignal?.aborted) {
        throw preserveCallerAbortReason(callerSignal.reason);
      } else if (callerSignal) {
        callerAbortHandler = abortFromCaller;
        callerSignal.addEventListener('abort', callerAbortHandler, { once: true });
      }

      timeoutId = setTimeout(() => {
        if (preflightController.signal.aborted) return;
        timeoutWon = true;
        preflightController.abort(createTimeoutError());
      }, SOCKS_PREFLIGHT_TIMEOUT_MS);

      // Test basic connectivity to the proxy
      try {
        await fetch(proxyUrl, {
          method: 'HEAD',
          signal: preflightController.signal
        });
      } catch (error) {
        if (callerAbortWon) throw error;
        if (timeoutWon) {
          const timeoutError = new Error('SOCKS proxy connection timed out');
          timeoutError.type = ErrorTypes.NETWORK_ERROR;
          timeoutError.transportFailure = SOCKS_TIMEOUT_FAILURE;
          timeoutError.cause = error;
          throw timeoutError;
        }
        throw error;
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (callerSignal && callerAbortHandler) {
          callerSignal.removeEventListener('abort', callerAbortHandler);
        }
      }

      // If we can reach the proxy, continue with proxy attempt
      return await this._attemptProxyRequest(url, options, proxyUrl, responsePolicy);

    } catch (error) {
      if (error?.transportFailure === SOCKS_TIMEOUT_FAILURE || error?.type || isAbortError(error, options.signal)) {
        throw error;
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
  async _attemptProxyRequest(url, options, proxyUrl, responsePolicy) {
    const proxyOptions = {
      ...options,
      headers: this._addProxyHeaders(options.headers)
    };

    try {
      this.logger.debug('[SocksProxy] Attempting HTTP-over-SOCKS request');

      // For HTTP URLs, we can try to proxy directly
      if (url.startsWith('http://')) {
        const fullProxyUrl = `${proxyUrl}/${url}`;
        const response = await fetch(fullProxyUrl, {
          ...proxyOptions,
          headers: {
            ...proxyOptions.headers,
            'Host': new URL(url).host
          }
        });

        // Check if the response is actually from the target or an error page
        const contentType = response.headers.get('content-type');

        // If we get HTML content, it's likely an error page from the proxy
        if (contentType && contentType.includes('text/html')) {
          throw new Error('SOCKS proxy returned HTML error page instead of target response');
        }

        return response;
      }
      // For HTTPS URLs through SOCKS, we need a different approach
      else if (url.startsWith('https://')) {
        return await this._socksHttpsConnect(url, proxyOptions, responsePolicy);
      }

      throw new Error('Unsupported URL scheme for SOCKS proxy');
    } catch (error) {
      if (isAbortError(error, options.signal)) throw error;
      this.logger.debug('[SocksProxy] HTTP-over-SOCKS failed', {
        error: error.message,
        url: this._sanitizeUrl(url)
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
  async _socksHttpsConnect(url, options, responsePolicy = {}) {
    const targetUrl = new URL(url);
    const proxyUrl = `http://${this.config.host}:${this.config.port}`;

    this.logger.debug('[SocksProxy] Attempting HTTPS through SOCKS proxy', {
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

      // Check if the response is actually from the target or an error page
      const contentType = response.headers.get('content-type');

      // If we get HTML content, it's likely an error page from the proxy
      if (contentType && contentType.includes('text/html') && responsePolicy.allowHtmlResponse !== true) {
        throw new Error('SOCKS proxy returned HTML error page instead of target response');
      }

      // For successful responses, return them
      if (response.status < 500) {
        return response;
      } else {
        throw new Error(`Proxy returned error status: ${response.status}`);
      }
    } catch (error) {
      if (isAbortError(error, options.signal)) throw error;
      this.logger.debug('[SocksProxy] HTTPS through SOCKS failed', {
        error: error.message,
        targetHost: targetUrl.hostname
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
