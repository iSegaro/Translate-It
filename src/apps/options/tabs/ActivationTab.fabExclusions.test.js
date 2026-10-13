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
  useUnifiedI18n: () => ({ t: (key) => (key === 'IsRTL' ? 'true' : key) }),
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
  let focusSpy;

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

  const openDrawer = async () => {
    await wrapper.find('#DESKTOP_FAB_MANAGE_LIST_BTN').trigger('click');
    await nextTick();
  };

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
    // Spy through so focus() still works, but its options are observable.
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  });

  afterEach(() => {
    focusSpy?.mockRestore();
    focusSpy = null;
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders the compact row without the Manage button disabled, even with FAB off and extension disabled', async () => {
    // Both global toggles stay off — the row must stay reachable.
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    expect(mocks.settingRefs.SHOW_DESKTOP_FAB.value).toBe(false);

    const group = wrapper.get('#DESKTOP_FAB_EXCLUSIONS');
    expect(group.findAll('.setting-row')).toHaveLength(1);
    expect(group.get('.setting-label').text()).toBe('fab_exclusions_label');
    expect(group.get('.setting-description').exists()).toBe(true);
    const btn = group.get('#DESKTOP_FAB_MANAGE_LIST_BTN');
    expect(btn.attributes('disabled')).toBeUndefined();
    // Unlike the Auto Page button, it stays usable while the FAB is off.
    expect(btn.element.disabled).toBe(false);

    // And it must remain usable when the whole extension is disabled.
    mocks.settingRefs.EXTENSION_ENABLED.value = false;
    await nextTick();
    expect(wrapper.get('#DESKTOP_FAB_MANAGE_LIST_BTN').element.disabled).toBe(false);

    // Nothing renders before the drawer opens.
    expect(group.find('.fab-exclusion-item').exists()).toBe(false);
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(false);
  });

  it('opens the drawer on Manage List with dialog semantics and moves focus inside', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    await openDrawer();

    const drawer = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER');
    expect(drawer.attributes('role')).toBe('dialog');
    expect(drawer.attributes('aria-modal')).toBe('true');
    expect(drawer.attributes('aria-label')).toBe('fab_exclusions_group_label');
    expect(document.activeElement).toBe(drawer.get('.drawer-close-btn').element);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it.each`
    action
    ${'header close button'}
    ${'overlay click'}
    ${'Escape key'}
    ${'footer Done button'}
  `('closes the drawer via $action and restores focus to the Manage List button', async ({ action }) => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(true);

    if (action === 'header close button') {
      await wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-close-btn').trigger('click');
    } else if (action === 'overlay click') {
      await wrapper.get('.drawer-overlay').trigger('click');
    } else if (action === 'Escape key') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await nextTick();
    } else {
      await wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').trigger('click');
    }
    await nextTick();
    await nextTick();

    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#DESKTOP_FAB_MANAGE_LIST_BTN').element);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('traps Tab and Shift+Tab at the drawer edges', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER');
    const closeBtn = drawer.get('.drawer-close-btn').element;
    const doneBtn = drawer.get('.drawer-footer button').element;

    // Tab from the last control wraps to the first (the close button).
    doneBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await nextTick();
    expect(document.activeElement).toBe(closeBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });

    // Shift+Tab from the first wraps to the last (the Done button).
    closeBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(doneBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('traps focus between the close button and Done when the list is empty', async () => {
    mocks.entries = [];
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER');
    const closeBtn = drawer.get('.drawer-close-btn').element;
    const doneBtn = drawer.get('.drawer-footer button').element;

    // Tab from the last control wraps to the first.
    doneBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await nextTick();
    expect(document.activeElement).toBe(closeBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });

    // Shift+Tab from the first wraps to the last.
    closeBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(doneBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('restores focus to a remaining remove button after a successful removal', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    firstBtn.element.focus();
    mocks.entries = [mocks.entries[1]];
    await firstBtn.trigger('click');
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(1);
    expect(document.activeElement).toBe(
      entriesOf().at(0).get('.fab-exclusion-remove-btn').element,
    );
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('moves focus to the footer Done button when the last entry is removed', async () => {
    mocks.entries = [mocks.entries[0]];
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const removeBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    removeBtn.element.focus();
    mocks.entries = [];
    await removeBtn.trigger('click');
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    expect(document.activeElement).toBe(
      wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element,
    );
    expect(document.activeElement.closest('#DESKTOP_FAB_EXCLUSIONS_DRAWER')).toBeTruthy();
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('restores focus to the replacement remove button after the deferred write resolves', async () => {
    let resolveWrite;
    mocks.removeExclusion.mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    firstBtn.element.focus();
    await firstBtn.trigger('click');
    await nextTick();
    expect(entriesOf()).toHaveLength(2); // row stays while the write is pending

    resolveWrite();
    await nextTick();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(1);
    expect(document.activeElement).toBe(
      entriesOf().at(0).get('.fab-exclusion-remove-btn').element,
    );
  });

  it('focuses the footer Done button after the deferred final-entry write resolves', async () => {
    mocks.entries = [mocks.entries[0]];
    let resolveWrite;
    mocks.removeExclusion.mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const removeBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    removeBtn.element.focus();
    await removeBtn.trigger('click');
    await nextTick();

    resolveWrite();
    await nextTick();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    const doneBtn = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button');
    expect(document.activeElement).toBe(doneBtn.element);
    expect(document.activeElement.closest('#DESKTOP_FAB_EXCLUSIONS_DRAWER')).toBeTruthy();
  });

  it('respects a deliberate focus move onto a surviving control while the write is pending', async () => {
    let resolveWrite;
    mocks.removeExclusion.mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    firstBtn.element.focus();
    await firstBtn.trigger('click');
    await nextTick();

    // The user moves focus while the write is in flight — that choice wins.
    const doneBtn = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button');
    doneBtn.element.focus();
    resolveWrite();
    await nextTick();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(1);
    expect(document.activeElement).toBe(
      wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element,
    );
  });

  it('does not steal focus when the deferred write rejects', async () => {
    let rejectWrite;
    mocks.removeExclusion.mockImplementation(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    firstBtn.element.focus();
    await firstBtn.trigger('click');
    await nextTick();

    const doneBtn = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button');
    doneBtn.element.focus();
    rejectWrite(new Error('write blocked'));
    await nextTick();
    await nextTick();
    await nextTick();

    // The entry stays, the alert shows, and focus is untouched.
    expect(entriesOf()).toHaveLength(2);
    expect(wrapper.find('.fab-exclusions-error').exists()).toBe(true);
    expect(document.activeElement).toBe(
      wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element,
    );
  });

  it('keeps concurrent removals isolated per key and never re-submits a pending key', async () => {
    const resolvers = [];
    mocks.removeExclusion.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const removeButtons = () => entriesOf().map((row) => row.get('.fab-exclusion-remove-btn'));

    await removeButtons()[0].trigger('click');
    await nextTick();
    expect(mocks.removeExclusion).toHaveBeenCalledTimes(1);
    expect(removeButtons()[0].element.disabled).toBe(true);
    expect(removeButtons()[1].element.disabled).toBe(false);

    // The handler guard keeps the same key from submitting twice, even when
    // the disabled attribute is bypassed with a raw event.
    removeButtons()[0].element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(mocks.removeExclusion).toHaveBeenCalledTimes(1);

    // B starts its own removal while A's write is still in flight.
    await removeButtons()[1].trigger('click');
    await nextTick();
    expect(mocks.removeExclusion).toHaveBeenCalledTimes(2);
    expect(removeButtons()[0].element.disabled).toBe(true);
    expect(removeButtons()[1].element.disabled).toBe(true);

    // A settles: only A's row goes; B stays pending and disabled.
    resolvers[0]();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('example.org');
    expect(entriesOf().at(0).get('.fab-exclusion-remove-btn').element.disabled).toBe(true);

    // B settles: even the disabled (unfocusable) row's clean-up works.
    resolvers[1]();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(entriesOf()).toHaveLength(0);
  });

  it('recovers drawer focus when a cross-tab refresh drops the focused entry', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    firstBtn.element.focus();
    expect(document.activeElement).toBe(firstBtn.element);

    mocks.entries = [mocks.entries[1]];
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    listener({ key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs' });
    await nextTick();
    await nextTick();
    await nextTick();

    expect(mocks.listExclusions).toHaveBeenCalledTimes(2);
    expect(entriesOf()).toHaveLength(1);
    expect(document.activeElement).toBe(
      entriesOf().at(0).get('.fab-exclusion-remove-btn').element,
    );
  });

  it('focuses the footer Done button when a cross-tab refresh drops the last focused entry', async () => {
    mocks.entries = [mocks.entries[0]];
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const removeBtn = entriesOf().at(0).get('.fab-exclusion-remove-btn');
    removeBtn.element.focus();
    mocks.entries = [];
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    listener({ key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs' });
    await nextTick();
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    expect(document.activeElement).toBe(
      wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element,
    );
  });

  it('does not steal focus from a surviving control across a cross-tab refresh', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element.focus();
    mocks.entries = [mocks.entries[1]];
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    listener({ key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs' });
    await nextTick();
    await nextTick();
    await nextTick();

    expect(mocks.listExclusions).toHaveBeenCalledTimes(2);
    expect(entriesOf()).toHaveLength(1);
    expect(document.activeElement).toBe(
      wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer button').element,
    );
  });

  it('leaves focus alone when a cross-tab refresh lands with the drawer closed', async () => {
    mocks.entries = [];
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    const manageBtn = wrapper.get('#DESKTOP_FAB_MANAGE_LIST_BTN');
    manageBtn.element.focus();
    const listener = mocks.storageManager.on.mock.calls.find(([event]) => event === 'change')?.[1];
    listener({ key: 'desktop-fab-exclusion:v1:page:https%3A%2F%2Fexample.com%2Fdocs' });
    await nextTick();
    await nextTick();
    await nextTick();

    expect(mocks.listExclusions).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(manageBtn.element);
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(false);
  });

  it('aligns the single-action footer to the action end in LTR and RTL', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const footer = wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer');
    expect(footer.classes()).toContain('fab-drawer-footer');

    // With IsRTL true the drawer is mirrored; the modifier class stays.
    expect(wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER').classes()).toContain('rtl');
    expect(wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER .drawer-footer').classes())
      .toContain('fab-drawer-footer');
  });

  it('keeps only one drawer open: opening the rules drawer closes the FAB drawer and vice versa', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();

    // FAB drawer first, then the rules drawer takes over.
    await openDrawer();
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(true);
    await wrapper.get('#WHOLE_PAGE_MANAGE_RULES_BTN').trigger('click');
    await nextTick();
    await nextTick();
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(false);
    expect(wrapper.find('#WHOLE_PAGE_AUTO_TRANSLATE_RULES_DRAWER').exists()).toBe(true);

    // And back again.
    await wrapper.get('#WHOLE_PAGE_AUTO_TRANSLATE_RULES_DRAWER .drawer-close-btn').trigger('click');
    await nextTick();
    expect(wrapper.find('#WHOLE_PAGE_AUTO_TRANSLATE_RULES_DRAWER').exists()).toBe(false);
    await openDrawer();
    expect(wrapper.find('#DESKTOP_FAB_EXCLUSIONS_DRAWER').exists()).toBe(true);
    expect(wrapper.find('#WHOLE_PAGE_AUTO_TRANSLATE_RULES_DRAWER').exists()).toBe(false);
  });

  it('lists stored exclusions with a scope label and the value inside the drawer', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

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
    await openDrawer();

    expect(entriesOf()).toHaveLength(0);
    expect(wrapper.get('.fab-exclusions-empty').text()).toBe('fab_exclusions_empty');
    expect(wrapper.get('.fab-exclusions-empty').attributes('role')).toBe('status');
  });

  it('removes one entry through the shared helper and drops only that row', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    const removedKey = mocks.entries[1].key;
    mocks.entries = [mocks.entries[0]];
    await entriesOf().at(1).get('.fab-exclusion-remove-btn').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.removeExclusion).toHaveBeenCalledWith(removedKey);
    expect(entriesOf()).toHaveLength(1);
    expect(entriesOf().at(0).get('.fab-exclusion-value').text()).toBe('https://example.com/docs');
    expect(wrapper.find('.fab-exclusions-error').exists()).toBe(false);
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
  });

  it('keeps the entry and surfaces a descriptive alert when removal fails', async () => {
    mocks.removeExclusion.mockRejectedValue(new Error('write blocked'));
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

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
    await openDrawer();

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
    await openDrawer();
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
    await openDrawer();
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
    await openDrawer();

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

  it('renders an open drawer with the rtl class when the locale is RTL', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    expect(wrapper.get('#DESKTOP_FAB_EXCLUSIONS_DRAWER').classes()).toContain('rtl');
  });

  it('does not write any FAB setting while managing exclusions', async () => {
    wrapper = mountTab();
    await nextTick();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).get('.fab-exclusion-remove-btn').trigger('click');
    await nextTick();

    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalled();
    expect(mocks.settingRefs.SHOW_DESKTOP_FAB.value).toBe(false);
    expect(mocks.settingRefs.selectionTranslationMode.value).toBe('immediate');
  });
});
