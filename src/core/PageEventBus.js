/**
 * PageEventBus.js
 * A simple, lightweight event bus for communication within the same page context.
 * This is used for communication between our vanilla JS content scripts and the
 * in-page Vue UI Host application.
 */
import { getScopedLogger } from '../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../shared/logging/logConstants.js';

class EventBus {
  constructor() {
    // Only create the bus element if we are in a document context (e.g., content script)
    this.bus = (typeof document !== 'undefined')
      ? document.createElement('div')
      : null;
  }

  on(event, callback) {
    if (!this.bus) return; // Do nothing in non-document contexts (e.g., background script)
    this.bus.addEventListener(event, (e) => callback(e.detail));
  }

  off(event, callback) {
    if (!this.bus) return;
    this.bus.removeEventListener(event, callback);
  }

  emit(event, detail = {}) {
    if (!this.bus) return;
    this.bus.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

export const pageEventBus = new EventBus();

// Attach to window for global access (fix for cross-context event delivery)
if (typeof window !== 'undefined') {
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'PageEventBus');
  window.pageEventBus = pageEventBus;
  
  // For iframe contexts, also ensure event bus is available in parent context
  if (window !== window.top && window.parent) {
    try {
      // Try to share event bus with parent if possible (same origin)
      if (!window.parent.pageEventBus) {
        window.parent.pageEventBus = pageEventBus;
      }
    } catch {
      // Cross-origin iframe, can't access parent - this is normal
      logger.debug('Cannot access parent window (cross-origin), using local event bus');
    }
  }
}

// WindowsManager essential event constants
export const WINDOWS_MANAGER_EVENTS = {
  // Core window management
  SHOW_WINDOW: 'windows-manager-show-window',
  UPDATE_WINDOW: 'windows-manager-update-window',
  SHOW_ICON: 'windows-manager-show-icon',
  DISMISS_WINDOW: 'windows-manager-dismiss-window',
  DISMISS_ICON: 'windows-manager-dismiss-icon',
  
  // Icon interaction
  ICON_CLICKED: 'windows-manager-icon-clicked'
};

// Helper functions for essential WindowsManager events
export const WindowsManagerEvents = {
  // Core window management
  showWindow: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, detail),
  updateWindow: (id, detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, { id, ...detail }),
  showIcon: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_ICON, detail),
  dismissWindow: (id, withAnimation = true) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id, withAnimation }),
  dismissIcon: (id) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, { id }),
  
  // Icon interactions
  iconClicked: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail)
};
