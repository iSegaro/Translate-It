// src/managers/NotificationManager.js

import { getScopedLogger } from "../../utils/core/logger.js";
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { parseBoolean, getTranslationString } from "../../utils/i18n/i18n.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import ExtensionContextManager from "../../utils/core/extensionContext.js";

const SAFE_ICONS = {
  ICON_TRANSLATION: "🌐",
  ICON_SUCCESS: "✅",
  ICON_WARNING: "⚠️",
  ICON_STATUS: "⏳",
  ICON_ERROR: "❌",
  ICON_INFO: "🔵",
  ICON_REVERT: "↩️",
};

// Configuration constants
const CONFIG = {
  CONTAINER_ID: "AIWritingCompanion-notifications",
  Z_INDEX: "2147483646",
  POSITION: {
    TOP: "20px",
    RIGHT: "20px",
    GAP: "10px"
  },
  ANIMATION: {
    DURATION: "0.3s",
    FADE_DELAY: 10,
    DISMISS_DELAY: 500
  },
  NOTIFICATION: {
    MAX_WIDTH: "300px",
    BORDER_RADIUS: "6px",
    PADDING: "10px 15px",
    FONT_SIZE: "14px"
  },
  QUEUE: {
    MAX_VISIBLE: 5,
    MAX_QUEUE_SIZE: 20,
    PRIORITY_ORDER: ['error', 'warning', 'success', 'status', 'info', 'revert']
  }
};

// Valid notification types
const VALID_TYPES = ['error', 'warning', 'success', 'info', 'status', 'revert'];

// Validation rules
const VALIDATION_RULES = {
  MESSAGE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 500,
    FORBIDDEN_PATTERNS: [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi, // onclick, onload, etc.
    ],
    DANGEROUS_CHARS: ['<', '>', '"', "'", '&']
  },
  RATE_LIMIT: {
    MAX_PER_SECOND: 5,
    MAX_PER_MINUTE: 30,
    WINDOW_SIZE: 1000 // ms
  }
};

let _instance = null; // Singleton instance

export default class NotificationManager {
  constructor(errorHandler) {
    if (_instance) {
      return _instance;
    }

    this.errorHandler = errorHandler || { handle: () => {} };
  this.logger = getScopedLogger(LOG_COMPONENTS.UI, 'NotificationManager');
    this.map = {
      error: {
        title: "Translate It! - Error",
        icon: SAFE_ICONS.ICON_ERROR,
        cls: "AIWC-error",
        dur: 5000,
      },
      warning: {
        title: "Translate It! - Warning",
        icon: SAFE_ICONS.ICON_WARNING,
        cls: "AIWC-warning",
        dur: 4000,
      },
      success: {
        title: "Translate It! - Success",
        icon: SAFE_ICONS.ICON_SUCCESS,
        cls: "AIWC-success",
        dur: 3000,
      },
      info: {
        title: "Translate It! - Info",
        icon: SAFE_ICONS.ICON_INFO,
        cls: "AIWC-info",
        dur: 3000,
      },
      status: {
        title: "Translate It! - Status",
        icon: SAFE_ICONS.ICON_STATUS,
        cls: "AIWC-status",
        dur: 2000,
      },
      revert: {
        title: "Translate It! - Revert",
        icon: SAFE_ICONS.ICON_REVERT,
        cls: "AIWC-revert",
        dur: 800,
      },
    };

    this.container = null;
    this.canShowInPage = false;
    this.activeNotifications = new Set(); // Track all active notification nodes
    this.pendingTimeouts = new Map(); // Track timeouts for cleanup
    this.notificationQueue = []; // Queue for pending notifications
    this.rateLimitTracker = []; // Track notification timestamps for rate limiting

    _instance = this; // Set singleton instance
    this.initialize(); // Initialize on construction
  }

  static getInstance(errorHandler) {
    if (!_instance) {
      _instance = new NotificationManager(errorHandler);
    }
    return _instance;
  }

  initialize() {
    this._setupLocaleListener();
  }

  /**
   * Create notification container with proper styling
   */
  _createContainer() {
    const el = document.createElement("div");
    el.id = CONFIG.CONTAINER_ID;
    
    Object.assign(el.style, {
      position: "fixed",
      top: CONFIG.POSITION.TOP,
      right: CONFIG.POSITION.RIGHT,
      left: "auto",
      zIndex: CONFIG.Z_INDEX,
      display: "flex",
      flexDirection: "column",
      gap: CONFIG.POSITION.GAP,
      pointerEvents: "none",
      direction: "ltr",
      textAlign: "left",
    });
    
    return el;
  }

  /**
   * Create notification element with proper styling
   */
  _createNotificationElement(cfg, onClick) {
    const n = document.createElement("div");
    n.className = `AIWC-notification ${cfg.cls}`;
    
    const baseStyles = {
      background: "#fff",
      color: "#333",
      padding: CONFIG.NOTIFICATION.PADDING,
      borderRadius: CONFIG.NOTIFICATION.BORDER_RADIUS,
      fontSize: CONFIG.NOTIFICATION.FONT_SIZE,
      border: "1px solid #ddd",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      display: "flex",
      alignItems: "center",
      cursor: onClick ? "pointer" : "default",
      opacity: "0",
      transform: "translateY(10px)",
      transition: `opacity ${CONFIG.ANIMATION.DURATION} ease, transform ${CONFIG.ANIMATION.DURATION} ease`,
      pointerEvents: "auto",
      maxWidth: CONFIG.NOTIFICATION.MAX_WIDTH,
      wordWrap: "break-word"
    };
    
    Object.assign(n.style, baseStyles);
    return n;
  }

  /**
   * Ensures the notification container exists in the DOM.
   * This method implements a lazy-initialization pattern. It creates and appends
   * the container only when it's first needed, preventing conflicts during page load.
   */
  _ensureContainerExists() {
    // If the container is already created and attached, do nothing.
    if (this.container && document.body.contains(this.container)) {
      this.canShowInPage = true;
      return;
    }

    // Check for DOM readiness. Essential guard for asynchronous execution.
    if (
      typeof document === "undefined" ||
      !document.body ||
      typeof document.createElement !== "function"
    ) {
      this.logger.warn('DOM not ready for in-page notifications');
      this.canShowInPage = false;
      return;
    }

    try {
      let el = document.getElementById(CONFIG.CONTAINER_ID);
      if (el) {
        this.container = el;
        this.canShowInPage = true;
        this._applyAlignment(); // Ensure alignment is correct if re-attaching
        this.logger.debug('Re-attached to existing notification container');
        return;
      }

      el = this._createContainer();

      // [REFACTOR] The critical DOM manipulation now happens here, just-in-time.
      document.body.appendChild(el);

      this.container = el;
      this.canShowInPage = true; // Set capability flag upon success
      this._applyAlignment(); // Apply alignment styles immediately after creation
      this.logger.info('Notification container created and appended successfully');
    } catch (error) {
      this.logger.error('Environment not compatible for in-page notifications', error.message);
      this.canShowInPage = false;
      if (this.container) {
        try {
          this.container.remove();
        } catch {
          /* ignore */
        }
        this.container = null;
      }
    }
  }

  async _setupLocaleListener() {
    try {
      if (storageManager && typeof storageManager.on === 'function') {
        storageManager.on('change:APPLICATION_LOCALIZE', () => {
          // Only apply alignment if the container has already been created  
          if (this.container) {
            this._applyAlignment();
          }
        });
      }
    } catch (error) {
      this.logger.warn('Could not register locale listener (storage not available yet)', error);
    }
  }

  async _applyAlignment() {
    if (!this.container) return;

    // Use ExtensionContextManager for safe i18n operation
    const rtlMsg = await ExtensionContextManager.safeI18nOperation(
      () => getTranslationString("IsRTL"),
      'notification-alignment',
      "false" // Default to LTR
    );
    
    const isRTL = parseBoolean(rtlMsg);

    // Apply proper RTL/LTR positioning and styling
    this.container.style.right = isRTL ? "auto" : CONFIG.POSITION.RIGHT;
    this.container.style.left = isRTL ? CONFIG.POSITION.RIGHT : "auto";
    this.container.style.direction = isRTL ? "rtl" : "ltr";
    this.container.style.textAlign = isRTL ? "right" : "left";
    
    this.logger.debug('Applied alignment', { isRTL });
  }

  /**
   * Validate notification type
   */
  _validateType(type) {
    if (!VALID_TYPES.includes(type)) {
      this.logger.warn(`Invalid notification type: ${type}, falling back to 'info'`);
      return 'info';
    }
    return type;
  }

  /**
   * Enhanced message validation with security checks
   */
  _validateMessage(msg) {
    // Basic checks
    if (!msg || typeof msg !== 'string') {
      return { 
        valid: false, 
        error: 'Message must be a non-empty string',
        sanitized: ''
      };
    }

    const trimmed = msg.trim();
    
    // Length validation
    if (trimmed.length < VALIDATION_RULES.MESSAGE.MIN_LENGTH) {
      return { 
        valid: false, 
        error: 'Message too short',
        sanitized: trimmed
      };
    }

    if (trimmed.length > VALIDATION_RULES.MESSAGE.MAX_LENGTH) {
      return { 
        valid: false, 
        error: `Message too long (max ${VALIDATION_RULES.MESSAGE.MAX_LENGTH} characters)`,
        sanitized: trimmed.substring(0, VALIDATION_RULES.MESSAGE.MAX_LENGTH)
      };
    }

    // Security validation - check for dangerous patterns
    for (const pattern of VALIDATION_RULES.MESSAGE.FORBIDDEN_PATTERNS) {
      if (pattern.test(trimmed)) {
        this.logger.warn('Potentially malicious content detected in notification message');
        return { 
          valid: false, 
          error: 'Invalid content detected',
          sanitized: trimmed.replace(pattern, '[REMOVED]')
        };
      }
    }

    // Sanitize dangerous characters
    let sanitized = trimmed;
    for (const char of VALIDATION_RULES.MESSAGE.DANGEROUS_CHARS) {
      const entityMap = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), entityMap[char] || char);
    }

    return { 
      valid: true, 
      error: null,
      sanitized 
    };
  }

  /**
   * Check rate limiting
   */
  _checkRateLimit() {
    const now = Date.now();
    
    // Clean old entries (older than 1 minute)
    this.rateLimitTracker = this.rateLimitTracker.filter(
      timestamp => now - timestamp < 60000
    );

    // Check per-second rate limit
    const recentEntries = this.rateLimitTracker.filter(
      timestamp => now - timestamp < VALIDATION_RULES.RATE_LIMIT.WINDOW_SIZE
    );

    if (recentEntries.length >= VALIDATION_RULES.RATE_LIMIT.MAX_PER_SECOND) {
      this.logger.warn('Rate limit exceeded (per second)', { 
        current: recentEntries.length,
        limit: VALIDATION_RULES.RATE_LIMIT.MAX_PER_SECOND
      });
      return { allowed: false, reason: 'Rate limit exceeded (too fast)' };
    }

    // Check per-minute rate limit
    if (this.rateLimitTracker.length >= VALIDATION_RULES.RATE_LIMIT.MAX_PER_MINUTE) {
      this.logger.warn('Rate limit exceeded (per minute)', { 
        current: this.rateLimitTracker.length,
        limit: VALIDATION_RULES.RATE_LIMIT.MAX_PER_MINUTE
      });
      return { allowed: false, reason: 'Rate limit exceeded (too many notifications)' };
    }

    // Record this request
    this.rateLimitTracker.push(now);
    return { allowed: true };
  }

  /**
   * Get visible notification count
   */
  _getVisibleCount() {
    return this.activeNotifications.size;
  }

  /**
   * Get priority weight for notification type
   */
  _getPriority(type) {
    const index = CONFIG.QUEUE.PRIORITY_ORDER.indexOf(type);
    return index === -1 ? CONFIG.QUEUE.PRIORITY_ORDER.length : index;
  }

  /**
   * Add notification to queue with priority sorting
   */
  _enqueueNotification(notificationData) {
    // Prevent queue overflow
    if (this.notificationQueue.length >= CONFIG.QUEUE.MAX_QUEUE_SIZE) {
      this.logger.warn('Notification queue full, dropping oldest notification');
      this.notificationQueue.shift(); // Remove oldest
    }

    // Insert with priority sorting (lower index = higher priority)
    const newPriority = this._getPriority(notificationData.type);
    let insertIndex = this.notificationQueue.length;
    
    for (let i = 0; i < this.notificationQueue.length; i++) {
      if (this._getPriority(this.notificationQueue[i].type) > newPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.notificationQueue.splice(insertIndex, 0, notificationData);
    this.logger.debug('Notification queued', { 
      type: notificationData.type, 
      queueSize: this.notificationQueue.length,
      priority: newPriority 
    });
  }

  /**
   * Process next notification from queue
   */
  _processQueue() {
    if (this.notificationQueue.length === 0) return;
    if (this._getVisibleCount() >= CONFIG.QUEUE.MAX_VISIBLE) return;

    const nextNotification = this.notificationQueue.shift();
    this.logger.debug('Processing queued notification', { 
      type: nextNotification.type,
      remainingQueue: this.notificationQueue.length 
    });
    
    // Process the notification immediately
    this._showImmediate(
      nextNotification.msg,
      nextNotification.type,
      nextNotification.auto,
      nextNotification.dur,
      nextNotification.onClick
    );
  }

  /**
   * Show notification with proper validation and error handling
   */
  async show(msg, type = "info", auto = true, dur = null, onClick) {
    // Enhanced message validation
    const messageValidation = this._validateMessage(msg);
    if (!messageValidation.valid) {
      this.logger.warn('Message validation failed:', messageValidation.error);
      return null;
    }

    // Check rate limiting
    const rateLimitCheck = this._checkRateLimit();
    if (!rateLimitCheck.allowed) {
      this.logger.warn('Notification blocked by rate limiting:', rateLimitCheck.reason);
      return null;
    }

    // Validate and sanitize type
    const validType = this._validateType(type);
    
    // Use sanitized message
    const sanitizedMessage = messageValidation.sanitized;
    
    // Check if we can show immediately or need to queue
    if (this._getVisibleCount() >= CONFIG.QUEUE.MAX_VISIBLE) {
      // Add to queue
      this._enqueueNotification({
        msg: sanitizedMessage,
        type: validType,
        auto,
        dur,
        onClick
      });
      return null; // Queued notification doesn't return a node immediately
    }

    // Show immediately
    return this._showImmediate(sanitizedMessage, validType, auto, dur, onClick);
  }

  /**
   * Show notification immediately without queue check
   */
  async _showImmediate(msg, type, auto = true, dur = null, onClick) {
    // Step 1: Ensure the container is ready for in-page notifications.
    this._ensureContainerExists();

    const cfg = this.map[type];
    const finalDur = dur ?? cfg.dur;
    
    // Debug logging for status type notifications
    if (type === "status") {
      this.logger.debug('Showing status notification:', { 
        message: msg, 
        messageType: typeof msg, 
        messageLength: msg?.length,
        isEmpty: !msg || msg.trim() === '',
        cfg 
      });
    }

    // Step 2: Attempt to show the notification in-page if possible.
    if (this.canShowInPage) {
      try {
        return this._toastInPage(msg, cfg, auto, finalDur, onClick);
      } catch (err) {
        this.logger.warn('In-page notification failed, using fallback', err);
      }
    }

    // Step 3: Fallback to a background script notification if in-page is not available or failed.
    this.logger.debug('In-page notification not available, using background fallback', { message: msg });
    if (ExtensionContextManager.isValidSync()) {
      ExtensionContextManager.safeSendMessage({
        action: "show_os_notification",
        payload: { message: msg, title: cfg.title, type: type },
      }, 'notification-fallback');
    }

    return null; // No DOM node to return when using the fallback.
  }

  dismiss(node) {
    this.logger.debug('Attempting to dismiss notification node', {
      hasNode: !!node,
      hasRemoveFunction: typeof node?.remove === "function",
      hasParentNode: !!node?.parentNode,
      nodeType: node?.constructor?.name,
      nodeId: node?.id,
      nodeClass: node?.className
    });
    
    if (!node || typeof node.remove !== "function" || !node.parentNode) {
      this.logger.warn('Cannot dismiss notification - node invalid or not in DOM');
      return;
    }

    // Clear any pending timeout for this node
    this._clearNodeTimeout(node);

    try {
      this.logger.debug('Setting notification opacity to 0');
      node.style.opacity = "0";
      
      const timeoutId = setTimeout(() => {
        try {
          if (node.parentNode) {
            this.logger.debug('Removing notification node from DOM');
            node.remove();
            this.logger.debug('Notification node successfully removed');
          } else {
            this.logger.debug('Notification node no longer has parentNode');
          }
          // Remove from tracking
          this._cleanupNode(node);
        } catch (removeError) {
          this.logger.error('Error removing notification node', removeError);
        }
      }, CONFIG.ANIMATION.DISMISS_DELAY);
      
      // Track this timeout for cleanup
      this.pendingTimeouts.set(node, timeoutId);
    } catch (error) {
      this.logger.error('Error dismissing notification', error);
    }
  }

  /**
   * Clear timeout for a specific node
   */
  _clearNodeTimeout(node) {
    const timeoutId = this.pendingTimeouts.get(node);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingTimeouts.delete(node);
    }
  }

  /**
   * Clean up node from all tracking structures
   */
  _cleanupNode(node) {
    this.activeNotifications.delete(node);
    this._clearNodeTimeout(node);
    
    // Process next item from queue when space becomes available
    setTimeout(() => this._processQueue(), 50);
  }

  /**
   * Dismiss all active notifications
   */
  dismissAll() {
    this.logger.debug('Dismissing all active notifications', { 
      count: this.activeNotifications.size 
    });
    
    // Create a copy of the set to avoid modification during iteration
    const notifications = Array.from(this.activeNotifications);
    notifications.forEach(node => {
      this.dismiss(node);
    });
  }

  _toastInPage(message, cfg, auto, dur, onClick) {
    // This internal method remains largely the same, but it's now called more safely.
    if (!this.container) return null; // Extra safety guard

    const n = this._createNotificationElement(cfg, onClick);

    // ✅ DOM-safe API instead replace:
    const iconSpan = document.createElement("span");
    iconSpan.textContent = cfg.icon;
    iconSpan.style.marginRight =
      this.container.style.direction === "rtl" ? "0" : "8px";
    iconSpan.style.marginLeft =
      this.container.style.direction === "rtl" ? "8px" : "0";

    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    
    // Debug for status notifications
    if (cfg.cls === "AIWC-status") {
      this.logger.debug('Creating status toast elements:', {
        message,
        messageLength: message?.length,
        iconText: cfg.icon,
        msgSpanText: msgSpan.textContent,
        msgSpanTextLength: msgSpan.textContent?.length
      });
    }

    n.appendChild(iconSpan);
    n.appendChild(msgSpan);

    if (onClick) {
      n.addEventListener(
        "click",
        () => {
          try {
            onClick();
          } catch (e) {
            this.logger.error('Error in notification onClick handler', e);
          }
          this.dismiss(n);
        },
        { once: true },
      );
    }

    this.container.appendChild(n);
    
    // Add to active notifications set
    this.activeNotifications.add(n);

    // Trigger entrance animation
    this._animateIn(n);

    // Set auto-dismiss for non-status notifications
    if (auto && cfg.cls !== "AIWC-status") {
      this._scheduleAutoDismiss(n, dur);
    }

    return n;
  }

  /**
   * Animate notification entrance
   */
  _animateIn(node) {
    // Use requestAnimationFrame for smoother animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.opacity = "1";
        node.style.transform = "translateY(0)";
      });
    });
  }

  /**
   * Schedule auto-dismiss for a notification
   */
  _scheduleAutoDismiss(node, duration) {
    const timeoutId = setTimeout(() => {
      this.dismiss(node);
    }, duration);
    
    // Track this timeout
    this.pendingTimeouts.set(node, timeoutId);
  }

  reset() {
    this.canShowInPage = false;
    
    // Clear all pending timeouts to prevent memory leaks
    this.pendingTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.pendingTimeouts.clear();
    
    // Clear all active notifications and queue
    this.activeNotifications.clear();
    this.notificationQueue.length = 0; // Clear queue
    
    if (this.container) {
      try {
        this.container.remove();
      } catch {
        /* ignore */
      }
      this.container = null;
    }
  }

  async isReady() {
    // The meaning of 'ready' is now simpler: can it potentially show a notification?
    const containerExists = !!(
      this.container && document.body.contains(this.container)
    );
    return {
      canShowInPage: this.canShowInPage || containerExists,
      containerAvailable: containerExists,
    };
  }
}