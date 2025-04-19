// src/core/InstanceManager.js

import TranslationHandler from "./TranslationHandler.js";
import { setupEventListeners } from "./EventRouter.js";

let _handler = null;
let _router = null;

/**
 * @returns {TranslationHandler}
 */
export function getTranslationHandlerInstance() {
  if (!_handler) {
    _handler = new TranslationHandler();
  }
  return _handler;
}

/**
 * @returns {EventRouter}
 */
export function getEventRouterInstance() {
  if (!_router) {
    const handler = getTranslationHandlerInstance();
    _router = setupEventListeners(handler, handler.featureManager);
  }
  return _router;
}

/**
 * برای استفاده در تست یا ریست کامل
 */
export function resetInstances() {
  _handler = null;
  _router = null;
}
