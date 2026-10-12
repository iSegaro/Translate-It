import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ActivationTab from './ActivationTab.vue';

const mocks = vi.hoisted(() => ({
  settingRefs: {},
  settingsStore: {
    settings: {},
    updateSettingLocally: vi.fn(),
  },
  storageManager: {
    on: vi.fn(),
    off: vi.fn(),
  },
  entries: [],
  listExclusions: vi.fn(),
  removeExclusion: vi.fn(),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mocks.settingsStore,
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => key }),
}));

vi.mock('../composables/useTabSettings.js', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useTabSettings: () => ({
      createSetting: (key, defaultValue) => {
        const setting = vueRef(defaultValue);
        mocks.settingRefs[key] = setting;
        return setting;
      },
      createProviderSetting: () => vueRef(''),
    }),
  };
});

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { UI: 'ui' } }));

vi.mock('@/utils/browser/compatibility.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, detectOS: () => 'linux' };
});

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: { CONTEXT_MENU_VISIBILITY: {}, TRANSLATE_ON_TEXT_SELECTION: true, MOUSE_HOVER_TRIGGER: 'primary' },
  TranslationMode: {
    Field: 'field', Select_Element: 'select-element', Selection: 'selection',
    Page: 'page', MouseHover: 'mouse-hover',
  },
  SelectionTranslationMode: { IMMEDIATE: 'immediate', ON_CLICK: 'on-click', ON_FAB_CLICK: 'on-fab-click' },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: mocks.storageManager,
}));

vi.mock('@/features/desktop-fab/desktopFabExclusions.js', () => ({
  DESKTOP_FAB_EXCLUSION_PREFIX: 'desktop-fab-exclusion:v1:',
  listDesktopFabExclusions: mocks.listExclusions,
  removeDesktopFabExclusion: mocks.removeExclusion,
}));

describe('ActivationTab Desktop FAB exclusions', () => {
  let wrapper;

  const mountTab = () => shallowMount(ActivationTab, {
    attachTo: document.body,
    global: {
      stubs: {
        BaseFieldset: {
          props: ['id', 'legend'],
          template: '<fieldset :id="id"><slot name="header"/><slot/></fieldset>',
        },
        BaseButton: { template: '<button v-bind="$attrs"><slot/></button>' },
        BaseCheckbox: { props: ['modelValue', 'label'], template: '<label>{{ label }}</label>' },
        BaseSelect: { template: '<select/>' },
        BaseRange: { template: '<input/>' },
        BaseRadio: { props: ['label'], template: '<span>{{ label }}</span>' },
        Transition: { template: '<div><slot/></div>' },
        ProviderSelector: { template: '<div/>' },
        ShortcutPicker: { template: '<div/>' },
        ConfigureShortcutButton: { template: '<div/>' },
        MaskIcon: { props: ['src', 'size'], template: '<span class="mask-icon-stub"/>' },
      },
    },
  });

  const entriesOf = () => wrapper.findAll('.fab-exclusion-item');

  beforeEach(() => {
    mocks.settingRefs = {};
    mocks.settingsStore.settings = {};
    mocks.settingsStore.updateSettingLocally.mockReset();
    mocks.storageManager.on.mockReset();
    mocks.storageManager.off.mockReset();
    mocks.entries = [
      { key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs', scope: 'page', value: 'https://example.com/docs' },
      { key: 'desktop-fab-exclusion:v1:site:example.org', scope: 'site', value: 'example.org' },
    ];
    mocks.listExclusions.mockReset();
    mocks.listExclusions.mockImplementation(async () => mocks.entries);
    mocks.removeExclusion.mockReset();
    mocks.removeExclusion.mockResolvedValue(undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('lists stored exclusions with a scope label and the value, even with the global toggle off', async () => {
    // The global FAB toggle stays off — the list must remain reachable.
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    expect(mocks.settingRefs.SHOW_DESKTOP_FAB.value).toBe(false);
    const rows = entriesOf();
    expect(rows).toHaveLength(2);
    expect(rows.at(0).get('.fab-exclusion-scope').text()).toBe('fab_exclusion_scope_page');
    expect(rows.at(0).get('.fab-exclusion-value').text()).toBe('https://example.com/docs');
    expect(rows.at(0).get('.fab-exclusion-value').attributes('dir')).toBe('ltr');
    expect(rows.at(1).get('.fab-exclusion-scope').text()).toBe('fab_exclusion_scope_site');
    expect(rows.at(1).get('.fab-exclusion-value').text()).toBe('example.org');

    // Removal is reachable and named for assistive tech.
    const removeBtn = rows.at(0).get('.fab-exclusion-remove-btn');
    expect(removeBtn.attributes('aria-label')).toBe('fab_exclusion_remove_label: https://example.com/docs');
    expect(wrapper.find('.fab-exclusions-error').exists()).toBe(false);
  });

  it('shows the empty state when nothing is hidden', async () => {
    mocks.entries = [];
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    expect(wrapper.get('.fab-exclusions-empty').text()).toBe('fab_exclusions_empty');
    expect(wrapper.get('.fab-exclusions-empty').attributes('role')).toBe('status');
  });

  it('removes one entry through the shared helper and drops only that row', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    const removedKey = mocks.entries[1].key;
    mocks.entries = [mocks.entries[0]];
    await entriesOf().at(1).get('.fab-exclusion-remove-btn').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.removeExclusion).toHaveBeenCalledWith(removedKey);
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('https://example.com/docs');
    expect(wrapper.find('.fab-exclusions-error').exists()).toBe(false);
  });

  it('keeps the entry and surfaces a descriptive alert when removal fails', async () => {
    mocks.removeExclusion.mockRejectedValue(new Error('write blocked'));
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    await entriesOf().at(0).get('.fab-exclusion-remove-btn').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.removeExclusion).toHaveBeenCalledWith(mocks.entries[0].key);
    expect(entriesOf()).toHaveLength(2);
    const alert = wrapper.get('.fab-exclusions-error');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe('fab_exclusion_remove_error');
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
  });

  it('surfaces a load failure without inventing entries or an empty state', async () => {
    mocks.listExclusions.mockRejectedValue(new Error('storage unavailable'));
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    // A failed read must not be rendered as "nothing is hidden".
    expect(wrapper.find('.fab-exclusions-empty').exists()).toBe(false);
    expect(wrapper.get('.fab-exclusions-error').attributes('role')).toBe('alert');
    expect(wrapper.get('.fab-exclusions-error').text()).toBe('fab_exclusions_load_error');
  });

  it('lets the newest refresh win when an older read resolves late', async () => {
    const resolvers = [];
    mocks.listExclusions.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    wrapper = mountTab();
    await nextTick();
    expect(mocks.listExclusions).toHaveBeenCalledTimes(1);

    // A cross-tab change fires a second read while the first is still in flight.
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    const newest = { key: 'desktop-fab-exclusion:v1:site:newest.test', scope: 'site', value: 'newest.test' };
    listener({ key: 'desktop-fab-exclusion:v1:site:newest.test' });
    expect(mocks.listExclusions).toHaveBeenCalledTimes(2);

    resolvers[1]([newest]);
    await nextTick();
    await nextTick();
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('newest.test');

    // The stale first read lands afterwards and must be discarded.
    resolvers[0](mocks.entries);
    await nextTick();
    await nextTick();
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('newest.test');
    expect(wrapper.find('.fab-exclusions-empty').exists()).toBe(false);
  });

  it('keeps known entries when a later refresh fails', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    expect(entriesOf()).toHaveLength(2);

    mocks.listExclusions.mockRejectedValue(new Error('storage unavailable'));
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    listener({ key: 'desktop-fab-exclusion:v1:site:example.org' });
    await nextTick();
    await nextTick();

    // The previous snapshot stays; the failure is reported, not an empty list.
    expect(entriesOf()).toHaveLength(2);
    expect(wrapper.find('.fab-exclusions-empty').exists()).toBe(false);
    expect(wrapper.get('.fab-exclusions-error').attributes('role')).toBe('alert');
    expect(wrapper.get('.fab-exclusions-error').text()).toBe('fab_exclusions_load_error');
  });

  it('refreshes on owned storage changes, ignores unrelated keys, and cleans up', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    expect(listener).toBeTypeOf('function');
    expect(mocks.listExclusions).toHaveBeenCalledTimes(1);

    // Unrelated key: no reload.
    listener({ key: 'SHOW_DESKTOP_FAB', newValue: false });
    await nextTick();
    expect(mocks.listExclusions).toHaveBeenCalledTimes(1);

    // Owned key: reload from storage, not from a staged copy.
    mocks.entries = [mocks.entries[1]];
    listener({ key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs' });
    await nextTick();
    await nextTick();
    expect(mocks.listExclusions).toHaveBeenCalledTimes(2);
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('example.org');

    wrapper.unmount();
    wrapper = null;
    expect(mocks.storageManager.off).toHaveBeenCalledWith('change', listener);
  });

  it('does not write any FAB setting while managing exclusions', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    await entriesOf().at(0).get('.fab-exclusion-remove-btn').trigger('click');
    await nextTick();

    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
    expect(mocks.settingRefs.SHOW_DESKTOP_FAB.value).toBe(false);
    expect(mocks.settingRefs.selectionTranslationMode.value).toBe('immediate');
  });
});
