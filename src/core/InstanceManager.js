// src/core/InstanceManager.js

import TranslationHandler from "./TranslationHandler.js";

let _handler = null;

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
 * برای استفاده در تست یا ریست کامل
 */
export function resetInstances() {
  _handler = null;
}
