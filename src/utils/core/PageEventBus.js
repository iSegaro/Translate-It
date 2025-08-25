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
