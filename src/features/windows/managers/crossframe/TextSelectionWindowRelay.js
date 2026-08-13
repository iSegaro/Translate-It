// src/features/windows/managers/crossframe/TextSelectionWindowRelay.js
// Single-owner relay for cross-frame TEXT_SELECTION_WINDOW_REQUEST routing.
//
// Ownership: WindowsManager and every bootstrap installs the relay at most once
// per frame, so each frame's postMessage listener receives every request exactly
// once. Leaf frames forward upward (accumulating child iframe offsets); the top
// frame hands the request to the registered sink, which owns window creation.
//
// Sink readiness: the top frame's windows feature is lazy-loaded, so a request
// can arrive before any sink is registered. The relay buffers a single request
// (the latest selection supersedes earlier ones) and asks the bootstrap-registered
// activation callback to ensure the windows feature loads; setSink() then flushes
// the buffered request so a pre-activation request is never silently lost.

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsConfig } from '../core/WindowsConfig.js';
import { adjustForDirectChild } from './coordinateUtils.js';

const logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'TextSelectionWindowRelay');

let relayInstance = null;

export class TextSelectionWindowRelay {
  constructor() {
    this._isTopFrame = window === window.top;
    this._sink = null;
    this._pendingRequest = null;
    this._ensureActive = null;
    this._boundHandleMessage = this._handleMessage.bind(this);
    window.addEventListener('message', this._boundHandleMessage);
    logger.debug('TextSelectionWindowRelay installed', { isTopFrame: this._isTopFrame });
  }

  static getInstance() {
    if (!relayInstance) relayInstance = new TextSelectionWindowRelay();
    return relayInstance;
  }

  /**
   * Registers the callback that ensures the windows feature is loaded when a
   * request arrives before a sink is ready (top frame only). Registered once by
   * the bootstrap; never adds a message listener.
   */
  setEnsureActive(callback) {
    this._ensureActive = callback;
  }

  /**
   * Registers the sink that owns window creation. Delivers a single buffered
   * request (if any) that arrived before this sink was ready.
   */
  setSink(sink) {
    this._sink = sink;
    if (sink && this._pendingRequest) {
      const pending = this._pendingRequest;
      this._pendingRequest = null;
      this._deliver(pending.data, pending.source);
    }
  }

  /**
   * Ownership-aware sink removal: only clears when the supplied sink is still
   * the registered one, so a stale cleanup never unregisters a replacement sink.
   */
  clearSink(sink) {
    if (this._sink === sink) {
      this._sink = null;
      this._pendingRequest = null;
    }
  }

  _deliver(data, source) {
    try {
      this._sink(data, source);
    } catch (error) {
      logger.warn('Text selection window sink delivery failed:', error.message);
    }
  }

  _handleMessage(event) {
    const data = event.data;

    if (!data || typeof data !== 'object' || data.type !== WindowsConfig.CROSS_FRAME.TEXT_SELECTION_WINDOW_REQUEST) {
      return;
    }

    if (!data.selectedText || !data.position) {
      logger.warn('Invalid text selection window request', data);
      return;
    }

    if (this._isTopFrame) {
      if (this._sink) {
        this._deliver(data, event.source);
      } else {
        // Single-slot buffer: latest selection wins while the windows feature
        // activates. Cleared on delivery, destroy, or owner cleanup.
        this._pendingRequest = { data, source: event.source };
        if (this._ensureActive) {
          this._ensureActive();
        }
      }
      return;
    }

    const adjustedPosition = adjustForDirectChild(event.source, data.position);
    if (!adjustedPosition) {
      logger.debug('Dropping text selection window request: unmatched child iframe source');
      return;
    }

    const forwarded = { ...data, position: adjustedPosition };
    window.parent.postMessage(forwarded, '*');
    logger.debug('Forwarded text selection window request to parent frame');
  }

  destroy() {
    window.removeEventListener('message', this._boundHandleMessage);
    this._sink = null;
    this._pendingRequest = null;
    this._ensureActive = null;
    relayInstance = null;
  }
}

export function getTextSelectionWindowRelay() {
  return TextSelectionWindowRelay.getInstance();
}
