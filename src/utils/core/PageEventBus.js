/**
 * PageEventBus.js
 * A simple, lightweight event bus for communication within the same page context.
 * This is used for communication between our vanilla JS content scripts and the
 * in-page Vue UI Host application.
 */
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

// WindowsManager specific event constants
export const WINDOWS_MANAGER_EVENTS = {
  // Window management events
  SHOW_WINDOW: 'windows-manager-show-window',
  SHOW_ICON: 'windows-manager-show-icon',
  DISMISS_WINDOW: 'windows-manager-dismiss-window',
  DISMISS_ICON: 'windows-manager-dismiss-icon',
  DISMISS_ALL: 'windows-manager-dismiss-all',
  
  // Icon interaction events
  ICON_CLICKED: 'windows-manager-icon-clicked',
  
  // Translation events
  TRANSLATION_RESULT: 'windows-manager-translation-result',
  TRANSLATION_ERROR: 'windows-manager-translation-error',
  TRANSLATION_LOADING: 'windows-manager-translation-loading',
  
  // Cross-frame communication
  WINDOW_CREATED: 'windows-manager-window-created',
  WINDOW_CREATION_REQUEST: 'windows-manager-window-creation-request',
  
  // State management
  UPDATE_POSITION: 'windows-manager-update-position',
  TOGGLE_RENDERER: 'windows-manager-toggle-renderer'
};

// Helper functions for WindowsManager events
export const WindowsManagerEvents = {
  // Window management
  showWindow: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, detail),
  showIcon: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.SHOW_ICON, detail),
  dismissWindow: (id, withAnimation = true) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id, withAnimation }),
  dismissIcon: (id) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, { id }),
  dismissAll: () => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_ALL),
  
  // Icon interactions
  iconClicked: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, detail),
  
  // Translation updates
  translationResult: (id, result) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.TRANSLATION_RESULT, { id, ...result }),
  translationError: (id, error) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.TRANSLATION_ERROR, { id, ...error }),
  translationLoading: (id) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.TRANSLATION_LOADING, { id }),
  
  // Cross-frame
  windowCreated: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.WINDOW_CREATED, detail),
  windowCreationRequest: (detail) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.WINDOW_CREATION_REQUEST, detail),
  
  // State updates
  updatePosition: (id, position) => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.UPDATE_POSITION, { id, position }),
  toggleRenderer: () => pageEventBus.emit(WINDOWS_MANAGER_EVENTS.TOGGLE_RENDERER)
};
