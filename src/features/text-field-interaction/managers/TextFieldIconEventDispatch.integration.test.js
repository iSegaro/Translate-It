import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  activeIcons: [],
  isIconActive: false,
  iconCount: 0,
  addIcon: vi.fn(),
  removeIcon: vi.fn(),
  clearAllIcons: vi.fn(),
  markIconClicked: vi.fn(),
  getIcon: vi.fn(),
  hasIcon: vi.fn(),
  getInfo: vi.fn(() => ({})),
};

const { mockTranslateFieldViaSmartHandler } = vi.hoisted(() => ({
  mockTranslateFieldViaSmartHandler: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {
      this.resources = [];
    }

    addEventListener(target, event, handler, options) {
      if (typeof target.addEventListener === 'function') {
        target.addEventListener(event, handler, options);
        this.resources.push({ target, event, handler, options });
        return;
      }

      const unsubscribe = target.on(event, handler);
      this.resources.push({ unsubscribe });
    }

    trackResource() {}

    cleanup() {
      for (const resource of this.resources.splice(0)) {
        if (resource.unsubscribe) {
          resource.unsubscribe();
        } else {
          const { target, event, handler, options } = resource;
          target.removeEventListener(event, handler, options);
        }
      }
    }

    destroy() {
      this.cleanup();
    }
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  state: {
    preventTextFieldIconCreation: false,
    activeTranslateIcon: null,
  },
}));

vi.mock('@/core/extensionContext.js', () => ({
  ExtensionContextManager: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false),
  },
  default: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false),
  },
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getBrowserUtils: vi.fn(async () => ({
      detectSite: () => 'default',
      Site: { Youtube: 'youtube' },
    })),
  },
}));

vi.mock('../utils/PositionCalculator.js', () => ({
  PositionCalculator: {
    calculateOptimalPosition: vi.fn(() => ({
      top: 10,
      left: 10,
      placement: 'top-right',
    })),
  },
}));

vi.mock('../utils/ElementAttachment.js', () => ({
  ElementAttachment: class {
    attach() {}
    detach() {}
  },
}));

vi.mock('../config/positioning.js', () => ({
  textFieldIconConfig: { detection: { authKeywords: [] } },
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: { getInstance: vi.fn(() => ({ isFeatureAllowed: vi.fn(() => Promise.resolve(true)) })) },
}));

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  default: {},
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn((_key, fallback) => fallback),
    onChange: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@/handlers/smartTranslationIntegration.js', () => ({
  translateFieldViaSmartHandler: mockTranslateFieldViaSmartHandler,
}));

vi.mock('@/handlers/smart-translation/translationErrorOwnership.js', () => ({
  isFieldTranslationRequestError: vi.fn(() => false),
}));

vi.mock('../utils/FieldTranslationErrorPresenter.js', () => ({
  getFieldTranslationErrorPresentation: vi.fn(),
}));

vi.mock('../stores/textFieldInteraction.js', () => ({
  useTextFieldInteractionStore: vi.fn(() => mockStore),
}));

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: vi.fn(() => ({
    addEventListener: vi.fn(),
  })),
}));

import { pageEventBus } from '@/core/PageEventBus.js';
import { useContentAppTextFieldIcons } from '@/apps/content/composables/useContentAppTextFieldIcons.js';
import { useTextFieldIcon } from '../composables/useTextFieldIcon.js';
import { TextFieldIconManager } from './TextFieldIconManager.js';

describe('TextFieldIconManager event dispatch characterization', () => {
  let manager;
  let executeFromEvent;
  let executeTranslation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTranslateFieldViaSmartHandler.mockResolvedValue(undefined);
    TextFieldIconManager.resetInstance();
    manager = TextFieldIconManager.getInstance();
    executeFromEvent = vi.spyOn(manager, 'executeTranslationFromEvent');
    executeTranslation = vi.spyOn(manager, 'executeTranslation');
  });

  afterEach(() => {
    executeFromEvent?.mockRestore();
    executeTranslation?.mockRestore();
    TextFieldIconManager.resetInstance();
  });

  function registerIcon(id) {
    const targetElement = document.createElement('textarea');
    manager.activeIcons.set(targetElement, { id, targetElement });
  }

  it('characterizes Vue text-field producer dispatch count', async () => {
    registerIcon('icon-vue');
    const icon = useTextFieldIcon();
    icon.initialize(pageEventBus);

    icon.handleIconClick('icon-vue');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeFromEvent).toHaveBeenNthCalledWith(1, { id: 'icon-vue' });
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });

  it('characterizes ContentApp producer dispatch count', async () => {
    registerIcon('icon-content-app');
    const icon = useContentAppTextFieldIcons({ addEventListener: vi.fn() });

    icon.onIconClick('icon-content-app');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeFromEvent).toHaveBeenNthCalledWith(1, { id: 'icon-content-app' });
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });

  it('characterizes direct window dispatch through PageEventBus listener', async () => {
    const detail = { id: 'icon-raw-window', source: 'external' };
    registerIcon(detail.id);

    window.dispatchEvent(new CustomEvent('text-field-icon-clicked', { detail }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeFromEvent).toHaveBeenNthCalledWith(1, detail);
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });

  it('does not accumulate PageEventBus listeners across destroy and reinitialize', async () => {
    TextFieldIconManager.resetInstance();
    manager = TextFieldIconManager.getInstance();
    executeFromEvent = vi.spyOn(manager, 'executeTranslationFromEvent');
    executeTranslation = vi.spyOn(manager, 'executeTranslation');
    registerIcon('icon-reinitialized');

    pageEventBus.emit('text-field-icon-clicked', { id: 'icon-reinitialized' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });

  it('keeps manager listeners during ordinary visual cleanup', async () => {
    manager.initialize();
    manager.cleanup();

    pageEventBus.emit('windows-manager-show-icon', {});
    expect(manager._windowsManagerIconActive).toBe(true);
    pageEventBus.emit('windows-manager-dismiss-icon', {});
    expect(manager._windowsManagerIconActive).toBe(false);

    registerIcon('icon-after-cleanup');
    pageEventBus.emit('text-field-icon-clicked', { id: 'icon-after-cleanup' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });

  it('keeps command listener through processEditableElement cleanup', async () => {
    const targetElement = document.createElement('textarea');
    targetElement.value = 'hello';
    document.body.appendChild(targetElement);

    vi.spyOn(manager, 'shouldProcessTextField').mockResolvedValue(true);
    vi.spyOn(manager, 'applyPlatformFiltering').mockResolvedValue(true);

    const icon = await manager.processEditableElement(targetElement);
    expect(icon?.id).toBeDefined();

    pageEventBus.emit('text-field-icon-clicked', { id: icon.id });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);

    targetElement.remove();
  });

  it('keeps command listener after blur cleanup and supports a later icon', async () => {
    const targetElement = document.createElement('textarea');
    document.body.appendChild(targetElement);

    manager.handleEditableBlur(targetElement);
    await Promise.resolve();

    registerIcon('icon-after-blur');
    pageEventBus.emit('text-field-icon-clicked', { id: 'icon-after-blur' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
    targetElement.remove();
  });

  it('removes manager command listener on destroy', async () => {
    registerIcon('icon-before-destroy');
    manager.destroy();

    pageEventBus.emit('text-field-icon-clicked', { id: 'icon-before-destroy' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(executeFromEvent).not.toHaveBeenCalled();
    expect(executeTranslation).not.toHaveBeenCalled();
    expect(mockTranslateFieldViaSmartHandler).not.toHaveBeenCalled();
  });

  it('removes old listener before singleton recreation', async () => {
    registerIcon('icon-recreated');
    const oldExecuteFromEvent = executeFromEvent;

    TextFieldIconManager.resetInstance();
    manager = TextFieldIconManager.getInstance();
    executeFromEvent = vi.spyOn(manager, 'executeTranslationFromEvent');
    executeTranslation = vi.spyOn(manager, 'executeTranslation');
    registerIcon('icon-recreated');

    pageEventBus.emit('text-field-icon-clicked', { id: 'icon-recreated' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(oldExecuteFromEvent).not.toHaveBeenCalled();
    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeTranslation).toHaveBeenCalledTimes(1);
    expect(mockTranslateFieldViaSmartHandler).toHaveBeenCalledTimes(1);
  });
});
