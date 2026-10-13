import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import DesktopFabMenu from './DesktopFabMenu.vue';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const mocks = vi.hoisted(() => {
  // The tracker is a no-op for page listeners, but the drag engine needs its
  // window listeners to actually fire, so route only drag events through.
  const dragEvents = new Set(['mousemove', 'mouseup', 'touchmove', 'touchend']);
  return {
    mobileStore: null,
    settingsStore: null,
    pageEventBus: {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    },
    sendMessage: vi.fn(),
    sendRegularMessage: vi.fn(),
    tracker: {
      clearTimer: vi.fn(),
      trackTimeout: vi.fn((callback) => setTimeout(callback, 0)),
      trackResource: vi.fn(),
      addEventListener: vi.fn((target, type, handler) => {
        if (dragEvents.has(type)) target.addEventListener(type, handler);
      }),
      removeEventListener: vi.fn((target, type, handler) => {
        if (dragEvents.has(type)) target.removeEventListener(type, handler);
      }),
    },
    autoRules: null,
    mouseHoverEnabled: null,
    translations: {},
    handleError: vi.fn(),
    supportedHideScopes: new Set(['page', 'site']),
    exclusionKey: vi.fn(),
    addExclusion: vi.fn(),
    ttsStop: vi.fn().mockResolvedValue(undefined),
    storageManager: { set: vi.fn() },
  };
});

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => mocks.mobileStore,
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  default: () => mocks.settingsStore,
}));

vi.mock('@/composables/shared/useUnifiedI18n', () => ({
  useUnifiedI18n: () => ({ t: (key) => mocks.translations[key] ?? key }),
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: mocks.sendMessage,
  sendRegularMessage: mocks.sendRegularMessage,
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: mocks.pageEventBus,
  WINDOWS_MANAGER_EVENTS: {},
}));

vi.mock('@/composables/core/useResourceTracker', () => ({
  useResourceTracker: () => mocks.tracker,
}));

vi.mock('@/features/tts/composables/useTTSSmart.js', () => ({
  useTTSSmart: () => ({
    lastText: { value: '' },
    detectedLanguage: { value: 'auto' },
    currentTTSId: { value: null },
    ttsState: { value: 'idle' },
    isPlaying: { value: false },
    isLoading: { value: false },
    stop: mocks.ttsStop,
    speak: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/features/mouse-hover/composables/useMouseHoverToggle.js', () => ({
  useMouseHoverToggle: () => ({
    isMouseHoverEnabled: mocks.mouseHoverEnabled,
    toggleMouseHover: vi.fn(),
  }),
}));

vi.mock('@/apps/content/composables/useFabSelection.js', () => ({
  default: () => ({
    pendingSelection: { value: { hasSelection: false, mode: null, text: '' } },
    triggerTranslation: vi.fn(),
  }),
}));

vi.mock('@/features/page-translation/composables/useAutoTranslateRules.js', () => ({
  useAutoTranslateRules: () => mocks.autoRules,
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  default: {
    getInstance: () => ({
      getFeatureStatus: vi.fn().mockResolvedValue({
        initialized: true,
        features: {
          pageTranslation: { allowed: true },
          selectElement: { allowed: true },
          screenCapture: { allowed: true },
        },
      }),
    }),
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: { Page: 'page', Select_Element: 'select-element' },
  SelectionTranslationMode: { ON_FAB_CLICK: 'on-fab-click' },
  getDesktopFabPositionAsync: vi.fn().mockResolvedValue({ y: 100, side: 'right' }),
}));

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => ({ features: ['bulk'] }),
}));

vi.mock('@/utils/browser/compatibility.js', () => ({
  deviceDetector: { isMobile: () => false },
}));

vi.mock('@/shared/config/languageConstants.js', () => ({
  getLanguageNameFromCode: () => 'English',
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: mocks.storageManager,
}));

vi.mock('@/utils/ui/styleInjector.js', () => ({
  injectStylesToShadowRoot: vi.fn(),
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: mocks.handleError }),
}));

vi.mock('@/features/desktop-fab/desktopFabExclusions.js', () => ({
  DESKTOP_FAB_EXCLUSION_PREFIX: 'desktop-fab-exclusion:v1:',
  getDesktopFabExclusionKey: (scope, url) => mocks.exclusionKey(scope, url),
  addDesktopFabExclusion: (scope, url) => mocks.addExclusion(scope, url),
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn(),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** Shared component/store/transport state for every DesktopFabMenu mount. */
const setupBaseMocks = () => {
  vi.clearAllMocks();
  mocks.sendRegularMessage.mockResolvedValue({ success: true });
  mocks.translations = {};
  mocks.mouseHoverEnabled = ref(false);
  mocks.handleError = vi.fn();
  mocks.mobileStore = reactive({
    hasElementTranslations: false,
    isFullscreen: false,
    pageTranslationData: {
      status: 'idle',
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: false,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
    },
  });
  mocks.settingsStore = reactive({
    isDarkTheme: false,
    settings: {
      FAB_IDLE_OPACITY: 20,
      FAB_SIZE: '1',
      TRANSLATE_ON_TEXT_SELECTION: true,
      SHOW_MOUSE_HOVER_IN_FAB: false,
      SHOW_DESKTOP_FAB: true,
      selectionTranslationMode: 'immediate',
    },
    getEffectiveProvider: () => 'google',
    updateSettingLocally: vi.fn(),
  });
  mocks.supportedHideScopes = new Set(['page', 'site']);
  mocks.exclusionKey = vi.fn((scope) =>
    mocks.supportedHideScopes.has(scope) ? `desktop-fab-exclusion:v1:${scope}:key` : '');
  mocks.addExclusion = vi.fn(async (scope) =>
    mocks.supportedHideScopes.has(scope) ? `desktop-fab-exclusion:v1:${scope}:key` : '');
  mocks.storageManager.set.mockReset();
  mocks.ttsStop.mockReset().mockResolvedValue(undefined);
};

describe('DesktopFabMenu page command transport', () => {
  beforeEach(() => {
    setupBaseMocks();
    mocks.autoRules = {
      isAutoTranslateToggleVisible: ref(true), isActive: ref(false),
      hasPageRule: ref(false), hasSiteRule: ref(false), siteScopeAvailable: ref(true),
      showManageRules: ref(false),
      normalizedPageUrl: ref('https://example.com/page'), siteRule: ref(null),
      hasBroaderMatchingRule: ref(false), isFileUrl: ref(false),
      scopeActions: { togglePageScope: vi.fn(), toggleSiteScope: vi.fn() }, openManageRules: vi.fn(),
    };
  });

  it('sends PAGE_TRANSLATE through runtime with provider data', async () => {
    const wrapper = mount(DesktopFabMenu);
    const translateItem = wrapper.vm.menuItems.find(item => item.id === 'translate_page');

    translateItem.action();
    await Promise.resolve();

    expect(mocks.sendRegularMessage).toHaveBeenCalledWith({
      action: MessageActions.PAGE_TRANSLATE,
      data: { provider: 'google' },
    }, { returnFailureResponse: true });
    expect(mocks.pageEventBus.emit).not.toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE,
      expect.anything(),
    );
  });

  it.each([
    ['PAGE_RESTORE', MessageActions.PAGE_RESTORE, { status: 'completed', isTranslated: true }],
    ['PAGE_TRANSLATE_STOP_AUTO', MessageActions.PAGE_TRANSLATE_STOP_AUTO, { status: 'translating', isTranslating: true }],
  ])('sends %s through runtime only', async (_name, action, state) => {
    mocks.mobileStore.pageTranslationData = {
      ...mocks.mobileStore.pageTranslationData,
      ...state,
    };
    const wrapper = mount(DesktopFabMenu);
    const itemId = action === MessageActions.PAGE_RESTORE ? 'restore_page' : 'page_translating_stop';
    const item = wrapper.vm.menuItems.find(menuItem => menuItem.id === itemId);

    item.action();
    await Promise.resolve();

    expect(mocks.sendRegularMessage).toHaveBeenCalledWith({ action }, { returnFailureResponse: true });
    expect(mocks.pageEventBus.emit).not.toHaveBeenCalledWith(action);
  });

  it('opens scope choices from the page secondary action and routes toggles', async () => {
    mocks.autoRules.hasPageRule.value = true;
    const wrapper = mount(DesktopFabMenu, { attachTo: document.body });
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    await wrapper.get('.fab-menu-item-secondary-btn').trigger('click');
    expect(wrapper.find('.fab-auto-translate-scopes').exists()).toBe(true);
    expect(wrapper.find('.fab-scope-separator').exists()).toBe(false);
    expect(wrapper.find('.fab-scope-note').exists()).toBe(false);
    expect(wrapper.find('.fab-scope-link').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.fab-auto-translate-scopes button').element);
    expect(wrapper.get('.fab-menu-item-secondary-btn').attributes('aria-haspopup')).toBeUndefined();
    expect(wrapper.get('.fab-menu-item-secondary-btn').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('.fab-auto-translate-scopes').attributes('role')).toBe('group');
    expect(wrapper.findAll('.fab-auto-translate-scopes button')).toHaveLength(2);
    expect(wrapper.find('.fab-auto-translate-scopes button').attributes('aria-pressed')).toBe('true');
    await wrapper.find('.fab-auto-translate-scopes button').trigger('click');
    expect(mocks.autoRules.scopeActions.togglePageScope).toHaveBeenCalledOnce();

    await wrapper.get('.fab-auto-translate-scopes').trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.fab-auto-translate-scopes').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.fab-menu-item-secondary-btn').element);
    expect(wrapper.vm.isMenuOpen).toBe(true);
    wrapper.unmount();
  });

  it('shows broader-rule guidance and returns focus to the star on Escape', async () => {
    mocks.autoRules.showManageRules.value = true;
    const wrapper = mount(DesktopFabMenu, { attachTo: document.body });
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    const star = wrapper.get('.fab-menu-item-secondary-btn');
    await star.trigger('click');

    const separator = wrapper.get('.fab-auto-translate-scopes .fab-scope-separator');
    const note = wrapper.get('.fab-auto-translate-scopes .fab-scope-note');
    const manageRules = wrapper.get('.fab-auto-translate-scopes .fab-scope-link');
    expect(separator.element.tagName).toBe('HR');
    expect(note.element.tagName).toBe('DIV');
    expect(note.element.tagName).not.toBe('BUTTON');
    expect(note.text()).toContain('auto_translate_scope_covered_note');
    expect(manageRules.element.tagName).toBe('BUTTON');
    expect(manageRules.text()).toContain('auto_translate_manage_rules');

    await manageRules.trigger('click');
    expect(mocks.autoRules.openManageRules).toHaveBeenCalledOnce();
    await manageRules.trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.fab-auto-translate-scopes').exists()).toBe(false);
    expect(document.activeElement).toBe(star.element);
    wrapper.unmount();
  });

  it('resets the scope disclosure when the FAB closes', async () => {
    const wrapper = mount(DesktopFabMenu);
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    await wrapper.get('.fab-menu-item-secondary-btn').trigger('click');
    expect(wrapper.find('.fab-auto-translate-scopes').exists()).toBe(true);

    wrapper.vm.isMenuOpen = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.scopeMenuOpen).toBe(false);

    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.fab-auto-translate-scopes').exists()).toBe(false);
  });

  it.each(['0.8', '1', '1.2', '1.5'])(
    'keeps menu item content intact at FAB size %s', async (size) => {
      mocks.settingsStore.settings.FAB_SIZE = size;
      const wrapper = mount(DesktopFabMenu);
      wrapper.vm.isReady = true;
      wrapper.vm.isMenuOpen = true;
      await wrapper.vm.$nextTick();

      expect(wrapper.get('.desktop-fab-container').element.style.getPropertyValue('--fab-scale')).toBe(size);

      const translateRow = wrapper.findAll('.fab-menu-item').find(row =>
        row.get('.fab-menu-item-text').text() === 'desktop_fab_translate_page_label');
      expect(translateRow).toBeTruthy();
      expect(translateRow.get('.menu-icon-wrapper .fab-menu-icon').attributes('alt'))
        .toBe('desktop_fab_translate_page_label');
      expect(translateRow.get('.fab-menu-item-text').text()).toBe('desktop_fab_translate_page_label');
      expect(translateRow.find('.fab-menu-item-secondary-btn').exists()).toBe(true);
      wrapper.unmount();
    },
  );

  it('shows the mouse-hover toggle label for its current enabled state', async () => {
    mocks.settingsStore.settings.SHOW_MOUSE_HOVER_IN_FAB = true;
    const wrapper = mount(DesktopFabMenu);
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();

    const mouseHoverItem = () => wrapper.findAll('.fab-menu-item').find(row =>
      row.get('.fab-menu-item-text').text().startsWith('mouse_hover_'));
    expect(mouseHoverItem().get('.fab-menu-item-text').text()).toBe('mouse_hover_enable_label');

    mocks.mouseHoverEnabled.value = true;
    await wrapper.vm.$nextTick();
    expect(mouseHoverItem().get('.fab-menu-item-text').text()).toBe('mouse_hover_disable_label');
    wrapper.unmount();
  });

  it('keeps the page star beside its label and the scope panel after it', async () => {
    const longLabel = 'Translate this entire page with a deliberately long localized label';
    mocks.translations.desktop_fab_translate_page_label = longLabel;
    const wrapper = mount(DesktopFabMenu);
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();

    const translateRow = wrapper.findAll('.fab-menu-item').find(row =>
      row.get('.fab-menu-item-text').text() === longLabel);
    expect(translateRow.get('.fab-menu-item-text').text()).toBe(longLabel);
    const star = translateRow.get('.fab-menu-item-secondary-btn');
    expect(star.element.parentElement).toBe(translateRow.element);
    expect(translateRow.element.children[0].classList).toContain('menu-icon-wrapper');
    expect(translateRow.element.children[1]).toBe(translateRow.get('.fab-menu-item-text').element);

    await star.trigger('click');
    const scopePanel = translateRow.get('.fab-auto-translate-scopes');
    expect(scopePanel.element.parentElement).toBe(translateRow.element);
    expect(Array.from(translateRow.element.children).indexOf(scopePanel.element))
      .toBeGreaterThan(Array.from(translateRow.element.children).indexOf(star.element));
    wrapper.unmount();
  });
});

describe('DesktopFabMenu hide FAB disclosure', () => {
  let wrapper;

  const openMenu = async () => {
    wrapper = mount(DesktopFabMenu, { attachTo: document.body });
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    return wrapper;
  };

  const hideRow = () => wrapper.findAll('.fab-menu-item').at(-1);
  const hideTrigger = () => hideRow().get('.fab-hide-row-trigger');

  beforeEach(() => {
    setupBaseMocks();
    mocks.autoRules = {
      isAutoTranslateToggleVisible: ref(false), isActive: ref(false),
      hasPageRule: ref(false), hasSiteRule: ref(false), siteScopeAvailable: ref(true),
      showManageRules: ref(false),
      normalizedPageUrl: ref('https://example.com/page'), siteRule: ref(null),
      hasBroaderMatchingRule: ref(false), isFileUrl: ref(false),
      scopeActions: { togglePageScope: vi.fn(), toggleSiteScope: vi.fn() }, openManageRules: vi.fn(),
    };
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('keeps Hide FAB as the last item, separated from the actions by a divider', async () => {
    await openMenu();

    const rows = wrapper.findAll('.fab-menu-item');
    const lastRow = rows.at(-1);
    expect(lastRow.get('.fab-menu-item-text').text()).toBe('desktop_fab_hide_fab_label');
    expect(lastRow.element.previousElementSibling.classList).toContain('fab-menu-divider');
    expect(wrapper.findAll('.fab-menu-divider').at(-1).element.nextElementSibling)
      .toBe(lastRow.element);
    expect(lastRow.classes()).not.toContain('is-disabled');

    // The label is a real button, so Enter/Space reach the same disclosure.
    const trigger = hideTrigger();
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.attributes('type')).toBe('button');
    expect(trigger.text()).toBe('desktop_fab_hide_fab_label');

    // Activating the row opens the choices — it never dismisses the FAB.
    await lastRow.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#fab-hide-options').exists()).toBe(true);
    expect(mocks.addExclusion).not.toHaveBeenCalled();
    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });

  it('discloses the three hide options with a labelled button and Escape restores focus', async () => {
    await openMenu();

    const trigger = hideTrigger();
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.attributes('aria-controls')).toBe('fab-hide-options');
    expect(trigger.attributes('title')).toBe('desktop_fab_hide_options_toggle_label');
    expect(hideRow().find('.fab-hide-options').exists()).toBe(false);

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();

    const panel = wrapper.get('#fab-hide-options');
    expect(panel.attributes('role')).toBe('group');
    expect(panel.attributes('aria-label')).toBe('desktop_fab_hide_options_label');
    expect(trigger.attributes('aria-expanded')).toBe('true');

    const labels = panel.findAll('button').map((button) => button.text());
    expect(labels).toEqual([
      'desktop_fab_hide_close_for_now',
      'desktop_fab_hide_this_page',
      'desktop_fab_hide_this_site',
    ]);
    expect(document.activeElement).toBe(panel.findAll('button').at(0).element);

    await panel.trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#fab-hide-options').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    expect(wrapper.vm.isMenuOpen).toBe(true);
  });

  it('omits persistent scopes the current page cannot express', async () => {
    // file:// pages can hide a single page but never a whole site
    mocks.supportedHideScopes = new Set(['page']);
    await openMenu();

    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('#fab-hide-options button').map((button) => button.text());
    expect(labels).toEqual([
      'desktop_fab_hide_close_for_now',
      'desktop_fab_hide_this_page',
    ]);
  });

  it('warns only while selection translation is owned by the FAB', async () => {
    await openMenu();
    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.fab-hide-warning').exists()).toBe(false);

    mocks.settingsStore.settings.selectionTranslationMode = 'on-fab-click';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.fab-hide-warning').text())
      .toBe('desktop_fab_hide_onfabclick_warning');

    mocks.settingsStore.settings.selectionTranslationMode = 'on-click';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.fab-hide-warning').exists()).toBe(false);
  });

  it('emits temporary immediately and persistent only after a successful write', async () => {
    await openMenu();
    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('#fab-hide-options button').at(0).trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[{ scope: 'temporary' }]]);
    expect(mocks.addExclusion).not.toHaveBeenCalled();
    expect(wrapper.vm.isMenuOpen).toBe(false);

    // Reopen and hold the write open: the parent is told only once it lands.
    let finishWrite;
    mocks.addExclusion.mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();
    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('#fab-hide-options button').at(1).trigger('click');
    await Promise.resolve();
    expect(mocks.addExclusion).toHaveBeenCalledWith('page', window.location.href);
    expect(wrapper.emitted('dismiss')).toEqual([[{ scope: 'temporary' }]]);

    finishWrite('desktop-fab-exclusion:v1:page:key');
    await Promise.resolve();
    await Promise.resolve();
    expect(wrapper.emitted('dismiss')).toEqual([
      [{ scope: 'temporary' }],
      [{ scope: 'page' }],
    ]);
  });

  it('keeps the menu open and surfaces feedback when the write fails', async () => {
    mocks.addExclusion = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    await openMenu();
    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('#fab-hide-options button').at(2).trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.addExclusion).toHaveBeenCalledWith('site', window.location.href);
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    expect(wrapper.vm.isMenuOpen).toBe(true);
    const alert = wrapper.get('.fab-hide-error');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe('desktop_fab_hide_save_failed');
    expect(mocks.handleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'desktop-fab:hide-site', showToast: true }),
    );
  });

  it('never writes the mode or the global FAB toggle for a dismissal', async () => {
    await openMenu();
    await hideTrigger().trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('#fab-hide-options button').at(1).trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
    expect(mocks.settingsStore.settings.selectionTranslationMode).toBe('immediate');
    expect(mocks.settingsStore.settings.SHOW_DESKTOP_FAB).toBe(true);
  });
});

describe('DesktopFabMenu dismissal cleanup and drag persistence', () => {
  let wrapper;

  const autoRulesOff = () => ({
    isAutoTranslateToggleVisible: ref(false), isActive: ref(false),
    hasPageRule: ref(false), hasSiteRule: ref(false), siteScopeAvailable: ref(true),
    showManageRules: ref(false),
    normalizedPageUrl: ref('https://example.com/page'), siteRule: ref(null),
    hasBroaderMatchingRule: ref(false), isFileUrl: ref(false),
    scopeActions: { togglePageScope: vi.fn(), toggleSiteScope: vi.fn() }, openManageRules: vi.fn(),
  });

  beforeEach(() => {
    setupBaseMocks();
    mocks.autoRules = autoRulesOff();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  it('stops only this instance\'s TTS when the parent unmounts it after a temporary dismissal', async () => {
    wrapper = mount(DesktopFabMenu, { attachTo: document.body });
    wrapper.vm.isReady = true;
    wrapper.vm.isMenuOpen = true;
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.fab-menu-item').at(-1).get('.fab-hide-row-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    // Opening the disclosure must not tear anything down on its own.
    expect(mocks.ttsStop).not.toHaveBeenCalled();

    await wrapper.findAll('#fab-hide-options button').at(0).trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[{ scope: 'temporary' }]]);
    expect(mocks.ttsStop).not.toHaveBeenCalled();

    // The parent gate hides the FAB by unmounting this component.
    wrapper.unmount();
    wrapper = null;

    expect(mocks.ttsStop).toHaveBeenCalledTimes(1);
    expect(mocks.ttsStop).toHaveBeenCalledWith({ stopOnlyIfOwner: true });
  });

  it('reports actual root presence across readiness, fullscreen and unmount', async () => {
    wrapper = mount(DesktopFabMenu);
    wrapper.vm.isReady = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('presence')?.at(-1)).toEqual([true]);
    expect(wrapper.find('.desktop-fab-container').exists()).toBe(true);

    mocks.mobileStore.isFullscreen = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('presence')?.at(-1)).toEqual([false]);
    expect(wrapper.find('.desktop-fab-container').exists()).toBe(false);

    wrapper.unmount();
    expect(wrapper.emitted('presence')?.at(-1)).toEqual([false]);
  });

  it('persists DESKTOP_FAB_POSITION after a drag without touching any setting', async () => {
    wrapper = mount(DesktopFabMenu, { attachTo: document.body });
    wrapper.vm.isReady = true;
    // Pin the drag origin so the expectation does not depend on jsdom layout.
    wrapper.vm.verticalPos = 100;
    await wrapper.vm.$nextTick();

    wrapper.get('.desktop-fab-button').element.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 150, clientX: 900 }),
    );
    // The first move clears the 5px threshold, the second repositions the FAB.
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 300, clientX: 900 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 420, clientX: 900 }));

    // Drag end defers the write by 100ms; fake only the clock, not rAF.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 420, clientX: 900 }));
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();

    expect(mocks.storageManager.set).toHaveBeenCalledWith({
      DESKTOP_FAB_POSITION: { side: 'right', y: 220 },
    });
    // Geometry only: no other storage key, no setting write, no dismissal.
    expect(mocks.storageManager.set.mock.calls).toHaveLength(1);
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
    expect(mocks.addExclusion).not.toHaveBeenCalled();
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    expect(mocks.settingsStore.settings.SHOW_DESKTOP_FAB).toBe(true);
    expect(mocks.settingsStore.settings.selectionTranslationMode).toBe('immediate');
    expect(wrapper.vm.isMenuOpen).toBe(false);
  });
});
