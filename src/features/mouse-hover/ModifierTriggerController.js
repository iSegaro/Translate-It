import { detectOS, OS_PLATFORMS } from '@/utils/browser/compatibility.js';

const FIXED_TRIGGER_KEYS = Object.freeze({
  control: 'Control',
  alt: 'Alt',
  shift: 'Shift'
});

/**
 * Resolve configured Mouse Hover trigger values to physical keyboard identities.
 * @param {string} trigger
 * @param {string} platform
 * @returns {Set<string>}
 */
export function getTriggerKeys(trigger, platform = detectOS()) {
  const key = trigger === 'primary'
    ? platform === OS_PLATFORMS.MAC ? 'Meta' : 'Control'
    : Object.hasOwn(FIXED_TRIGGER_KEYS, trigger) ? FIXED_TRIGGER_KEYS[trigger] : null;

  return key ? new Set([key]) : new Set();
}

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
  constructor(platform = detectOS()) {
    // Standalone release only; hold and double-tap require separate intent rules.
    this.state = ModifierTriggerState.IDLE;
    this.trigger = null;
    this.triggerKey = null;
    this.pressedKeys = new Set();
    this.platform = platform;
  }

  /**
   * Record keyboard input without handling translation behavior.
   * @param {KeyboardEvent|Object} event
   * @param {string} trigger
   */
  handleKeyDown(event, trigger) {
    const triggerKeys = this._getTriggerKeys(trigger);
    if (triggerKeys.size === 0) {
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

    const isTriggerKey = triggerKeys.has(key);

    // Repeated modifier keydown must not start or duplicate a gesture.
    if (isTriggerKey && event.repeat) return;

    if (this.state === ModifierTriggerState.IDLE) {
      if (isTriggerKey && this.pressedKeys.size === 0 && this._isStandaloneModifier(event, key)) {
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

    if (this._getTriggerKeys(trigger).size === 0 || (this.trigger && this.trigger !== trigger)) {
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

  _getTriggerKeys(trigger) {
    return getTriggerKeys(trigger, this.platform);
  }

  _isStandaloneModifier(event, triggerKey) {
    switch (triggerKey) {
      case 'Control':
        return !event.altKey && !event.shiftKey && !event.metaKey;
      case 'Meta':
        return !event.ctrlKey && !event.altKey && !event.shiftKey;
      case 'Alt':
        return !event.ctrlKey && !event.shiftKey && !event.metaKey;
      case 'Shift':
        return !event.ctrlKey && !event.altKey && !event.metaKey;
      default:
        return false;
    }
  }
}
