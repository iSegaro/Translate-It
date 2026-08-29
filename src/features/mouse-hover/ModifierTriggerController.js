const MODIFIER_KEYS = Object.freeze({
  ctrl: new Set(['Control', 'Meta']),
  alt: new Set(['Alt']),
  shift: new Set(['Shift'])
});

export const ModifierTriggerState = Object.freeze({
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  INVALID: 'INVALID'
});

/**
 * Recognizes standalone modifier press/release gestures.
 * @private
 */
export class ModifierTriggerController {
  constructor() {
    // Standalone release only; hold and double-tap require separate intent rules.
    this.state = ModifierTriggerState.IDLE;
    this.trigger = null;
    this.triggerKey = null;
    this.pressedKeys = new Set();
  }

  /**
   * Record keyboard input without handling translation behavior.
   * @param {KeyboardEvent|Object} event
   * @param {string} trigger
   */
  handleKeyDown(event, trigger) {
    if (!this._isSupportedTrigger(trigger)) {
      this.reset();
      return;
    }

    if (this.trigger && this.trigger !== trigger) {
      this.reset();
    }

    const key = event?.key;
    if (!key) {
      this.invalidate();
      return;
    }

    const isTriggerKey = this._isTriggerKey(key, trigger);

    // Repeated modifier keydown must not start or duplicate a gesture.
    if (isTriggerKey && event.repeat) return;

    if (this.state === ModifierTriggerState.IDLE) {
      if (isTriggerKey && this.pressedKeys.size === 0 && this._isStandaloneModifier(event, trigger)) {
        this.state = ModifierTriggerState.PENDING;
        this.trigger = trigger;
        this.triggerKey = key;
      }
    } else if (
      this.state === ModifierTriggerState.PENDING
      && (!isTriggerKey || key !== this.triggerKey)
    ) {
      this.state = ModifierTriggerState.INVALID;
    }

    this.pressedKeys.add(key);
  }

  /**
   * Complete valid standalone gestures on matching modifier release.
   * @param {KeyboardEvent|Object} event
   * @param {string} trigger
   * @returns {boolean} Whether release should trigger translation
   */
  handleKeyUp(event, trigger) {
    const key = event?.key;
    if (key) this.pressedKeys.delete(key);

    if (!this._isSupportedTrigger(trigger) || (this.trigger && this.trigger !== trigger)) {
      this.reset();
      return false;
    }

    if (this.state === ModifierTriggerState.IDLE || key !== this.triggerKey) {
      return false;
    }

    const shouldTrigger = this.state === ModifierTriggerState.PENDING;
    this.reset();
    return shouldTrigger;
  }

  /**
   * Invalidate current gesture without treating interaction as a new gesture.
   */
  invalidate() {
    if (this.state === ModifierTriggerState.PENDING) {
      this.state = ModifierTriggerState.INVALID;
    }
  }

  /**
   * Reset gesture and tracked keyboard state.
   */
  reset() {
    this.state = ModifierTriggerState.IDLE;
    this.trigger = null;
    this.triggerKey = null;
    this.pressedKeys.clear();
  }

  _isSupportedTrigger(trigger) {
    return Object.hasOwn(MODIFIER_KEYS, trigger);
  }

  _isTriggerKey(key, trigger) {
    return MODIFIER_KEYS[trigger]?.has(key) === true;
  }

  _isStandaloneModifier(event, trigger) {
    switch (trigger) {
      case 'ctrl':
        return !event.altKey
          && !event.shiftKey
          && (event.key === 'Control' ? !event.metaKey : !event.ctrlKey);
      case 'alt':
        return !event.ctrlKey && !event.shiftKey && !event.metaKey;
      case 'shift':
        return !event.ctrlKey && !event.altKey && !event.metaKey;
      default:
        return false;
    }
  }
}
