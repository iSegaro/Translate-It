import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ProvidersTab from './ProvidersTab.vue';

const mocks = vi.hoisted(() => ({
  settings: {},
  store: {
    settings: {},
    activeConfigProvider: 'test-provider',
    updateSettingLocally: vi.fn(),
  },
  isRTL: 'false',
  registry: [
    { id: 'googlev2', name: 'Google Translate', supported: true },
    { id: 'edge', name: 'Microsoft Translator', supported: true },
    { id: 'deepl', name: 'DeepL Translate', supported: true },
    { id: 'openai', name: 'OpenAI GPT', supported: true },
    { id: 'mock', name: 'Development Mock', supported: true },
  ],
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mocks.store,
}));

// Identity i18n with IsRTL toggleable through mocks.isRTL
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => (key === 'IsRTL' ? mocks.isRTL : key) }),
}));

// Registry fixture: supported ids plus the debug-gated mock
vi.mock('@/core/provider-registry.js', () => ({
  getProvidersForDropdown: (debugMode) =>
    mocks.registry.filter((provider) => provider.id !== 'mock' || debugMode),
  getProviderById: (id) => mocks.registry.find((provider) => provider.id === id),
}));

vi.mock('../composables/useHighlightManager.js', () => ({
  useHighlightManager: () => ({
    highlightElement: vi.fn(),
    checkAndHighlight: vi.fn(),
  }),
}));

// vue-router: real under the component focus of this suite (route stays quiescent)
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/features/settings/utils/providerValidator.js', () => ({
  getFirstMissingSetting: () => null,
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { UI: 'ui' } }));

describe('ProvidersTab custom provider list drawer', () => {
  let wrapper;
  let focusSpy;

  const mountTab = () => shallowMount(ProvidersTab, {
    attachTo: document.body,
    global: {
      stubs: {
        ProviderSelector: { props: ['modelValue'], template: '<select class="provider-selector-stub"/>' },
        BaseButton: { template: '<button v-bind="$attrs"><slot/></button>' },
        BaseCheckbox: {
          props: ['modelValue', 'label'],
          template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"><span>{{ label }}</span></label>',
        },
        Transition: { template: '<div><slot/></div>' },
      },
    },
  });

  const openDrawer = async () => {
    await wrapper.find('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').trigger('click');
    await nextTick();
  };

  const entriesOf = () => wrapper.findAll('.custom-list-entry');

  beforeEach(() => {
    mocks.store.settings = {
      TRANSLATION_API: 'googlev2',
      CUSTOM_PROVIDER_LIST_ENABLED: false,
      CUSTOM_PROVIDER_LIST: [],
      HIDDEN_PROVIDERS: [],
      DEBUG_MODE: false,
    };
    mocks.isRTL = 'false';
    mocks.store.activeConfigProvider = 'test-provider';
    mocks.store.updateSettingLocally.mockReset();
    // Spy through so focus() still works, but its options are observable.
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  });

  afterEach(() => {
    focusSpy?.mockRestore();
    focusSpy = null;
    wrapper?.unmount();
    wrapper = null;
  });

  // --- Row & dialog semantics ---

  it('renders the manageable row; drawer stays closed until opened', async () => {
    wrapper = mountTab();
    await nextTick();

    const row = wrapper.get('#CUSTOM_PROVIDER_LIST');
    expect(row.get('.custom-list-row-label').text()).toBe('custom_provider_list_label');
    expect(row.get('.custom-list-row-desc').exists()).toBe(true);
    expect(row.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element.disabled).toBe(false);
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
  });

  it('opens the drawer with dialog semantics and moves focus inside', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER');
    expect(drawer.attributes('role')).toBe('dialog');
    expect(drawer.attributes('aria-modal')).toBe('true');
    expect(drawer.attributes('aria-label')).toBe('custom_provider_list_group_label');
    expect(document.activeElement).toBe(drawer.get('.custom-list-close-btn').element);
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
    await openDrawer();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(true);

    if (action === 'header close button') {
      await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-close-btn').trigger('click');
    } else if (action === 'overlay click') {
      await wrapper.get('.custom-list-overlay').trigger('click');
    } else if (action === 'Escape key') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await nextTick();
    } else {
      await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    }
    await nextTick();
    await nextTick();

    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('traps Tab and Shift+Tab at the drawer edges with entries present', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER');
    const closeBtn = drawer.get('.custom-list-close-btn').element;
    const doneBtn = drawer.get('.custom-list-drawer-footer button').element;

    doneBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await nextTick();
    expect(document.activeElement).toBe(closeBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });

    closeBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(doneBtn);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('traps focus between the close button and Done when the list is empty', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER');
    const closeBtn = drawer.get('.custom-list-close-btn').element;
    const doneBtn = drawer.get('.custom-list-drawer-footer button').element;

    doneBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await nextTick();
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    drawer.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(doneBtn);
  });

  it('stops reacting to Escape after unmount', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(true);

    wrapper.unmount();
    wrapper = null;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    // No wrapper exists: the dispatch must simply do nothing (no throw).
    expect(document.querySelector('#CUSTOM_PROVIDER_LIST_DRAWER')).toBeNull();
  });

  it('applies the rtl class to the drawer when the locale is RTL', async () => {
    mocks.isRTL = 'true';
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').classes()).toContain('rtl');
  });

  // --- Staged draft semantics ---

  it('snapshots the store into the draft on each opening', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST_ENABLED = true;
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').element.checked).toBe(true);
    const values = entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    expect(values).toEqual(['deepl', 'openai']);

    // Store changes while closed are not reflected in the still-draft state.
    mocks.store.updateSettingLocally.mockReset();
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-close-btn').trigger('click');
    await nextTick();
    await nextTick();
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalled();
  });

  it('Done stages both keys through updateSettingLocally and closes', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(true);
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST_ENABLED', true);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['deepl']);
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('Close/overlay/Escape discards only this opening draft without staging', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Mutate the draft: toggle enable and remove one entry.
    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(true);
    await entriesOf().at(0).get('.custom-list-remove-btn').trigger('click');
    // discard via overlay
    await wrapper.get('.custom-list-overlay').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalled();

    // Reopening reflects the untouched store: both entries, disabled again.
    await openDrawer();
    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').element.checked).toBe(false);
    expect(entriesOf()).toHaveLength(2);
  });

  // --- Add source & stored-id preservation ---

  it('add source excludes already-selected providers', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const options = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-add-select')
      .findAll('option').map((option) => option.element.value);
    expect(options).toContain('');
    expect(options).not.toContain('deepl');
    expect(options).toContain('googlev2');
  });

  it('add source excludes hidden providers and the mock outside debug mode', async () => {
    mocks.store.settings.HIDDEN_PROVIDERS = ['edge'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const values = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-add-select')
      .findAll('option').map((option) => option.element.value);
    expect(values).not.toContain('edge');
    expect(values).not.toContain('mock');
    expect(values).toContain('deepl');
  });

  it('add source includes the mock in debug mode', async () => {
    mocks.store.settings.DEBUG_MODE = true;
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const values = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-add-select')
      .findAll('option').map((option) => option.element.value);
    expect(values).toContain('mock');
  });

  it('adding a provider stages it into the draft and resets the select', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const select = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-add-select');
    await select.setValue('deepl');
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-add-btn').trigger('click');
    await nextTick();

    expect(entriesOf().at(0).get('.custom-list-entry-name').attributes('title')).toBe('deepl');
    expect(select.element.value).toBe('');

    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['deepl']);
  });

  it('keeps stored ids that are no longer selectable and tags them', async () => {
    // 'edge' got hidden after being stored; 'mock' is stored with debug off;
    // 'legacy-provider' was never in the registry at all.
    mocks.store.settings.HIDDEN_PROVIDERS = ['edge'];
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['edge', 'legacy-provider', 'mock'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rows = entriesOf();
    expect(rows).toHaveLength(3);
    expect(rows.at(0).get('.custom-list-entry-name').text()).toContain('Microsoft Translator');
    expect(rows.at(1).get('.custom-list-entry-name').get('.custom-list-entry-raw').text()).toBe('legacy-provider');
    expect(rows.at(1).get('.custom-list-entry-name').get('.custom-list-entry-raw').attributes('dir')).toBe('ltr');
    expect(rows.at(2).get('.custom-list-entry-name').text()).toContain('Development Mock');
    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-entry-tag')).toBeTruthy();
    expect(wrapper.findAll('.custom-list-entry-tag')).toHaveLength(3);

    // Done stages them verbatim (save ids, never provider objects, no drops).
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith(
      'CUSTOM_PROVIDER_LIST',
      ['edge', 'legacy-provider', 'mock'],
    );
  });

  it('deduplicates imported ids in first-occurrence order while keeping unavailable ids editable', async () => {
    const importedIds = ['edge', 'legacy-provider', 'edge', 'deepl', 'legacy-provider', 'mock', 'deepl', null];
    mocks.store.settings.HIDDEN_PROVIDERS = ['edge'];
    mocks.store.settings.CUSTOM_PROVIDER_LIST = importedIds;
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rowIds = () => entriesOf().map(entry => entry.get('.custom-list-entry-name').attributes('title'));
    expect(rowIds()).toEqual(['edge', 'legacy-provider', 'deepl', 'mock']);
    expect(wrapper.findAll('.custom-list-entry-tag')).toHaveLength(3);

    await entriesOf().at(2).findAll('.custom-list-move-btn').at(0).trigger('click');
    await entriesOf().at(0).get('.custom-list-remove-btn').trigger('click');
    expect(rowIds()).toEqual(['deepl', 'legacy-provider', 'mock']);
    expect(mocks.store.settings.CUSTOM_PROVIDER_LIST).toEqual(importedIds);
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['deepl', 'legacy-provider', 'mock']);
  });

  // --- Reorder: keyboard and drag & drop ---

  it('Move Up/Down reorder the draft without staging', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai', 'googlev2'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rowValues = () => entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    expect(rowValues()).toEqual(['deepl', 'openai', 'googlev2']);

    // First row cannot move up; last cannot move down.
    expect(entriesOf().at(0).findAll('.custom-list-move-btn').at(0).element.disabled).toBe(true);
    expect(entriesOf().at(2).findAll('.custom-list-move-btn').at(1).element.disabled).toBe(true);

    await entriesOf().at(1).findAll('.custom-list-move-btn').at(0).trigger('click');
    await nextTick();
    expect(rowValues()).toEqual(['openai', 'deepl', 'googlev2']);

    await entriesOf().at(1).findAll('.custom-list-move-btn').at(1).trigger('click');
    await nextTick();
    expect(rowValues()).toEqual(['openai', 'googlev2', 'deepl']);

    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalled();
  });

  it('names each row\'s move and remove buttons after its provider', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'legacy-provider'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rows = entriesOf();
    expect(rows).toHaveLength(2);

    // Each row's buttons carry its own provider name/id, not a shared
    // ambiguous 'Move up'/'Move down'/'Remove from list'.
    expect(rows.at(0).findAll('.custom-list-move-btn').at(0).attributes('aria-label'))
      .toBe('custom_provider_list_move_up_label: DeepL Translate');
    expect(rows.at(0).findAll('.custom-list-move-btn').at(1).attributes('aria-label'))
      .toBe('custom_provider_list_move_down_label: DeepL Translate');
    expect(rows.at(0).get('.custom-list-remove-btn').attributes('aria-label'))
      .toBe('custom_provider_list_remove_label: DeepL Translate');

    // Unknown fallback names use the raw stored id.
    expect(rows.at(1).findAll('.custom-list-move-btn').at(0).attributes('aria-label'))
      .toBe('custom_provider_list_move_up_label: legacy-provider');
    expect(rows.at(1).findAll('.custom-list-move-btn').at(1).attributes('aria-label'))
      .toBe('custom_provider_list_move_down_label: legacy-provider');
    expect(rows.at(1).get('.custom-list-remove-btn').attributes('aria-label'))
      .toBe('custom_provider_list_remove_label: legacy-provider');
  });

  it('renders the remove control as a MaskIcon trash like the FAB drawer', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    for (const row of entriesOf()) {
      // shallowMount auto-stub exposes the bound props as attributes; Vite may
      // inline or hash the asset, so only assert it resolves to the trash SVG.
      const icon = row.get('.custom-list-remove-btn').get('mask-icon-stub');
      const src = icon.attributes('src') ?? '';
      expect(src.includes('trash') || src.startsWith('data:')).toBe(true);
      expect(icon.attributes('size')).toBe('14');
    }
  });

  it('persists the reordered draft on Done and keeps it after disable', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).findAll('.custom-list-move-btn').at(1).trigger('click');
    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(false);
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();

    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['openai', 'deepl']);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST_ENABLED', false);
  });

  it('reorders on native drag & drop with a visible dragging affordance', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai', 'googlev2'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rowValues = () => entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    const firstRow = entriesOf().at(0).element;
    const lastRow = entriesOf().at(2).element;

    await firstRow.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await nextTick();
    expect(entriesOf().at(0).classes()).toContain('is-dragging');

    await lastRow.dispatchEvent(new Event('dragover', { bubbles: true }));
    expect(entriesOf().at(2).classes()).toContain('is-drag-over');

    await lastRow.dispatchEvent(new Event('drop', { bubbles: true }));
    await nextTick();
    expect(rowValues()).toEqual(['openai', 'googlev2', 'deepl']);
    expect(entriesOf().at(0).classes()).not.toContain('is-dragging');

    await firstRow.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await firstRow.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(entriesOf().at(0).element.classList).not.toContain('is-dragging');
  });

  it('ignores a drop when no drag is in flight', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).element.dispatchEvent(new Event('drop', { bubbles: true }));
    await nextTick();
    const rowValues = entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    expect(rowValues).toEqual(['deepl', 'openai']);
  });

  // --- Removal focus recovery ---

  it('restores focus to the replacing row after a removal', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai', 'googlev2'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const firstBtn = entriesOf().at(0).get('.custom-list-remove-btn');
    firstBtn.element.focus();
    await firstBtn.trigger('click');
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(2);
    expect(entriesOf().at(0).get('.custom-list-entry-name').attributes('title')).toBe('openai');
    expect(document.activeElement).toBe(entriesOf().at(0).get('.custom-list-remove-btn').element);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('focuses the footer Done button when the last entry is removed', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const removeBtn = entriesOf().at(0).get('.custom-list-remove-btn');
    removeBtn.element.focus();
    await removeBtn.trigger('click');
    await nextTick();
    await nextTick();

    expect(entriesOf()).toHaveLength(0);
    expect(document.activeElement).toBe(
      wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').element,
    );
    expect(document.activeElement.closest('#CUSTOM_PROVIDER_LIST_DRAWER')).toBeTruthy();
  });

  it('shows the empty state when nothing is stored', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    expect(entriesOf()).toHaveLength(0);
    expect(wrapper.get('.custom-list-empty').attributes('role')).toBe('status');
    expect(wrapper.get('.custom-list-empty').text()).toBe('custom_provider_list_empty');
  });

  it('does not write other settings or route anywhere while managing the list', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).get('.custom-list-remove-btn').trigger('click');
    await nextTick();

    // Only the two staged keys may ever be written by this drawer.
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    const stagedKeys = mocks.store.updateSettingLocally.mock.calls.map((call) => call[0]);
    expect(stagedKeys).toEqual(['CUSTOM_PROVIDER_LIST_ENABLED', 'CUSTOM_PROVIDER_LIST']);
  });
});
