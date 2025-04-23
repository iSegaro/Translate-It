// src/core/FeatureManager.js
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { logME } from "../utils/helpers.js";

/**
 * @typedef {"EXTENSION_ENABLED"|"TEXT_FIELDS"|"SHORTCUT_TEXT_FIELDS"|
 *           "SELECT_ELEMENT"|"TEXT_SELECTION"|"DICTIONARY"} FeatureKey
 */

export default class FeatureManager {
  /**
   * @param {Object.<FeatureKey, boolean>} initialFlags
   */
  constructor(initialFlags = {}) {
    this.keyMap = {
      EXTENSION_ENABLED: "EXTENSION_ENABLED",
      TRANSLATE_ON_TEXT_FIELDS: "TEXT_FIELDS",
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS: "SHORTCUT_TEXT_FIELDS",
      TRANSLATE_WITH_SELECT_ELEMENT: "SELECT_ELEMENT",
      TRANSLATE_ON_TEXT_SELECTION: "TEXT_SELECTION",
      ENABLE_DICTIONARY: "DICTIONARY",
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
    };

    this._subscribers = {};

    // بارگذاری مقادیر فعلی از storage
    Browser.storage.local
      .get(Object.keys(this.keyMap))
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
        logME("[FeatureManager] failed to load initial flags", err);
      });

    // افزودن listener برای تغییرات آینده
    Browser.storage.onChanged.addListener(this._onStorageChanged.bind(this));
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
  _onStorageChanged(changes) {
    Object.entries(changes).forEach(([storageKey, { newValue }]) => {
      const flag = this.keyMap[storageKey];
      if (!flag) return;

      const next = newValue ?? this.flags[flag];
      if (this.flags[flag] !== next) {
        this.flags[flag] = next;
        this._subscribers[flag]?.forEach((fn) => fn());
      }
    });
  }
}
