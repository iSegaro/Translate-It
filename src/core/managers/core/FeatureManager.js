// src/core/FeatureManager.js

import { CONFIG } from "@/shared/config/config.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'FeatureManager');
import ResourceTracker from '@/core/memory/ResourceTracker.js';

import { storageManager } from "@/shared/storage/core/StorageCore.js";


/**
 * @typedef {"EXTENSION_ENABLED"|"TEXT_FIELDS"|"SHORTCUT_TEXT_FIELDS"|
 *           "SELECT_ELEMENT"|"TEXT_SELECTION"|"DICTIONARY"|"SCREEN_CAPTURE"} FeatureKey
 */

export default class FeatureManager extends ResourceTracker {
  /**
   * @param {Object.<FeatureKey, boolean>} initialFlags
   */
  constructor(initialFlags = {}) {
    super('feature-manager')
    this.keyMap = {
      EXTENSION_ENABLED: "EXTENSION_ENABLED",
      TRANSLATE_ON_TEXT_FIELDS: "TEXT_FIELDS",
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS: "SHORTCUT_TEXT_FIELDS",
      TRANSLATE_WITH_SELECT_ELEMENT: "SELECT_ELEMENT",
      TRANSLATE_ON_TEXT_SELECTION: "TEXT_SELECTION",
      ENABLE_DICTIONARY: "DICTIONARY",
      ENABLE_SCREEN_CAPTURE: "SCREEN_CAPTURE",
    };

    // استفاده از initialFlags ارسال شده به constructor و fallback به مقادیر CONFIG
    this.flags = {
      EXTENSION_ENABLED: initialFlags.EXTENSION_ENABLED ?? true,
      TEXT_FIELDS: initialFlags.TEXT_FIELDS ?? CONFIG.TRANSLATE_ON_TEXT_FIELDS,
      SHORTCUT_TEXT_FIELDS:
        initialFlags.SHORTCUT_TEXT_FIELDS ??
        CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS,
      SELECT_ELEMENT:
        initialFlags.SELECT_ELEMENT ?? CONFIG.TRANSLATE_WITH_SELECT_ELEMENT,
      TEXT_SELECTION:
        initialFlags.TEXT_SELECTION ?? CONFIG.TRANSLATE_ON_TEXT_SELECTION,
      DICTIONARY: initialFlags.DICTIONARY ?? CONFIG.ENABLE_DICTIONARY,
      SCREEN_CAPTURE:
        initialFlags.SCREEN_CAPTURE ?? CONFIG.ENABLE_SCREEN_CAPTURE,
    };

    this._subscribers = {};

    // بارگذاری مقادیر فعلی از StorageManager
    storageManager.get(Object.keys(this.keyMap))
      .then((stored) => {
        Object.entries(stored).forEach(([storageKey, newValue]) => {
          const flag = this.keyMap[storageKey];
          if (!flag) return;
          if (typeof newValue !== "undefined") {
            this.flags[flag] = newValue;
            this._subscribers[flag]?.forEach((fn) => fn());
          }
        });
      })
      .catch((err) => {
  logger.error('failed to load initial flags', err);
      });

    // افزودن listener برای تغییرات آینده با StorageManager
    storageManager.on('change', this._onStorageChanged.bind(this));
  }

  /** @param {FeatureKey} flag */
  isOn(flag) {
    return this.flags[flag];
  }

  /**
   * @param {FeatureKey} flag
   * @param {() => void} cb
   */
  on(flag, cb) {
    (this._subscribers[flag] ??= []).push(cb);
  }

  /** @private */
  _onStorageChanged({ key, newValue }) {
    const flag = this.keyMap[key];
    if (!flag) return;

    const next = newValue ?? this.flags[flag];
    if (this.flags[flag] !== next) {
      this.flags[flag] = next;
      this._subscribers[flag]?.forEach((fn) => fn());
    }
  }

  cleanup() {
    // Clear all subscribers
    for (const flag in this._subscribers) {
      this._subscribers[flag] = [];
    }
    
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    logger.debug('FeatureManager cleanup completed');
  }
}
