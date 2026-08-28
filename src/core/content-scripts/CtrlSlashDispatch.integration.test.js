import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadFeature: vi.fn(),
  translateFieldViaSmartHandler: vi.fn(),
  sendMessage: vi.fn(),
  settingsGet: vi.fn(),
  settingsOnChange: vi.fn(() => vi.fn()),
  pageEventBusOn: vi.fn(),
  pageEventBusEmit: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
  })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {
      this.resources = [];
    }

    addEventListener(target, event, handler, options) {
      target.addEventListener(event, handler, options || undefined);
      this.resources.push({ target, event, handler, options });
    }

    trackResource() {}

    cleanup() {
      for (const { target, event, handler, options } of this.resources.splice(0)) {
        target.removeEventListener(event, handler, options || undefined);
      }
    }

    destroy() {
      this.cleanup();
    }
  },
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: (...args) => mocks.settingsGet(...args),
    onChange: (...args) => mocks.settingsOnChange(...args),
    isExtensionEnabled: vi.fn(() => true),
  },
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: vi.fn(() => ({
      isFeatureAllowed: vi.fn(() => Promise.resolve(true)),
    })),
  },
}));

vi.mock('@/features/exclusion/utils/exclusion-utils.js', () => ({
  checkUrlExclusionAsync: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: mocks.pageEventBusOn,
    emit: mocks.pageEventBusEmit,
  },
}));

vi.mock('@/core/content-scripts/chunks/lazy-features.js', () => ({
  loadFeature: (...args) => mocks.loadFeature(...args),
}));

vi.mock('@/handlers/smartTranslationIntegration.js', () => ({
  translateFieldViaSmartHandler: (...args) => mocks.translateFieldViaSmartHandler(...args),
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: (...args) => mocks.sendMessage(...args),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    TRANSLATE: 'TRANSLATE',
    CANCEL_TRANSLATION: 'CANCEL_TRANSLATION',
  },
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context })),
  },
  MessagingContexts: { CONTENT: 'content' },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: { Field: 'field' },
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('provider')),
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getBrowserUtils: vi.fn(() => Promise.resolve({
      detectPlatform: vi.fn(() => 'WINDOWS'),
    })),
  },
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager {},
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({ handle: vi.fn() })),
  },
}));

vi.mock('@/shared/constants/detection.js', () => ({
  INPUT_TYPES: {
    ALL_TEXT_FIELDS: ['text', 'search', 'tel', 'url', 'email', 'password', 'number'],
  },
}));

import interactionCoordinator from './InteractionCoordinator.js';
import { ShortcutHandler } from '@/features/shortcuts/handlers/ShortcutHandler.js';
import { shortcutManager } from '@/core/managers/content/shortcuts/ShortcutManager.js';
import { FieldShortcutManager } from '@/features/text-field-interaction/managers/FieldShortcutManager.js';

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function configureSettings() {
  mocks.settingsGet.mockImplementation((key, fallback) => {
    if (key === 'EXTENSION_ENABLED') return true;
    if (key === 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS') return true;
    if (key === 'TEXT_FIELD_SHORTCUT') return 'Ctrl+/';
    if (key === 'SOURCE_LANGUAGE') return 'auto';
    if (key === 'TARGET_LANGUAGE') return 'fa';
    return fallback;
  });
}

function createEvent(key = '/') {
  return new KeyboardEvent('keydown', {
    key,
    code: key === '/' ? 'Slash' : 'KeyA',
    ctrlKey: key === '/',
    bubbles: true,
    cancelable: true,
  });
}

describe('Ctrl+/ dispatch characterization', () => {
  let coordinator;
  let handler;
  let executeSpy;
  let delegatedKeyboardSpy;
  let textarea;

  beforeEach(() => {
    vi.clearAllMocks();
    configureSettings();
    mocks.translateFieldViaSmartHandler.mockResolvedValue(undefined);
    mocks.sendMessage.mockResolvedValue({ success: true });
    mocks.loadFeature.mockImplementation(async () => handler);

    textarea = document.createElement('textarea');
    textarea.value = 'hello';
    document.body.appendChild(textarea);
    textarea.focus();

    coordinator = interactionCoordinator;
    executeSpy = vi.spyOn(FieldShortcutManager.prototype, 'execute');
  });

  afterEach(async () => {
    coordinator?.cleanup();
    if (handler?.isActive) await handler.deactivate();
    ShortcutHandler.destroyInstance();
    if (shortcutManager.initialized) shortcutManager.cleanup();
    executeSpy?.mockRestore();
    delegatedKeyboardSpy?.mockRestore();
    textarea?.remove();
  });

  async function activateShortcutWiring() {
    handler = ShortcutHandler.getInstance({ featureManager: {} });
    await handler.activate();
    delegatedKeyboardSpy = vi.spyOn(handler, 'handleKeyboardEvent');
    mocks.shortcutHandler = handler;
    await coordinator.initialize();
  }

  it('dispatches one activated Ctrl+/ through canonical ownership', async () => {
    await activateShortcutWiring();
    const event = createEvent();
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    document.dispatchEvent(event);
    await nextTask();
    await nextTask();

    expect(mocks.translateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
    expect(delegatedKeyboardSpy).not.toHaveBeenCalled();
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
  });

  it('scales one canonical execution per separate physical Ctrl+/ event', async () => {
    await activateShortcutWiring();

    document.dispatchEvent(createEvent());
    await nextTask();
    await nextTask();
    document.dispatchEvent(createEvent());
    await nextTask();
    await nextTask();

    expect(mocks.translateFieldViaSmartHandler).toHaveBeenCalledTimes(2);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not start Field translation for unrelated keydown', async () => {
    await activateShortcutWiring();

    document.dispatchEvent(createEvent('a'));
    await nextTask();
    await nextTask();

    expect(mocks.translateFieldViaSmartHandler).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('characterizes first-event lazy activation separately', async () => {
    let lazyHandler;
    mocks.loadFeature.mockImplementationOnce(async () => {
      lazyHandler = ShortcutHandler.getInstance({ featureManager: {} });
      await lazyHandler.activate();
      handler = lazyHandler;
      return lazyHandler;
    });
    await coordinator.initialize();

    document.dispatchEvent(createEvent());
    await nextTask();
    await nextTask();

    expect(mocks.translateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
