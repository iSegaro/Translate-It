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
    const keys = Object.keys(changes);
    keys.forEach((key) => {
      const next = changes[key]?.newValue ?? this.flags[key];
      if (this.flags[key] !== next) {
        this.flags[key] = next;
        this._subscribers[key]?.forEach((fn) => fn());
      }
    });
  }
}
