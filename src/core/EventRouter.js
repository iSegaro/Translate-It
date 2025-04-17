// src/core/EventRouter.js
import Browser from "webextension-polyfill";
import { CONFIG, state } from "../config.js";
import FeatureManager from "./FeatureManager.js";
import { isEditable, logME, taggleLinks } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";
import { handleUIError } from "../services/ErrorService.js";
import { logMethod } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";

export default class EventRouter {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.errorHandler = translationHandler.errorHandler;

    /* ---------- ۱) ساخت هندلرهای بسته‑بندی شده ---------- */
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
    const initialFlags = {
      TEXT_FIELDS: CONFIG.TRANSLATE_ON_TEXT_FIELDS,
      SHORTCUT_TEXT_FIELDS: CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS,
      SELECT_ELEMENT: CONFIG.TRANSLATE_WITH_SELECT_ELEMENT,
      TEXT_SELECTION: CONFIG.TRANSLATE_ON_TEXT_SELECTION,
      DICTIONARY: CONFIG.ENABLE_DICTIONARY,
    };
    this.featureManager = new FeatureManager(initialFlags);

    /* ---------- ۳) جدولِ رویدادها ---------- */
    /** @type {Record<string, Array<{target:EventTarget,type:string,listener:EventListener,options?:any}>>} */
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
    this._attached = new Set(); // "type_flag"
    Object.keys(this.featureEventMap).forEach((flag) => {
      this._toggle(flag); // بار نخست
      this.featureManager.on(flag, () => this._toggle(flag));
    });
  }

  /** روشن/خاموش کردن لیستنرهای مربوط به فلگ */
  _toggle(flag) {
    const enabled = this.featureManager.isOn(flag);
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

  /* ---------- ۵) هندلرهای رویداد ---------- */

  @logMethod
  async handleFocusMethod(e) {
    if (isEditable(e.target)) {
      this.translationHandler?.handleEditableFocus?.(e.target);
    }
  }

  @logMethod
  async handleBlurMethod(e) {
    if (isEditable(e.target)) {
      this.translationHandler?.handleEditableBlur?.(e.target);
    }
  }

  @logMethod
  async handleClickMethod(e) {
    if (!state.selectElementActive) return;

    this.translationHandler.IconManager?.cleanup();
    state.selectElementActive = false;
    await Browser.storage.local.set({ selectElementActive: false });
    taggleLinks(false);
    await Browser.runtime.sendMessage({
      action: "UPDATE_SELECT_ELEMENT_STATE",
      data: false,
    });

    setTimeout(async () => {
      try {
        const res =
          await this.translationHandler.eventHandler.handleSelect_ElementModeClick(
            e
          );
        if (res?.status === "error") {
          const msg =
            res.message ||
            (await getTranslationString("ERRORS_DURING_TRANSLATE")) ||
            "(⚠️ خطایی در ترجمه رخ داد)";
          this.translationHandler.notifier.show(msg, "error", true, 4000);
        }
      } catch (err) {
        handleUIError(err, {
          type: ErrorTypes.UI,
          context: "handleSelect_ElementModeClick",
        });
        taggleLinks(true);
      }
    }, 100);
  }

  @logMethod
  async handleKeyDownMethod(e) {
    this.translationHandler.handleEvent(e);
    if (e.key === "Escape" && state.selectElementActive) {
      taggleLinks(true);
      this.translationHandler.IconManager?.cleanup();
      state.selectElementActive = false;
      await Browser.storage.local.set({ selectElementActive: false });
      Browser.runtime.sendMessage({
        action: "UPDATE_SELECT_ELEMENT_STATE",
        data: false,
      });
      logME("[EventRouter] Select‑Element deactivated via Esc.");
    }
  }

  async handleMouseOverMethod(e) {
    if (!state.selectElementActive) return;

    const target = e.composedPath?.()[0] || e.target;
    if (!target?.innerText?.trim()) return;

    if (state.highlightedElement !== target) {
      state.highlightedElement?.style &&
        (state.highlightedElement.style.outline = "");
      state.highlightedElement?.style &&
        (state.highlightedElement.style.opacity = "");
      state.highlightedElement = target;
      target.style.outline = CONFIG.HIGHLIGHT_STYLE;
      target.style.opacity = "0.9";
    }
  }

  async handleMouseUpMethod(e) {
    this.translationHandler?.handleEvent?.(e);
  }

  /* ---------- ۶) تمیزکاری نهایی ---------- */
  async dispose() {
    Object.keys(this.featureEventMap).forEach((flag) => {
      this.featureEventMap[flag].forEach(
        ({ target, type, listener, options }) => {
          target.removeEventListener(type, listener, options);
        }
      );
    });
    this._attached.clear();
  }
}

/* Helper برای ایجاد/ازبین بردن */
export const setupEventListeners = (th) => new EventRouter(th);
export const teardownEventListeners = async (router) => router?.dispose?.();
