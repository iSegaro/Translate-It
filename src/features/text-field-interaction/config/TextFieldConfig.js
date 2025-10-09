/**
 * Text Field Interaction Configuration
 * Centralized configuration for text field double-click handling and iframe position calculation
 */

/**
 * Position calculation constants for text fields and iframes
 */
export const POSITION_CONFIG = {
  // Icon positioning
  ICON_SIZE: 32,
  ICON_OFFSET_Y: 10, // Offset below cursor for double-click
  ICON_OFFSET_IFRAME: 25, // Additional offset for iframe positioning

  // Iframe position estimation (cross-origin fallbacks)
  IFRAME_DEFAULT_OFFSET_X: 200, // Conservative estimate for iframe X position
  IFRAME_DEFAULT_OFFSET_Y: 250, // Conservative estimate for iframe Y position
  IFRAME_MIN_OFFSET_X: 100,     // Minimum offset for element-based estimation
  IFRAME_MIN_OFFSET_Y: 150,     // Minimum offset for element-based estimation

  // Coordinate thresholds for detecting iframe vs main document coordinates
  COORDINATE_THRESHOLDS: {
    SMALL_COORD_X: 100,  // Coordinates below this are likely iframe-relative
    SMALL_COORD_Y: 200,  // Coordinates below this are likely iframe-relative
    LARGE_COORD_X: 500,  // Coordinates above this might be main document relative
    LARGE_COORD_Y: 500,  // Coordinates above this might be main document relative
    VIEWPORT_RATIO_X: 0.2, // If X > 20% of viewport width, might be main document
    VIEWPORT_RATIO_Y: 0.2, // If Y > 20% of viewport height, might be main document
  },

  // Screen bounds validation (with margin)
  SCREEN_MARGIN: 1000,

  // Timing and timeouts
  POSITION_REQUEST_TIMEOUT: 1000, // 1 second timeout for position requests
  MOUSE_TRACKING_MAX_AGE: 1000,   // 1 second for tracked mouse position validity
  DOUBLE_CLICK_DELAY: 150,        // Delay for text selection to occur

  // Mouse tracking settings
  MOUSE_TRACKING_ENABLED: true,
  MOUSE_TRACKING_CAPTURE: true,

  // Double click detection
  DOUBLE_CLICK_WINDOW: 500, // 500ms window for double-click detection
};

/**
 * Iframe detection and communication constants
 */
export const IFRAME_CONFIG = {
  // Message types for postMessage communication
  MESSAGE_TYPES: {
    SHOW_TRANSLATION_ICON: 'showTranslationIcon',
    CALCULATE_IFRAME_POSITION: 'calculateIframePosition',
    IFRAME_POSITION_CALCULATED: 'iframePositionCalculated',
    TEXT_SELECTION_WINDOW_REQUEST: 'TEXT_SELECTION_WINDOW_REQUEST',
  },

  // Frame detection methods
  FRAME_DETECTION: {
    REGISTRY_CHECK: 'registry',    // Check translateItFrameRegistry first
    CONTENT_WINDOW_CHECK: 'contentWindow', // Try to access contentWindow.frameId
    DATASET_CHECK: 'dataset',      // Check element.dataset.frameId
  },

  // Frame ID generation
  FRAME_ID_PREFIX: 'frame',
  FRAME_ID_RANDOM_LENGTH: 6,
};

/**
 * Validation and safety constants
 */
export const VALIDATION_CONFIG = {
  // Element search limits
  MAX_PARENT_DEPTH: 5,      // Prevent infinite loops when searching parents
  MAX_IFRAME_SEARCH_ATTEMPTS: 10, // Limit iframe search iterations

  // Text validation
  MIN_TEXT_LENGTH: 1,       // Minimum text length for translation
  MAX_TEXT_PREVIEW_LENGTH: 30, // Characters to show in logs

  // Position validation
  MIN_POSITION_VALUE: 0,    // Minimum valid coordinate value
  MAX_SAFE_POSITION_RATIO: 2, // Maximum position relative to screen size + margin
};

/**
 * Feature flags for enabling/disabling functionality
 */
export const FEATURE_CONFIG = {
  // Debugging and logging
  DEBUG_POSITION_CALCULATION: true,
  DEBUG_MOUSE_TRACKING: true,
  DEBUG_IFRAME_COMMUNICATION: true,

  // Performance optimizations
  ENABLE_MOUSE_TRACKING: true,
  ENABLE_VISUAL_VIEWPORT_API: true,
  ENABLE_ENHANCED_ESTIMATION: true,
  ENABLE_CONSERVATIVE_FALLBACK: true,

  // Communication features
  ENABLE_CROSS_ORIGIN_SUPPORT: true,
  ENABLE_ASYNC_POSITION_REQUESTS: true,
};

/**
 * Default settings and fallbacks
 */
export const DEFAULT_CONFIG = {
  // Default position when all calculations fail
  FALLBACK_POSITION: {
    x: 200,
    y: 300,
    isFromMouseEvent: true,
    isFallback: true,
  },

  // Default mouse tracking state
  DEFAULT_MOUSE_STATE: {
    x: 0,
    y: 0,
    timestamp: 0,
  },

  // Default request timeout
  DEFAULT_TIMEOUT: 1000,
};

/**
 * Utility functions for configuration
 */
export const ConfigUtils = {
  /**
   * Check if coordinates are likely iframe-relative based on thresholds
   */
  isLikelyIframeCoordinate(x, y, viewportWidth, viewportHeight) {
    const { COORDINATE_THRESHOLDS } = POSITION_CONFIG;

    // Small coordinates are almost always iframe-relative
    if (x < COORDINATE_THRESHOLDS.SMALL_COORD_X && y < COORDINATE_THRESHOLDS.SMALL_COORD_Y) {
      return true;
    }

    // Large coordinates might be main document relative
    if (x > COORDINATE_THRESHOLDS.LARGE_COORD_X || y > COORDINATE_THRESHOLDS.LARGE_COORD_Y) {
      return false;
    }

    // Check viewport ratio
    if (x > viewportWidth * COORDINATE_THRESHOLDS.VIEWPORT_RATIO_X ||
        y > viewportHeight * COORDINATE_THRESHOLDS.VIEWPORT_RATIO_Y) {
      return false;
    }

    // Default to iframe-relative for small coordinates
    return true;
  },

  /**
   * Generate a unique frame ID
   */
  generateFrameId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 2 + IFRAME_CONFIG.FRAME_ID_RANDOM_LENGTH);
    return `${IFRAME_CONFIG.FRAME_ID_PREFIX}_${timestamp}_${random}`;
  },

  /**
   * Check if a position value is within screen bounds
   */
  isValidPosition(position, screenWidth, screenHeight) {
    if (!position) return false;

    const { SCREEN_MARGIN } = POSITION_CONFIG;
    const maxX = screenWidth + SCREEN_MARGIN;
    const maxY = screenHeight + SCREEN_MARGIN;

    return (
      position.x >= VALIDATION_CONFIG.MIN_POSITION_VALUE &&
      position.y >= VALIDATION_CONFIG.MIN_POSITION_VALUE &&
      position.x < maxX &&
      position.y < maxY
    );
  },

  /**
   * Create a timeout promise for position requests
   */
  createTimeoutPromise(timeoutMs = POSITION_CONFIG.POSITION_REQUEST_TIMEOUT) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Position request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  },
};

export default {
  POSITION_CONFIG,
  IFRAME_CONFIG,
  VALIDATION_CONFIG,
  FEATURE_CONFIG,
  DEFAULT_CONFIG,
  ConfigUtils,
};