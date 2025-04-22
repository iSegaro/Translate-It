// src/core/EventRouter.js
import { CONFIG, state } from "../config.js";
import { handleUIError } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

export default class EventRouter {
  constructor(translationHandler, featureManager) {
    this.translationHandler = translationHandler;
    this.errorHandler = translationHandler.errorHandler;

    /* ---------- ۱) ساخت هندلرهای بسته‑بندی شده ---------- */

    // Wrap برای جلوگیری از تکرار try/catch
    const wrap =
      (method) =>
      (...args) => {
        try {
          return method.apply(this, args);
        } catch (err) {
          handleUIError(err, {
            type: ErrorTypes.UI,
            context: "event-router",
            eventType: args[0]?.type,
          });
        }
      };

    this.handleFocus = wrap(this.handleFocusMethod);
    this.handleBlur = wrap(this.handleBlurMethod);
    this.handleClick = wrap(this.handleClickMethod);
    this.handleKeyDown = wrap(this.handleKeyDownMethod);
    this.handleMouseOver = wrap(this.handleMouseOverMethod);
    this.handleMouseUp = wrap(this.handleMouseUpMethod);

    /* ---------- ۲) FeatureManager ---------- */

    this.featureManager = featureManager;

    // نگهداری وضعیت listenerهای attach شده
    this._attached = new Set();
    /* ---------- ۳) جدولِ رویدادها ---------- */
    this.featureEventMap = {
      TEXT_FIELDS: [
        {
          target: document,
          type: "focus",
          listener: this.handleFocus,
          options: true,
        },
        {
          target: document,
          type: "blur",
          listener: this.handleBlur,
          options: true,
        },
      ],
      SHORTCUT_TEXT_FIELDS: [
        { target: document, type: "keydown", listener: this.handleKeyDown },
      ],
      SELECT_ELEMENT: [
        { target: document, type: "mouseover", listener: this.handleMouseOver },
        { target: document, type: "click", listener: this.handleClick },
      ],
      TEXT_SELECTION: [
        { target: document, type: "mouseup", listener: this.handleMouseUp },
      ],
    };

    /* ---------- ۴) اتصال اولیه و ساب‌اسکرایب ---------- */

    // بررسی اولیه
    this.initEventListeners();

    // بررسی تغییرات EXTENSION_ENABLED
    this.featureManager.on("EXTENSION_ENABLED", () =>
      this.initEventListeners()
    );

    // بررسی تغییرات بقیه ویژگی‌ها
    Object.keys(this.featureEventMap).forEach((flag) => {
      this.featureManager.on(flag, () => this.updateListeners(flag));
    });
  }

  // اضافه یا حذف listenerها بر اساس EXTENSION_ENABLED
  initEventListeners() {
    const extensionEnabled = this.featureManager.isOn("EXTENSION_ENABLED");

    Object.keys(this.featureEventMap).forEach((flag) => {
      if (extensionEnabled) {
        this.updateListeners(flag);
      } else {
        this.removeListeners(flag);
      }
    });
  }

  updateListeners(flag) {
    const enabled =
      this.featureManager.isOn(flag) &&
      this.featureManager.isOn("EXTENSION_ENABLED");
    this.featureEventMap[flag].forEach(
      ({ target, type, listener, options }) => {
        const key = `${type}_${flag}`;
        if (enabled && !this._attached.has(key)) {
          target.addEventListener(type, listener, options);
          this._attached.add(key);
        } else if (!enabled && this._attached.has(key)) {
          target.removeEventListener(type, listener, options);
          this._attached.delete(key);
        }
      }
    );
  }

  removeListeners(flag) {
    this.featureEventMap[flag].forEach(
      ({ target, type, listener, options }) => {
        const key = `${type}_${flag}`;
        if (this._attached.has(key)) {
          target.removeEventListener(type, listener, options);
          this._attached.delete(key);
        }
      }
    );
  }

  // Handlers
  async handleFocusMethod(e) {
    if (this.featureManager.isOn("TEXT_FIELDS") && e.target.isContentEditable) {
      this.translationHandler.handleEditableFocus(e.target);
    }
  }

  async handleBlurMethod(e) {
    if (this.featureManager.isOn("TEXT_FIELDS") && e.target.isContentEditable) {
      this.translationHandler.handleEditableBlur(e.target);
    }
  }

  async handleClickMethod(e) {
    if (!state.selectElementActive) return;
    await this.translationHandler.eventHandler.handleSelect_ElementClick(e);
  }

  async handleKeyDownMethod(e) {
    this.translationHandler.handleEvent(e);
  }

  async handleMouseOverMethod(e) {
    if (!state.selectElementActive) return;
    const target = e.composedPath?.()[0] || e.target;
    if (!target?.innerText?.trim()) return;
    state.highlightedElement?.style?.outline &&
      (state.highlightedElement.style.outline = "");
    state.highlightedElement = target;
    target.style.outline = CONFIG.HIGHLIGHT_STYLE;
  }

  async handleMouseUpMethod(e) {
    this.translationHandler.handleEvent(e);
  }

  async dispose() {
    Object.keys(this.featureEventMap).forEach((flag) =>
      this.removeListeners(flag)
    );
  }
}

export const setupEventListeners = (th, fm) => new EventRouter(th, fm);
export const teardownEventListeners = (router) => router?.dispose?.();
