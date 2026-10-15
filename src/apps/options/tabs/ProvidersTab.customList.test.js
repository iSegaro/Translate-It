import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';
import { readFileSync } from 'node:fs';
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
    { id: 'googlev2', name: 'Google Translate', supported: true, features: ['translation', 'bulk'] },
    { id: 'edge', name: 'Microsoft Translator', supported: true, features: ['translation', 'bulk'] },
    { id: 'deepl', name: 'DeepL Translate', supported: true, features: ['translation', 'bulk'] },
    { id: 'openai', name: 'OpenAI GPT', supported: true, features: ['translation', 'bulk'] },
    { id: 'mock', name: 'Development Mock', supported: true, features: ['translation', 'bulk'] },
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

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../composables/useHighlightManager.js', () => ({
  useHighlightManager: () => ({
    highlightElement: vi.fn(),
    checkAndHighlight: vi.fn(),
  }),
}));

vi.mock('@/features/settings/utils/providerValidator.js', () => ({
  getFirstMissingSetting: () => null,
  isProviderConfigured: () => true,
}));

// --- Additional boundary mocks only the real ProviderSelector touches ---

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => ({ selectedProvider: 'googlev2', ephemeralSync: {} }),
}));

vi.mock('@/core/helpers.js', () => ({ openOptionsPage: vi.fn() }));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}));

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({
    isSelectModeActive: ref(false),
    deactivateSelectMode: vi.fn(),
  }),
}));

vi.mock('@/components/shared/IconButton.vue', () => ({
  default: { template: '<span class="icon-button-stub"/>' },
}));

vi.mock('@iconify/vue', () => ({
  Icon: { props: ['icon'], template: '<span class="icon-stub" :data-icon="icon"/>' },
}));

vi.mock('webextension-polyfill', () => ({ default: {} }));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: () => false,
    handleContextError: vi.fn(),
    isContentScript: () => false,
    safeGetURL: (path) => path,
    GENERIC_FALLBACK_ICON: 'fallback.svg',
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Field: 'field',
    Select_Element: 'select-element',
    Selection: 'selection',
    Page: 'page',
    MouseHover: 'mouse-hover',
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { UI: 'ui', MEMORY: 'memory' } }));

// Real-bridge resource tracker: binds actual listeners so Teleport/Teleport
// cleanup behavior is unmasked, and tears them down on component unmount.
const trackedListeners = [];
vi.mock('@/composables/core/useResourceTracker.js', async () => {
  const { onUnmounted } = await import('vue');
  return {
    useResourceTracker: () => {
      const owned = [];
      onUnmounted(() => {
        owned.forEach(({ target, event, listener, options }) => {
          target.removeEventListener(event, listener, options);
          const index = trackedListeners.findIndex((entry) => entry.listener === listener);
          if (index !== -1) trackedListeners.splice(index, 1);
        });
      });
      return {
        addEventListener: (target, event, listener, options) => {
          target.addEventListener(event, listener, options);
          owned.push({ target, event, listener, options });
          trackedListeners.push({ target, event, listener, options });
        },
        track: vi.fn(),
        cleanup: vi.fn(),
      };
    },
  };
});

const flushTicks = async () => { await nextTick(); await nextTick(); };

describe('ProvidersTab custom provider list drawer (staged semantics)', () => {
  let wrapper;
  let focusSpy;

  const mountTab = () => shallowMount(ProvidersTab, {
    attachTo: document.body,
    global: {
      stubs: {
        ProviderSelector: {
          props: ['modelValue', 'selectionOnly', 'excludeIds', 'mode', 'isGlobal', 'ignoreHidden'],
          emits: ['update:modelValue'],
          template: `<select class="picker-stub" :value="modelValue" aria-controls="picker-menu-test" :data-exclude-ids="(excludeIds || []).join(',')" @change="$emit('update:modelValue', $event.target.value)"><option value=""/><option value="googlev2"/><option value="edge"/><option value="deepl"/><option value="openai"/></select>`,
        },
        BaseButton: { template: '<button v-bind="$attrs"><slot/></button>' },
        BaseCheckbox: {
          props: ['modelValue', 'label'],
          template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"><span>{{ label }}</span></label>',
        },
        Transition: { template: '<div><slot/></div>' },
      },
    },
  });

  const enableList = async () => {
    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(true);
    await nextTick();
  };

  const openDrawer = async () => {
    await enableList();
    await wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').trigger('click');
    await nextTick();
  };

  const entriesOf = () => wrapper.findAll('.custom-list-entry');

  beforeEach(() => {
    // reactive store settings: plain patches by the store mock must reach
    // the component's computed getters.
    mocks.store.settings = reactive({
      TRANSLATION_API: 'googlev2',
      CUSTOM_PROVIDER_LIST_ENABLED: false,
      CUSTOM_PROVIDER_LIST: [],
      HIDDEN_PROVIDERS: [],
      DEBUG_MODE: false,
    });
    mocks.isRTL = 'false';
    mocks.store.activeConfigProvider = 'test-provider';
    mocks.store.updateSettingLocally.mockReset();
    // Store-mirroring implementation so staged keys behave like the real store.
    mocks.store.updateSettingLocally.mockImplementation((key, value) => {
      mocks.store.settings[key] = value;
    });
    // Spy through so focus() still works, but its options are observable.
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  });

  afterEach(() => {
    focusSpy?.mockRestore();
    focusSpy = null;
    document.getElementById('picker-menu-test')?.remove();
    wrapper?.unmount();
    wrapper = null;
  });

  // --- Row: checkbox staging outside the drawer + animated Manage button ---

  it('renders the row checkbox with its description; the Manage button starts hidden and inert', async () => {
    wrapper = mountTab();
    await nextTick();

    const row = wrapper.get('#CUSTOM_PROVIDER_LIST');
    const checkbox = row.get('#CUSTOM_PROVIDER_LIST_ENABLED input');
    expect(checkbox.element.checked).toBe(false);
    // The visible label comes from the list label key (enable-specific label
    // removed), and the description line lives under the checkbox.
    expect(row.text()).toContain('custom_provider_list_label');
    expect(row.get('.custom-list-row-desc').text()).toBe('custom_provider_list_description');

    const manageWrapper = row.get('.custom-list-manage-wrapper');
    expect(manageWrapper.classes()).not.toContain('open');
    // Closed wrapper is out of the focus/a11y tree: inert.
    expect(manageWrapper.element.hasAttribute('inert')).toBe(true);
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
  });

  it('stages the enabled state immediately from the row checkbox (outside the drawer)', async () => {
    wrapper = mountTab();
    await nextTick();

    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(true);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST_ENABLED', true);
    expect(mocks.store.settings.CUSTOM_PROVIDER_LIST_ENABLED).toBe(true);
    // No drawer interaction needed for the toggle staging; list stays intact.
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());

    const manageWrapper = wrapper.get('.custom-list-manage-wrapper');
    expect(manageWrapper.classes()).toContain('open');
    expect(manageWrapper.element.hasAttribute('inert')).toBe(false);
    expect(manageWrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element.disabled).toBe(false);

    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(false);
    expect(mocks.store.updateSettingLocally).toHaveBeenLastCalledWith('CUSTOM_PROVIDER_LIST_ENABLED', false);
    expect(wrapper.get('.custom-list-manage-wrapper').classes()).not.toContain('open');
    expect(wrapper.get('.custom-list-manage-wrapper').element.hasAttribute('inert')).toBe(true);
  });

  it('restores focus to the row checkbox when the Manage button animates away under focus', async () => {
    wrapper = mountTab();
    await nextTick();
    await enableList();

    const manageBtn = wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element;
    manageBtn.focus();
    expect(document.activeElement).toBe(manageBtn);

    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(false);
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').element);
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('matches the FAB reveal animation timings (translate/scale/max-width/RTL opposite)', () => {
    const scss = readFileSync('src/apps/options/tabs/ProvidersTab.scss', 'utf8');
    // Reveal/easing beats copied from activation .fab-mode-select-wrapper.
    expect(scss).toContain('transform: translateX(-10px) scale(0.95)');
    expect(scss).toContain('transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)');
    expect(scss).toContain('transform: translateX(0) scale(1)');
    expect(scss).toContain('max-width: 0');
    // RTL closed state flips the offset direction.
    expect(scss).toContain('.rtl .custom-list-manage-wrapper:not(.open) {\n  transform: translateX(10px) scale(0.95);\n}');
    // Manage button token parity with .manage-rules-button.
    expect(scss).toContain('box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05)');
    expect(scss).toContain('box-shadow: 0 0 0 2px var(--color-border-light, rgba(0, 0, 0, 0.05))');
  });

  it('gives the Manage button reference cascade priority (!important parity with .manage-rules-button)', () => {
    const scss = readFileSync('src/apps/options/tabs/ProvidersTab.scss', 'utf8');
    // BaseButton.scss publishes .ti-btn/--primary/--sm values with !important
    // AFTER this file: the Manage button overrides must carry the same
    // priority or dark/bg/focus/dimensions diverge from the FAB reference.
    const manageBlock = scss.slice(
      scss.indexOf('.manage-list-button {'),
      scss.indexOf('.custom-list-row-desc'),
    );
    expect(manageBlock).toContain('background-color: var(--color-background-alt, var(--color-surface)) !important');
    expect(manageBlock).toContain('border: 1px solid var(--color-border) !important');
    expect(manageBlock).toContain('padding: 4px $spacing-sm !important');
    expect(manageBlock).toContain('height: 34px !important');
    expect(manageBlock).toContain('color: var(--color-text) !important');
    expect(manageBlock).toContain('box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05) !important');
    // Hover + focus treatments also outrank the primary-variant rules.
    expect(manageBlock).toContain('background-color: var(--color-background) !important');
    expect(manageBlock).toContain('box-shadow: 0 0 0 2px var(--color-border-light, rgba(0, 0, 0, 0.05)) !important');
    expect(manageBlock).toContain('outline: none !important');
  });

  // --- Drawer dialog semantics (unchanged) ---

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

  it('Escape that the picker already handled must not close the drawer', async () => {
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Selection-only picker Escape is defaultPrevented before bubbling here.
    const menuEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    menuEscape.preventDefault();
    window.dispatchEvent(menuEscape);
    await nextTick();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(true);

    // An unchanged Escape closes the drawer.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
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
    // No mounted drawer to disturb: dispatches must be no-ops and harmless.
    expect(document.querySelector('#CUSTOM_PROVIDER_LIST_DRAWER')).toBeNull();
    expect(document.activeElement?.id).toBe('');
  });

  it('applies the rtl class to the drawer when the locale is RTL', async () => {
    mocks.isRTL = 'true';
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').classes()).toContain('rtl');
  });

  // --- Staged draft semantics (IDs only) ---

  it('snapshots the store list into the draft on each opening', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const values = entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    expect(values).toEqual(['deepl', 'openai']);

    // Closing never stages; reopening always reads from the store again.
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-close-btn').trigger('click');
    await nextTick();
    await nextTick();
    mocks.store.updateSettingLocally.mockClear();
    mocks.store.updateSettingLocally.mockImplementation((key, value) => {
      mocks.store.settings[key] = value;
    });

    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['openai'];
    await openDrawer();
    expect(entriesOf()).toHaveLength(1);
  });

  it('deduplicates imported IDs in first-occurrence order while keeping unavailable IDs editable', async () => {
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

  it('Done stages ONLY the ordered provider ids; the enable key is never written by the drawer', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Ignore the staging the row checkbox itself performed.
    mocks.store.updateSettingLocally.mockClear();

    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.store.updateSettingLocally).toHaveBeenCalledTimes(1);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['deepl']);
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST_ENABLED', expect.anything());
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('Close/overlay/Escape discards only this opening draft without staging', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).get('.custom-list-remove-btn').trigger('click');
    await nextTick();
    // discard via overlay
    await wrapper.get('.custom-list-overlay').trigger('click');
    await nextTick();
    await nextTick();

    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());

    // Reopening reflects the untouched store: both entries back.
    await openDrawer();
    expect(entriesOf()).toHaveLength(2);
  });

  // --- Picker-driven add flow ---

  it('passes excludeIds to the picker and stages adds through Add', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Host passes the current draft as exclude-ids (v-model equivalent).
    expect(wrapper.get('.custom-list-add-picker.picker-stub').attributes('data-exclude-ids')).toBe('deepl');

    await wrapper.get('.custom-list-add-picker.picker-stub').setValue('googlev2');
    // aria-disabled (not the disabled attr): the button stays the keyboard
    // Tab-boundary target from the teleported menu even when not actionable.
    expect(wrapper.get('.custom-list-add-btn').attributes('aria-disabled')).toBeUndefined();
    await wrapper.get('.custom-list-add-btn').trigger('click');
    await nextTick();
    expect(entriesOf().at(1).get('.custom-list-entry-name').attributes('title')).toBe('googlev2');
    // Selection resets to empty so the next choice stays explicit.
    expect(wrapper.get('.custom-list-add-picker.picker-stub').element.value).toBe('');
    expect(wrapper.get('.custom-list-add-btn').attributes('aria-disabled')).toBe('true');
    expect(wrapper.get('.custom-list-add-btn').classes()).toContain('custom-list-add-btn--pending');
    // Draft-local: nothing staged until Done.
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());
    expect(wrapper.get('.custom-list-add-picker.picker-stub').attributes('data-exclude-ids')).toBe('deepl,googlev2');
  });

  it('guard rejects a stale or already-listed candidate at Add and resets the selection', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Already listed: picker should not offer it (excludeIds), but a stale
    // selection must also be rejected defensively.
    await wrapper.get('.custom-list-add-picker.picker-stub').setValue('deepl');
    await wrapper.get('.custom-list-add-btn').trigger('click');
    await nextTick();
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());
    expect(wrapper.get('.custom-list-add-picker.picker-stub').element.value).toBe('');

    // Hidden while the menu is assumed open: registry eligibility check fails.
    await wrapper.get('.custom-list-add-picker.picker-stub').setValue('edge');
    mocks.store.settings.HIDDEN_PROVIDERS = ['edge'];
    await wrapper.get('.custom-list-add-btn').trigger('click');
    await nextTick();
    // The checkbox's own ENABLED staging is unrelated; the list key is untouched.
    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());
    expect(wrapper.get('.custom-list-add-picker.picker-stub').element.value).toBe('');
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
    expect(wrapper.findAll('.custom-list-entry-tag')).toHaveLength(3);

    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith(
      'CUSTOM_PROVIDER_LIST',
      ['edge', 'legacy-provider', 'mock'],
    );
  });

  // --- Reorder: keyboard and drag & drop ---

  it('Move Up/Down reorder the draft without staging', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai', 'googlev2'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rowValues = () => entriesOf().map((entry) => entry.get('.custom-list-entry-name').attributes('title'));
    expect(rowValues()).toEqual(['deepl', 'openai', 'googlev2']);

    expect(entriesOf().at(0).findAll('.custom-list-move-btn').at(0).element.disabled).toBe(true);
    expect(entriesOf().at(2).findAll('.custom-list-move-btn').at(1).element.disabled).toBe(true);

    await entriesOf().at(1).findAll('.custom-list-move-btn').at(0).trigger('click');
    await nextTick();
    expect(rowValues()).toEqual(['openai', 'deepl', 'googlev2']);

    await entriesOf().at(1).findAll('.custom-list-move-btn').at(1).trigger('click');
    await nextTick();
    expect(rowValues()).toEqual(['openai', 'googlev2', 'deepl']);

    expect(mocks.store.updateSettingLocally).not.toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', expect.anything());
  });

  it('persists the reordered draft on Done and keeps it after disable', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    await entriesOf().at(0).findAll('.custom-list-move-btn').at(1).trigger('click');
    // Disabling from the row legitimately stages the enabled state; the
    // drawer must add no write of its own for that key.
    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(false);
    mocks.store.updateSettingLocally.mockClear();
    mocks.store.updateSettingLocally.mockImplementation((key, value) => {
      mocks.store.settings[key] = value;
    });
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await nextTick();

    expect(mocks.store.updateSettingLocally).toHaveBeenCalledTimes(1);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['openai', 'deepl']);
    // Disabled state preserved the saved order verbatim.
    expect(mocks.store.settings.CUSTOM_PROVIDER_LIST).toEqual(['openai', 'deepl']);
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

  it('names each row\'s move and remove buttons after its provider', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'legacy-provider'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const rows = entriesOf();
    expect(rows).toHaveLength(2);
    expect(rows.at(0).findAll('.custom-list-move-btn').at(0).attributes('aria-label'))
      .toBe('custom_provider_list_move_up_label: DeepL Translate');
    expect(rows.at(0).findAll('.custom-list-move-btn').at(1).attributes('aria-label'))
      .toBe('custom_provider_list_move_down_label: DeepL Translate');
    expect(rows.at(0).get('.custom-list-remove-btn').attributes('aria-label'))
      .toBe('custom_provider_list_remove_label: DeepL Translate');
    expect(rows.at(1).findAll('.custom-list-move-btn').at(0).attributes('aria-label'))
      .toBe('custom_provider_list_move_up_label: legacy-provider');
    expect(rows.at(1).get('.custom-list-remove-btn').attributes('aria-label'))
      .toBe('custom_provider_list_remove_label: legacy-provider');
  });

  it('renders the remove control as a MaskIcon trash like the FAB drawer', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl', 'openai'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    for (const row of entriesOf()) {
      // shallowMount auto-stub exposes the bound props as attributes.
      const icon = row.get('.custom-list-remove-btn').get('mask-icon-stub');
      const src = icon.attributes('src') ?? '';
      expect(src.includes('trash') || src.startsWith('data:')).toBe(true);
      expect(icon.attributes('size')).toBe('14');
    }
  });

  // --- Dialog-local Tab boundary (menu teleports inside the dialog) ---

  it('redirects Tab between the picker menu and the picker row controls inside the dialog', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    // Synthetic stand-in for the picker's dialog-teleported menu: a direct
    // child of the drawer element (identity via the stub trigger's
    // aria-controls). Keys are dispatched on the menu nodes so they bubble
    // through the dialog exactly like real keyboard input.
    const drawerEl = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').element;
    const menu = document.createElement('div');
    menu.id = 'picker-menu-test';
    const firstItem = document.createElement('button');
    firstItem.textContent = 'first menu item';
    const lastItem = document.createElement('button');
    lastItem.textContent = 'last menu item';
    menu.append(firstItem, lastItem);
    drawerEl.append(menu);

    lastItem.focus();
    expect(drawerEl.contains(lastItem)).toBe(true);
    lastItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('.custom-list-add-btn').element);

    firstItem.focus();
    firstItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('.custom-list-add-picker.picker-stub').element);
  });

  it('wraps Shift+Tab from the close button into an open menu and preserves the closed wrap', async () => {
    mocks.store.settings.CUSTOM_PROVIDER_LIST = ['deepl'];
    wrapper = mountTab();
    await nextTick();
    await openDrawer();

    const drawer = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER');
    const drawerEl = drawer.element;
    const closeBtn = drawer.get('.custom-list-close-btn');
    const doneBtn = drawer.get('.custom-list-drawer-footer button');

    // Menu open: Tab at Done must flow into the trailing menu (no wrap kill);
    // jsdom cannot traverse focus natively, so the observable contract is
    // that the handler does not hijack the flow.
    const menu = document.createElement('div');
    menu.id = 'picker-menu-test';
    const firstItem = document.createElement('button');
    menu.append(firstItem);
    drawerEl.append(menu);
    doneBtn.element.focus();
    doneBtn.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await nextTick();
    // No hijack: focus untouched by the trap (a real browser moves into the
    // menu natively; the handler must not preventDefault here).
    expect(document.activeElement).toBe(doneBtn.element);

    // Shift+Tab from the close button wraps to the open menu's last control
    // and is consumed by the trap (no double movement afterwards).
    closeBtn.element.focus();
    const wrapEvt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    closeBtn.element.dispatchEvent(wrapEvt);
    await nextTick();
    expect(wrapEvt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstItem);
    // (The plain close ⇄ Done wrap with the menu closed is asserted by the
    // 'traps Tab and Shift+Tab at the drawer edges' tests above.)
  });
});

// ---------------------------------------------------------------------------
// Real ProviderSelector integration: no stub for the picker component — the
// menu teleports INTO the drawer dialog via the host-passed
// menuTeleportTarget (selector-side prop), so containment, focus flow and
// cleanup are asserted on the actual DOM, not synthetic stand-ins.
// ---------------------------------------------------------------------------
describe('ProvidersTab drawer with the real ProviderSelector picker', () => {
  const getAllViewportRects = () => ({
    width: 240,
    height: 40,
    top: 120,
    left: 40,
    right: 280,
    bottom: 160,
    x: 40,
    y: 120,
    toJSON: () => {},
  });

  let wrapper;
  let rectSpy;

  const mountReal = () => mount(ProvidersTab, {
    attachTo: document.body,
    global: {
      stubs: {
        // Real BaseButton keeps the real variant classes (outline parity
        // assertions rely on them).
        Transition: { template: '<div><slot/></div>' },
      },
    },
  });

  const openRealDrawer = async () => {
    await wrapper.get('#CUSTOM_PROVIDER_LIST_ENABLED input').setValue(true);
    await wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').trigger('click');
    await flushTicks();
  };

  const openPicker = async () => {
    await wrapper.get('.custom-list-add-row .ti-provider-button').trigger('click');
    await flushTicks();
  };

  const menuEl = () => document.querySelector('.ti-provider-dropdown-menu');

  const rowButtonFor = (name) => Array.from(menuEl().querySelectorAll('.ti-dropdown-item-btn'))
    .find((button) => button.textContent.includes(name));

  beforeEach(() => {
    // reactive store settings: plain patches by the store mock must reach
    // the component's computed getters.
    mocks.store.settings = reactive({
      TRANSLATION_API: 'googlev2',
      CUSTOM_PROVIDER_LIST_ENABLED: false,
      CUSTOM_PROVIDER_LIST: [],
      HIDDEN_PROVIDERS: [],
      DEBUG_MODE: false,
    });
    mocks.store.updateSettingLocally.mockReset();
    mocks.store.updateSettingLocally.mockImplementation((key, value) => {
      mocks.store.settings[key] = value;
    });
    // jsdom rects are zero: the trigger/menu geometry needs a stable box so
    // the teleported menu survives its own positioning pass.
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(getAllViewportRects);
  });

  afterEach(() => {
    rectSpy?.mockRestore();
    rectSpy = null;
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders the Manage button without the outline variant (Activation parity)', async () => {
    wrapper = mountReal();
    // Disabled state: the real BaseButton classes are still observable.
    const closedButton = wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN');
    expect(closedButton.classes()).toContain('ti-btn');
    expect(closedButton.classes()).not.toContain('ti-btn--outline');
    expect(closedButton.classes()).toContain('ti-btn--primary');

    await openRealDrawer();
    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').classes()).not.toContain('ti-btn--outline');
  });

  it('teleports the selection-only menu into the dialog (never body/scroll area) with focus inside', async () => {
    wrapper = mountReal();
    await openRealDrawer();

    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').attributes('role')).toBe('dialog');
    // selection-only: no Default synthetic entry, flat registry order.
    await openPicker();

    const menu = menuEl();
    expect(menu).toBeTruthy();
    expect(menu.classList.contains('ti-provider-dropdown-menu')).toBe(true);
    const drawerEl = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').element;
    // Dialog-level containment: the menu is inside the dialog subtree.
    expect(drawerEl.contains(menu)).toBe(true);
    // …but outside the scrollable body (absolute positioning vs the dialog).
    expect(drawerEl.querySelector('.custom-list-drawer-body').contains(menu)).toBe(false);
    // …and never parked directly under <body>.
    expect(Array.from(document.body.children).includes(menu)).toBe(false);
    const items = Array.from(menu.querySelectorAll('.ti-dropdown-item-btn'));
    expect(items.map((b) => b.textContent.trim())).toEqual(
      expect.arrayContaining(['Google Translate', 'DeepL Translate']),
    );
    expect(document.querySelector('.ti-dropdown-item-btn.ti-active')).toBeNull();
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(drawerEl.contains(document.activeElement)).toBe(true);
  });

  it('select → Add stages the id in the draft, resets the picker, and Done writes ids only', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();

    await rowButtonFor('DeepL').click();
    await flushTicks();
    expect(menuEl()).toBeNull();
    const addBtn = wrapper.get('.custom-list-add-btn');
    expect(addBtn.attributes('aria-disabled')).toBeUndefined();
    await addBtn.trigger('click');
    await flushTicks();

    // Picker resets to the empty selection (Add enters the pending state).
    expect(addBtn.attributes('aria-disabled')).toBe('true');
    // Draft-local: nothing staged; the enable key stays owned by the row
    // checkbox, so drawer ops must not write it.
    expect(mocks.store.updateSettingLocally.mock.calls
      .some(([key]) => key === 'CUSTOM_PROVIDER_LIST')).toBe(false);

    // Second pick: the excluded first choice is gone from the menu.
    await openPicker();
    const names = Array.from(menuEl().querySelectorAll('.ti-dropdown-item-btn')).map((b) => b.textContent.trim());
    expect(names).not.toContain('DeepL Translate');
    expect(names).toContain('OpenAI GPT');
    await rowButtonFor('OpenAI').click();
    await flushTicks();
    await wrapper.get('.custom-list-add-btn').trigger('click');
    await flushTicks();

    mocks.store.updateSettingLocally.mockClear();
    mocks.store.updateSettingLocally.mockImplementation((key, value) => {
      mocks.store.settings[key] = value;
    });
    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await flushTicks();

    expect(mocks.store.updateSettingLocally).toHaveBeenCalledTimes(1);
    expect(mocks.store.updateSettingLocally).toHaveBeenCalledWith('CUSTOM_PROVIDER_LIST', ['deepl', 'openai']);
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('menu Escape closes only the menu; the next Escape closes the drawer', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();

    menuEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushTicks();
    // Selection-only Escape is stopped before the window handler: menu only.
    expect(menuEl()).toBeNull();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushTicks();
    await flushTicks();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('real Tab from the last menu row lands on Add; Shift+Tab from the first row returns to the trigger', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();

    const menu = menuEl();
    const rows = Array.from(menu.querySelectorAll('.ti-dropdown-item-btn'));
    // Selection-only renders no star/sync/configure footer; the rows are all
    // menu controls (last row falls back to the configure row for older
    // selector visuals).
    const lastControl = menu.querySelector('.ti-configure-row') ?? rows[rows.length - 1];

    // Real keyboard path: keydown bubbles from the menu node through the
    // dialog, where the drawer's Tab trap redirects it. (Selection-only
    // Escape/Tab from here is the actual user path, not a synthetic focus hop.)
    lastControl.focus();
    expect(document.activeElement).toBe(lastControl);
    lastControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await flushTicks();
    expect(document.activeElement).toBe(wrapper.get('.custom-list-add-btn').element);

    // Reopen and Shift+Tab from the first row returns to the trigger the same
    // way.
    await openPicker();
    const reopened = menuEl();
    const firstRow = reopened.querySelector('.ti-dropdown-item-btn');
    firstRow.focus();
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    await flushTicks();
    expect(document.activeElement).toBe(wrapper.get('.custom-list-add-row .ti-provider-button').element);
    // The redirected focus left the (now closed) menu: no leaked node.
    expect(document.querySelector('.ti-provider-dropdown-menu')).toBeNull();
  });

  it('consumes the drawer Shift+Tab wrap (menu closed) and leaves reverse Tab from Done native', async () => {
    wrapper = mountReal();
    await openRealDrawer();

    const closeBtn = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-close-btn');
    const doneBtn = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button');

    // The reachable real-state backward wrap (menu closed after any focus
    // hop): Shift+Tab from the drawer's FIRST control is consumed before it
    // manually focuses the footer Done — the preventDefault stops the browser
    // from moving focus a second time.
    closeBtn.element.focus();
    const wrapEvt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    closeBtn.element.dispatchEvent(wrapEvt);
    await flushTicks();
    expect(wrapEvt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(doneBtn.element);

    // Reverse Tab from Done is the browser's backward traversal: the trap
    // must not hijack it (no preventDefault; jsdom cannot traverse natively,
    // so the observable contract is an untouched event and focus).
    doneBtn.element.focus();
    const reverseEvt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    doneBtn.element.dispatchEvent(reverseEvt);
    await flushTicks();
    expect(reverseEvt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(doneBtn.element);
  });

  it('overlay click dismisses the open menu and the drawer together', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();
    expect(menuEl()).toBeTruthy();

    await wrapper.get('.custom-list-overlay').trigger('click');
    await flushTicks();

    expect(menuEl()).toBeNull();
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('scrolling the drawer body keeps the menu open, contained, and does not crash', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();
    expect(menuEl()).toBeTruthy();

    // The menu lives at the dialog level, outside the scrollable body; the
    // drawer must survive its bagpipe scroll event with the menu intact.
    // Coordinate/viewport clamping remains the selector visual lane's scope.
    const drawerEl = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').element;
    wrapper.get('.custom-list-drawer-body').element.dispatchEvent(new Event('scroll', { bubbles: true }));
    await flushTicks();
    expect(menuEl()).toBeTruthy();
    expect(drawerEl.contains(menuEl())).toBe(true);
    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(true);
  });

  it('Done with the menu open closes drawer and menu without leaking the teleported node', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();
    const menu = menuEl();
    expect(menu).toBeTruthy();
    expect(wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER').element.contains(menu)).toBe(true);

    await wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button').trigger('click');
    await flushTicks();

    expect(wrapper.find('#CUSTOM_PROVIDER_LIST_DRAWER').exists()).toBe(false);
    // The menu was a dialog child: removing the dialog removes it too — no
    // orphan parked under <body>.
    expect(document.querySelector('.ti-provider-dropdown-menu')).toBeNull();
    expect(Array.from(document.body.children).some((el) => el.classList.contains('ti-provider-dropdown-menu'))).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#CUSTOM_PROVIDER_LIST_MANAGE_BTN').element);
  });

  it('removes the teleported menu and listener wiring on unmount', async () => {
    wrapper = mountReal();
    await openRealDrawer();
    await openPicker();
    expect(menuEl()).toBeTruthy();

    const bottom = wrapper.get('#CUSTOM_PROVIDER_LIST_DRAWER .custom-list-drawer-footer button');
    wrapper.unmount();
    wrapper = null;
    await flushTicks();

    expect(document.querySelector('.ti-provider-dropdown-menu')).toBeNull();
    // Late Escape after unmount: no drawer, no observer error.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushTicks();
    expect(document.activeElement).not.toBe(bottom.element);
  });
});
