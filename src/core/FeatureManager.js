// src/core/FeatureManager.js
import Browser from "webextension-polyfill";

// مدیریت وضعیت ویژگی‌های قابل‌فعال/غیرفعال در افزونه

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
    this.flags = { ...initialFlags };
    this._subscribers = {};
    this.keyMap = {
      TRANSLATE_ON_TEXT_FIELDS: "TEXT_FIELDS",
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS: "SHORTCUT_TEXT_FIELDS",
      TRANSLATE_WITH_SELECT_ELEMENT: "SELECT_ELEMENT",
      TRANSLATE_ON_TEXT_SELECTION: "TEXT_SELECTION",
      ENABLE_DICTIONARY: "DICTIONARY",
    };
    // ۱) لیسنر تغییرات آینده
    Browser.storage.onChanged.addListener(this._onStorageChanged.bind(this));

    // ۲) بارگذاریِ مقادیر جاری از storage
    Browser.storage.local
      .get(Object.keys(this.keyMap))
      .then((stored) => {
        Object.entries(stored).forEach(([storageKey, newValue]) => {
          const flag = this.keyMap[storageKey];
          if (!flag) return;
          // اگر کلید در storage موجود باشد، مقدار را جایگزین کن
          if (
            typeof newValue !== "undefined" &&
            this.flags[flag] !== newValue
          ) {
            this.flags[flag] = newValue;
            // نوتیفای ساب‌اسکرایبرها (مثلاً EventRouter)
            this._subscribers[flag]?.forEach((fn) => fn());
          }
        });
      })
      .catch((err) => {
        console.warn("[FeatureManager] failed to load initial flags", err);
      });
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
