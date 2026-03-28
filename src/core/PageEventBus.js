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
    
    // Store wrapped callbacks for proper removal
    this.wrappedCallbacks = new Map();
  }

  on(event, callback) {
    if (!this.bus) return; // Do nothing in non-document contexts (e.g., background script)
    
    const wrappedCallback = (e) => callback(e.detail);
    
    // Store mapping from original callback to wrapped callback
    if (!this.wrappedCallbacks.has(event)) {
      this.wrappedCallbacks.set(event, new Map());
    }
    this.wrappedCallbacks.get(event).set(callback, wrappedCallback);
    
    this.bus.addEventListener(event, wrappedCallback);
  }

  off(event, callback) {
    if (!this.bus) return;
    
    const eventCallbacks = this.wrappedCallbacks.get(event);
    if (eventCallbacks && eventCallbacks.has(callback)) {
      const wrappedCallback = eventCallbacks.get(callback);
      this.bus.removeEventListener(event, wrappedCallback);
      eventCallbacks.delete(callback);
      
      if (eventCallbacks.size === 0) {
        this.wrappedCallbacks.delete(event);
      }
    }
  }

  emit(event, detail = {}) {
    if (!this.bus) return;
    this.bus.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

// Create the instance, but favor an existing window instance for cross-bundle singleton behavior
const createEventBusInstance = () => {
  if (typeof window !== 'undefined' && window.pageEventBus) {
    return window.pageEventBus;
  }
  return new EventBus();
};

export const pageEventBus = createEventBusInstance();

// Attach to window for global access (fix for cross-context event delivery)
if (typeof window !== 'undefined') {
  const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'PageEventBus');
  
  if (!window.pageEventBus) {
    window.pageEventBus = pageEventBus;
  }
  
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
  
  // Mobile specific
  SHOW_MOBILE_SHEET: 'windows-manager-show-mobile-sheet',
  MOBILE_SELECTION_PENDING: 'windows-manager-mobile-selection-pending',
  MOBILE_SELECTION_CLEAR: 'windows-manager-mobile-selection-clear',
  
  // Element Translation Sync
  ELEMENT_TRANSLATIONS_AVAILABLE: 'element-translations-available',
  ELEMENT_TRANSLATIONS_CLEARED: 'element-translations-cleared',
  
  // Settings
  OPEN_SETTINGS: 'open-options-page',
  
  // Icon interaction
  ICON_CLICKED: 'windows-manager-icon-clicked',
  
  // Desktop selection trigger
  DESKTOP_SELECTION_PENDING: 'windows-manager-desktop-selection-pending',
  DESKTOP_SELECTION_CLEAR: 'windows-manager-desktop-selection-clear',
  DESKTOP_SELECTION_TRIGGER: 'windows-manager-desktop-selection-trigger'
};

// Helper functions for essential WindowsManager events
export const WindowsManagerEvents = {
  // Core window management
  showWindow: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, detail),
  updateWindow: (id, detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, { id, ...detail }),
  showIcon: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_ICON, detail),
  dismissWindow: (id, withAnimation = true) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id, withAnimation }),
  dismissIcon: (id) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, { id }),
  showMobileSheet: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_MOBILE_SHEET, detail),
  mobileSelectionPending: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.MOBILE_SELECTION_PENDING, detail),
  mobileSelectionClear: () => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.MOBILE_SELECTION_CLEAR),
  
  // Icon interactions
  iconClicked: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail),

  // Desktop selection trigger helpers
  desktopSelectionPending: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DESKTOP_SELECTION_PENDING, detail),
  desktopSelectionClear: () => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DESKTOP_SELECTION_CLEAR),
  desktopSelectionTrigger: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DESKTOP_SELECTION_TRIGGER, detail)
};
