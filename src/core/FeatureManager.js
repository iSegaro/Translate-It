// src/core/FeatureManager.js
// مدیریت وضعیت ویژگی‌های قابل‌فعال/غیرفعال در افزونه

import Browser from "webextension-polyfill";

/**
 * @typedef {"TEXT_FIELDS"|"SHORTCUT_TEXT_FIELDS"|
 *           "SELECT_ELEMENT"|"TEXT_SELECTION"|"DICTIONARY"} FeatureKey
 */

/**
 * @typedef {Record<FeatureKey, boolean>} FeatureFlagMap
 */

export default class FeatureManager {
  /**
   * @param {FeatureFlagMap} initialFlags
   */
  constructor(initialFlags) {
    /** @type {FeatureFlagMap} */
    this.flags = { ...initialFlags };

    /** @type {Partial<Record<FeatureKey, Array<() => void>>>} */
    this._subscribers = {};

    /* نگاشتِ کلیدهای Storage به نام فلگ داخلی */
    this.keyMap = {
      TRANSLATE_ON_TEXT_FIELDS: "TEXT_FIELDS",
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS: "SHORTCUT_TEXT_FIELDS",
      TRANSLATE_WITH_SELECT_ELEMENT: "SELECT_ELEMENT",
      TRANSLATE_ON_TEXT_SELECTION: "TEXT_SELECTION",
      ENABLE_DICTIONARY: "DICTIONARY",
    };

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
    /** @type {FeatureKey[]} */
    Object.entries(changes).forEach(([storageKey, { newValue }]) => {
      const flag = this.keyMap[storageKey];
      if (!flag) return; // کلید بی‌ربط

      const next = newValue ?? this.flags[flag];
      if (this.flags[flag] !== next) {
        this.flags[flag] = next;
        this._subscribers[flag]?.forEach((fn) => fn());
      }
    });
  }
}
