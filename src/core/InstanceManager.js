// src/core/InstanceManager.js

import TranslationHandler from "./TranslationHandler.js";

let _handler = null;

/**
 * @returns {TranslationHandler}
 */
export function getTranslationHandlerInstance() {
  if (!_handler) {
    _handler = TranslationHandler.getInstance();
  }
  return _handler;
}


/**
 * برای استفاده در تست یا ریست کامل
 */
export function resetInstances() {
  _handler = null;
  TranslationHandler.resetInstance();
}
