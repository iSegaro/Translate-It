import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  POSITION_CONFIG,
  IFRAME_CONFIG,
  VALIDATION_CONFIG,
  FEATURE_CONFIG,
  ConfigUtils,
} from '../config/TextFieldConfig.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'IframePositionCalculator');

/**
 * Iframe Position Calculator
 *
 * A centralized utility for calculating iframe position conversion with multiple strategies.
 * This class consolidates all iframe position calculation logic into a single, maintainable component.
 */
export class IframePositionCalculator {
  constructor(options = {}) {
    // Dependencies
    this.logger = options.logger || logger;

    // State tracking
    this.lastMouseEvent = null;
    this.trackedMousePosition = null;
    this.mouseTrackingEnabled = false;
    this.pendingPositionRequests = new Map();

    // Configuration (can be overridden)
    this.config = {
      ...POSITION_CONFIG,
      ...IFRAME_CONFIG,
      ...options.config,
    };

    // Bind methods
    this.setupMouseTracking = this.setupMouseTracking.bind(this);
    this.disableMouseTracking = this.disableMouseTracking.bind(this);
    this.calculatePosition = this.calculatePosition.bind(this);
    this.convertIframePositionToMain = this.convertIframePositionToMain.bind(this);
  }

  /**
   * Calculate position with multiple fallback strategies
   * This is the main entry point for all position calculations
   */
  calculatePosition(clientX, clientY, options = {}) {
    const {
      isFromMouseEvent = false,
      actualElement = null,
      useEnhancedEstimation = true,
    } = options;

    this.logger.debug('Calculating position', {
      clientX,
      clientY,
      isFromMouseEvent,
      hasActualElement: !!actualElement,
      isInIframe: window !== window.top,
    });

    // If not in iframe, return coordinates as-is (viewport-relative for WindowsManager)
    if (window === window.top) {
      return this.formatPosition(clientX, clientY, {
        isFromMouseEvent,
        isInIframe: false,
      });
    }

    // For iframe coordinates, convert to main document coordinates
    return this.convertIframePositionToMain({
      x: clientX,
      y: clientY,
      isFromMouseEvent,
    }, actualElement, useEnhancedEstimation);
  }

  /**
   * Convert iframe coordinates to main document coordinates
   * Main conversion logic with multiple strategies
   */
  convertIframePositionToMain(position, actualElement = null, useEnhancedEstimation = true) {
    try {
      this.logger.debug('Converting iframe position to main document', {
        originalPosition: position,
        hasActualElement: !!actualElement,
        useEnhancedEstimation,
      });

      // Store mouse event for future reference
      if (position.isFromMouseEvent) {
        this.lastMouseEvent = {
          x: position.x,
          y: position.y,
          timestamp: Date.now(),
        };
      }

      // Strategy 1: Direct iframe element access (same-origin)
      const directPosition = this.tryDirectIframeAccess(position);
      if (directPosition) {
        return directPosition;
      }

      // Strategy 2: Visual Viewport API
      if (FEATURE_CONFIG.ENABLE_VISUAL_VIEWPORT_API) {
        const viewportPosition = this.tryVisualViewportApi(position);
        if (viewportPosition) {
          return viewportPosition;
        }
      }

      // Strategy 3: Mouse tracking (most reliable for cross-origin)
      if (FEATURE_CONFIG.ENABLE_MOUSE_TRACKING && this.trackedMousePosition) {
        const trackedPosition = this.tryMouseTracking(position);
        if (trackedPosition) {
          return trackedPosition;
        }
      }

      // Strategy 4: Enhanced estimation (if enabled)
      if (useEnhancedEstimation && FEATURE_CONFIG.ENABLE_ENHANCED_ESTIMATION) {
        const enhancedPosition = this.tryEnhancedEstimation(position, actualElement);
        if (enhancedPosition) {
          return enhancedPosition;
        }
      }

      // Strategy 5: Conservative fallback
      if (FEATURE_CONFIG.ENABLE_CONSERVATIVE_FALLBACK) {
        return this.conserviveFallback(position);
      }

      // Final fallback
      return this.formatPosition(position.x, position.y, {
        isFromMouseEvent: true,
        isFallback: true,
      });

    } catch (error) {
      this.logger.error('Error converting iframe position:', error);
      return this.formatPosition(position.x, position.y + this.config.ICON_OFFSET_IFRAME, {
        isFromMouseEvent: true,
        isFallback: true,
      });
    }
  }

  /**
   * Strategy 1: Direct iframe element access (same-origin only)
   */
  tryDirectIframeAccess(position) {
    try {
      if (!window.frameElement) {
        return null;
      }

      const rect = window.frameElement.getBoundingClientRect();
      const mainPosition = {
        x: position.x + rect.left,
        y: position.y + rect.top + this.config.ICON_OFFSET_IFRAME,
        strategy: 'direct-iframe-access',
        isFromMouseEvent: true,
      };

      this.logger.debug('Direct iframe access successful', {
        iframeRect: { left: rect.left, top: rect.top },
        mainPosition,
      });

      return mainPosition;

    } catch (error) {
      this.logger.debug('Direct iframe access failed (cross-origin)', { error: error.message });
      return null;
    }
  }

  /**
   * Strategy 2: Visual Viewport API
   */
  tryVisualViewportApi(position) {
    try {
      if (!window.visualViewport) {
        return null;
      }

      const viewport = window.visualViewport;
      const offsetLeft = viewport.offsetLeft || 0;
      const offsetTop = viewport.offsetTop || 0;

      // Only use if we have meaningful offsets
      if (offsetLeft <= 0 && offsetTop <= 0) {
        return null;
      }

      const mainPosition = {
        x: position.x + offsetLeft,
        y: position.y + offsetTop + this.config.ICON_OFFSET_IFRAME,
        strategy: 'visual-viewport',
        isFromMouseEvent: true,
      };

      this.logger.debug('Visual viewport API successful', {
        viewportOffset: { left: offsetLeft, top: offsetTop },
        mainPosition,
      });

      return mainPosition;

    } catch (error) {
      this.logger.debug('Visual viewport API failed', { error: error.message });
      return null;
    }
  }

  /**
   * Strategy 3: Mouse tracking (most reliable for cross-origin)
   */
  tryMouseTracking(position) {
    try {
      if (!this.trackedMousePosition) {
        return null;
      }

      const timeDiff = Date.now() - this.trackedMousePosition.timestamp;
      if (timeDiff > this.config.MOUSE_TRACKING_MAX_AGE) {
        this.logger.debug('Tracked mouse position too old', { timeDiff });
        return null;
      }

      // Tracked position should already be main document relative
      const mainPosition = {
        x: this.trackedMousePosition.x,
        y: this.trackedMousePosition.y + this.config.ICON_OFFSET_IFRAME,
        strategy: 'mouse-tracking',
        isFromMouseEvent: true,
        trackedAge: timeDiff,
      };

      this.logger.debug('Mouse tracking successful', {
        trackedPosition: this.trackedMousePosition,
        mainPosition,
        timeDiff,
      });

      return mainPosition;

    } catch (error) {
      this.logger.debug('Mouse tracking failed', { error: error.message });
      return null;
    }
  }

  /**
   * Strategy 4: Enhanced estimation using element bounds and heuristics
   */
  tryEnhancedEstimation(position, actualElement = null) {
    try {
      let estimatedPosition = null;

      // Use actual element if available
      if (actualElement) {
        estimatedPosition = this.estimateFromElement(position, actualElement);
      } else {
        estimatedPosition = this.estimateFromCoordinates(position);
      }

      if (estimatedPosition) {
        estimatedPosition.strategy = 'enhanced-estimation';
        estimatedPosition.isFromMouseEvent = true;
      }

      return estimatedPosition;

    } catch (error) {
      this.logger.debug('Enhanced estimation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Enhanced estimation using element bounds
   */
  estimateFromElement(position, element) {
    try {
      const rect = element.getBoundingClientRect();

      // Estimate based on element and mouse coordinates
      const mainPosition = {
        x: Math.max(position.x + this.config.IFRAME_MIN_OFFSET_X, this.config.IFRAME_DEFAULT_OFFSET_X),
        y: Math.max(position.y + this.config.IFRAME_MIN_OFFSET_Y, this.config.IFRAME_DEFAULT_OFFSET_Y),
      };

      this.logger.debug('Element-based estimation', {
        elementRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        iframeCoords: position,
        estimatedPosition: mainPosition,
      });

      return mainPosition;

    } catch (error) {
      this.logger.debug('Element-based estimation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Enhanced estimation using coordinate heuristics
   */
  estimateFromCoordinates(position) {
    try {
      // Check if coordinates are likely iframe-relative
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      if (!ConfigUtils.isLikelyIframeCoordinate(position.x, position.y, viewportWidth, viewportHeight)) {
        // Coordinates appear to be main document relative already
        return {
          x: position.x,
          y: position.y + this.config.ICON_OFFSET_IFRAME,
        };
      }

      // Conservative estimation for iframe-relative coordinates
      const mainPosition = {
        x: position.x + this.config.IFRAME_DEFAULT_OFFSET_X,
        y: position.y + this.config.IFRAME_DEFAULT_OFFSET_Y,
      };

      this.logger.debug('Coordinate-based estimation', {
        iframeCoords: position,
        viewportSize: { width: viewportWidth, height: viewportHeight },
        estimatedPosition: mainPosition,
      });

      return mainPosition;

    } catch (error) {
      this.logger.debug('Coordinate-based estimation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Strategy 5: Conservative fallback
   */
  conserviveFallback(position) {
    const fallbackPosition = {
      x: position.x + this.config.IFRAME_DEFAULT_OFFSET_X,
      y: position.y + this.config.IFRAME_DEFAULT_OFFSET_Y,
      strategy: 'conservative-fallback',
      isFromMouseEvent: true,
      isFallback: true,
    };

    this.logger.warn('Using conservative iframe position fallback', {
      originalPosition: position,
      fallbackPosition,
    });

    return fallbackPosition;
  }

  /**
   * Setup mouse tracking for cross-origin iframe position estimation
   */
  setupMouseTracking() {
    try {
      if (this.mouseTrackingEnabled || !FEATURE_CONFIG.ENABLE_MOUSE_TRACKING) {
        return;
      }

      // Performance optimization: Only enable tracking when actually needed
      const shouldEnableTracking = this.shouldEnableMouseTracking();
      if (!shouldEnableTracking) {
        this.logger.debug('Mouse tracking not needed - skipping setup');
        return;
      }

      this.mouseTrackingEnabled = true;

      // Throttled mouse tracking to improve performance
      let lastUpdateTime = 0;
      const throttleDelay = 16; // ~60fps

      this.mouseMoveHandler = (event) => {
        const now = Date.now();

        // Throttle mouse updates to reduce CPU usage
        if (now - lastUpdateTime < throttleDelay) {
          return;
        }

        lastUpdateTime = now;

        this.trackedMousePosition = {
          x: event.clientX,
          y: event.clientY,
          timestamp: now,
        };
      };

      // Use capture to get events before they're prevented
      document.addEventListener('mousemove', this.mouseMoveHandler, {
        capture: this.config.MOUSE_TRACKING_CAPTURE,
        passive: true // Performance optimization: passive event listener
      });

      this.logger.debug('Mouse tracking enabled for iframe position conversion', {
        capture: this.config.MOUSE_TRACKING_CAPTURE,
        throttleDelay: throttleDelay
      });

    } catch (error) {
      this.logger.error('Failed to setup mouse tracking:', error);
    }
  }

  /**
   * Determine if mouse tracking should be enabled based on context
   * Performance optimization: Only enable tracking when actually needed
   */
  shouldEnableMouseTracking() {
    // Only enable in iframe contexts
    if (window === window.top) {
      return false;
    }

    // Check if feature flags allow mouse tracking
    if (!FEATURE_CONFIG.ENABLE_MOUSE_TRACKING) {
      return false;
    }

    // Additional checks can be added here based on user preferences
    // or browser capabilities
    return true;
  }

  /**
   * Disable mouse tracking
   */
  disableMouseTracking() {
    try {
      this.mouseTrackingEnabled = false;
      this.trackedMousePosition = null;

      if (this.mouseMoveHandler) {
        document.removeEventListener('mousemove', this.mouseMoveHandler, {
          capture: this.config.MOUSE_TRACKING_CAPTURE
        });
        this.mouseMoveHandler = null;
      }

      this.logger.debug('Mouse tracking disabled');

    } catch (error) {
      this.logger.error('Failed to disable mouse tracking:', error);
    }
  }

  /**
   * Format position with standard properties
   */
  formatPosition(x, y, options = {}) {
    return {
      x,
      y,
      isFromMouseEvent: options.isFromMouseEvent || false,
      isFallback: options.isFallback || false,
      strategy: options.strategy || 'unknown',
      isInIframe: options.isInIframe || (window !== window.top),
      ...options,
    };
  }

  /**
   * Find iframe element by frame ID (consolidated from multiple methods)
   */
  findIframeByFrameId(frameId) {
    try {
      // Method 1: Check IFrameManager registry
      if (window.translateItFrameRegistry) {
        const frameData = window.translateItFrameRegistry.get(frameId);
        if (frameData?.element) {
          return frameData.element;
        }
      }

      // Method 2: Search all iframes
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        // Try contentWindow access
        try {
          if (iframe.contentWindow?.frameId === frameId) {
            return iframe;
          }
        } catch {
          // Cross-origin iframe - skip
        }

        // Try dataset attribute
        if (iframe.dataset.frameId === frameId) {
          return iframe;
        }
      }

      this.logger.debug('Could not find iframe with ID', { frameId });
      return null;

    } catch (error) {
      this.logger.error('Error finding iframe by ID:', error);
      return null;
    }
  }

  /**
   * Handle position calculation request from iframe
   */
  handleIframePositionRequest(event) {
    try {
      const { frameId, clientPosition, elementInfo } = event.data;

      this.logger.debug('Received position calculation request from iframe', {
        frameId,
        clientPosition,
        elementInfo,
      });

      const iframeElement = this.findIframeByFrameId(frameId);
      if (!iframeElement) {
        this.logger.debug('Could not find iframe element', { frameId });
        return;
      }

      const rect = iframeElement.getBoundingClientRect();
      const calculatedPosition = {
        x: clientPosition.x + rect.left,
        y: clientPosition.y + rect.top + this.config.ICON_OFFSET_IFRAME,
      };

      // Send response back to iframe
      const response = {
        type: IFRAME_CONFIG.MESSAGE_TYPES.IFRAME_POSITION_CALCULATED,
        frameId,
        calculatedPosition,
        timestamp: Date.now(),
      };

      event.source.postMessage(response, '*');

      this.logger.debug('Sent calculated position back to iframe', {
        frameId,
        calculatedPosition,
      });

    } catch (error) {
      this.logger.error('Error handling iframe position request:', error);
    }
  }

  /**
   * Handle position calculation response from parent
   */
  handlePositionCalculationResponse(event) {
    try {
      const { frameId, calculatedPosition } = event.data;

      this.logger.debug('Received position calculation response', {
        frameId,
        calculatedPosition,
      });

      const requestId = `${frameId}_${calculatedPosition.timestamp}`;
      const pendingRequest = this.pendingPositionRequests.get(requestId);

      if (pendingRequest) {
        pendingRequest(calculatedPosition);
        this.pendingPositionRequests.delete(requestId);
        this.logger.debug('Processed pending position request', { requestId });
      }

    } catch (error) {
      this.logger.error('Error handling position calculation response:', error);
    }
  }

  /**
   * Request position calculation from parent document
   */
  requestPositionFromParent(position, callback) {
    try {
      const timestamp = Date.now();
      const frameId = window.frameId || ConfigUtils.generateFrameId();

      const message = {
        type: IFRAME_CONFIG.MESSAGE_TYPES.CALCULATE_IFRAME_POSITION,
        frameId,
        clientPosition: {
          x: position.x,
          y: position.y,
        },
        elementInfo: this.lastMouseEvent ? {
          x: this.lastMouseEvent.x,
          y: this.lastMouseEvent.y,
          timestamp: this.lastMouseEvent.timestamp,
        } : null,
        timestamp,
      };

      // Store callback for response
      const requestId = `${frameId}_${timestamp}`;
      this.pendingPositionRequests.set(requestId, callback);

      // Set timeout to remove pending request
      setTimeout(() => {
        if (this.pendingPositionRequests.has(requestId)) {
          this.pendingPositionRequests.delete(requestId);
          this.logger.debug('Position request timed out', { requestId });
        }
      }, this.config.POSITION_REQUEST_TIMEOUT);

      window.parent.postMessage(message, '*');
      this.logger.debug('Sent position calculation request to parent', message);

    } catch (error) {
      this.logger.debug('Could not send position request to parent', { error: error.message });
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.disableMouseTracking();
    this.pendingPositionRequests.clear();
    this.lastMouseEvent = null;
    this.trackedMousePosition = null;
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      mouseTrackingEnabled: this.mouseTrackingEnabled,
      hasTrackedPosition: !!this.trackedMousePosition,
      pendingRequestCount: this.pendingPositionRequests.size,
      lastMouseEvent: this.lastMouseEvent,
      trackedPosition: this.trackedMousePosition,
    };
  }
}

export default IframePositionCalculator;