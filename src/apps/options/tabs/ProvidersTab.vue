<template>
  <section class="options-tab-content providers-tab">
    <div class="settings-container">
      <h2>{{ t('providers_tab_title') || 'Service Settings' }}</h2>

      <!-- Service Selection -->
      <div
        id="PROVIDERS_CONFIGURE_SECTION"
        class="setting-group primary-service-selection"
      >
        <label>{{ t('providers_configure_label') || 'Provider to configure' }}</label>
        <div class="selector-wrapper">
          <ProviderSelector 
            v-model="selectedProvider" 
            mode="button"
            :is-global="false"
            ignore-hidden
          />
        </div>
      </div>

      <div class="api-settings-section">
        <!-- Custom Provider List row.
             Deliberately a plain row (no toggle gating): the list is managed
             in its drawer even while the list itself is off. -->
        <div
          id="CUSTOM_PROVIDER_LIST"
          class="setting-group custom-provider-list-row"
        >
          <div class="custom-list-row-main">
            <div class="custom-list-row-info">
              <label class="custom-list-row-label">{{ t('custom_provider_list_label') || 'Custom Provider List' }}</label>
              <span class="custom-list-row-desc">
                {{ t('custom_provider_list_description') || 'Choose providers that appear together in the Custom List category.' }}
              </span>
            </div>
            <div class="custom-list-row-control">
              <BaseButton
                id="CUSTOM_PROVIDER_LIST_MANAGE_BTN"
                class="manage-list-button"
                variant="outline"
                @click="openCustomListDrawer"
              >
                {{ t('custom_provider_list_manage_btn') || 'Manage List' }}
              </BaseButton>
            </div>
          </div>
        </div>

        <div class="provider-settings-container">
          <Transition 
            name="fade-slide" 
            mode="out-in"
          >
            <div 
              :key="selectedProvider"
              class="provider-settings"
            >
              <!-- Optimization Level Section -->
              <template v-if="!isAutoLanguageProvider">
                <div 
                  id="OPTIMIZATION_LEVELS_SECTION"
                  class="optimization-control-area"
                >
                  <div class="opt-control-group">
                    <div class="label-with-value">
                      <label class="opt-label">{{ t('optimization_level_label') || 'Translation Strategy (Speed vs. Cost)' }}</label>
                      <span
                        class="level-badge"
                        :class="'level-' + currentOptimizationLevel"
                      >
                        {{ t('optimization_level_' + currentOptimizationLevel) || 'Level ' + currentOptimizationLevel }}
                      </span>
                    </div>
                  
                    <div class="slider-wrapper">
                      <input 
                        v-model.number="currentOptimizationLevel" 
                        type="range" 
                        min="1" 
                        max="5"
                        class="ti-range-slider"
                      >
                      <div class="slider-labels">
                        <span @click="currentOptimizationLevel = 1">{{ isAIProvider ? t('opt_economy') || 'Economy' : t('opt_stable') || 'Stable' }}</span>
                        <span
                          class="slider-tick"
                          @click="currentOptimizationLevel = 2"
                        >|</span>
                        <span @click="currentOptimizationLevel = 3">{{ t('opt_balanced') || 'Balanced' }}</span>
                        <span
                          class="slider-tick"
                          @click="currentOptimizationLevel = 4"
                        >|</span>
                        <span @click="currentOptimizationLevel = 5">{{ isAIProvider ? t('opt_turbo') || 'Turbo' : t('opt_fast') || 'Fast' }}</span>
                      </div>
                    </div>
                  
                    <p class="opt-description">
                      {{ isAIProvider 
                        ? t('optimization_description_ai') 
                        : t('optimization_description_traditional') 
                      }}
                    </p>
                  </div>
                </div>

                <div class="section-separator mini" />
              </template>

              <div
                v-if="selectedProviderInfo && !providerSettingsComponent"
                class="api-info"
              >
                <h3>{{ t(selectedProviderInfo.titleKey) || selectedProviderInfo.displayName }}</h3>
                <p class="setting-description">
                  {{ t(selectedProviderInfo.descriptionKey) }}
                </p>
              </div>

              <component :is="providerSettingsComponent" />

              <div 
                id="HIDDEN_PROVIDERS_CHECKBOX" 
                class="setting-group vertical provider-visibility-group"
              >
                <BaseCheckbox
                  v-model="showInList"
                  :label="t('show_provider_in_list_label') || 'Show in provider list'"
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Custom Provider List slide-out Drawer.
         Staged-draft semantics (mirrors the Auto Page Rules drawer): opening
         snapshots the store, Done stages both keys via updateSettingLocally,
         and close/overlay/Escape discards this opening's draft. Only the
         existing Options Save persists anything to storage. -->
    <Transition name="custom-list-fade">
      <div
        v-if="isCustomListDrawerOpen"
        class="custom-list-overlay"
        @click="closeCustomListDrawer"
      />
    </Transition>
    <Transition name="custom-list-slide">
      <div
        v-if="isCustomListDrawerOpen"
        id="CUSTOM_PROVIDER_LIST_DRAWER"
        ref="customListDrawerRef"
        class="custom-list-drawer"
        :class="{ 'rtl': isRTL }"
        role="dialog"
        aria-modal="true"
        :aria-label="t('custom_provider_list_group_label') || 'Custom Provider List'"
        @keydown="handleCustomListKeydown"
      >
        <div class="custom-list-drawer-header">
          <h3>{{ t('custom_provider_list_label') || 'Custom Provider List' }}</h3>
          <button
            type="button"
            class="custom-list-close-btn"
            :aria-label="t('window_close') || 'Close'"
            @click="closeCustomListDrawer"
          >
            ✕
          </button>
        </div>

        <div class="custom-list-drawer-body">
          <div
            id="CUSTOM_PROVIDER_LIST_ENABLED_GROUP"
            class="custom-list-enable"
          >
            <BaseCheckbox
              id="CUSTOM_PROVIDER_LIST_ENABLED"
              v-model="customListEnabledDraft"
              :label="t('custom_provider_list_enable_label') || 'Enable Custom Provider List'"
            />
            <span class="custom-list-drawer-desc">
              {{ t('custom_provider_list_enable_description') || 'When off, the selected providers stay saved so you can turn the list back on later.' }}
            </span>
          </div>

          <div class="custom-list-instruction">
            {{ t('custom_provider_list_instruction') || 'Drag rows to reorder, or move them with the arrow buttons.' }}
          </div>

          <div class="custom-list-add-row">
            <select
              v-model="customListAddSelection"
              class="custom-list-add-select"
              :aria-label="t('custom_provider_list_add_placeholder') || 'Add a provider…'"
            >
              <option value="">
                {{ t('custom_provider_list_add_placeholder') || 'Add a provider…' }}
              </option>
              <option
                v-for="candidate in customListAddCandidates"
                :key="candidate.id"
                :value="candidate.id"
              >
                {{ candidate.label }}
              </option>
            </select>
            <BaseButton
              class="custom-list-add-btn"
              variant="primary"
              size="sm"
              :disabled="!customListAddSelection"
              @click="addSelectedCustomProvider"
            >
              {{ t('custom_provider_list_add_btn') || 'Add' }}
            </BaseButton>
          </div>

          <div
            v-if="customListDraftIds.length === 0"
            class="custom-list-empty"
            role="status"
          >
            {{ t('custom_provider_list_empty') || 'No providers added yet.' }}
          </div>
          <ul
            v-else
            class="custom-list-entries"
          >
            <li
              v-for="(id, index) in customListDraftIds"
              :key="id"
              class="custom-list-entry"
              :class="{ 'is-dragging': isDraggingCustomListId === id, 'is-drag-over': isDragOverIndex === index }"
              draggable="true"
              @dragstart="onCustomListDragStart(id, $event)"
              @dragover.prevent="onCustomListDragOver(index)"
              @drop.prevent="onCustomListDrop(index)"
              @dragend="onCustomListDragEnd"
            >
              <span
                class="custom-list-grip"
                aria-hidden="true"
              >⋮⋮</span>
              <span
                class="custom-list-entry-name"
                :title="id"
              >
                {{ resolveCustomProviderLabel(id) || '' }}
                <span
                  v-if="!resolveCustomProviderLabel(id)"
                  class="custom-list-entry-raw"
                  dir="ltr"
                >{{ id }}</span>
              </span>
              <span
                v-if="!isCustomProviderSelectable(id)"
                class="custom-list-entry-tag"
              >
                {{ t('custom_provider_list_unavailable_tag') || 'Currently unavailable' }}
              </span>
              <div class="custom-list-entry-actions">
                <button
                  type="button"
                  class="custom-list-move-btn"
                  :disabled="index === 0"
                  :aria-label="`${t('custom_provider_list_move_up_label') || 'Move up'}: ${resolveCustomProviderLabel(id) || id}`"
                  @click="moveCustomListEntry(index, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="custom-list-move-btn"
                  :disabled="index === customListDraftIds.length - 1"
                  :aria-label="`${t('custom_provider_list_move_down_label') || 'Move down'}: ${resolveCustomProviderLabel(id) || id}`"
                  @click="moveCustomListEntry(index, 1)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="custom-list-remove-btn"
                  :aria-label="`${t('custom_provider_list_remove_label') || 'Remove from list'}: ${resolveCustomProviderLabel(id) || id}`"
                  @click="removeCustomListEntry(index)"
                >
                  <MaskIcon
                    :src="IconTrash"
                    :size="14"
                  />
                </button>
              </div>
            </li>
          </ul>
        </div>

        <div class="custom-list-drawer-footer">
          <div class="custom-list-drawer-footer-actions">
            <BaseButton
              variant="primary"
              size="sm"
              @click="saveAndCloseCustomListDrawer"
            >
              {{ t('custom_provider_list_done_btn') || 'Done' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import './ProvidersTab.scss'
import { onMounted, onUnmounted, computed, defineAsyncComponent, watch, ref, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { findProviderById, getProviderManifest } from '@/features/translation/providers/ProviderManifest.js'
import { getFirstMissingSetting } from '@/features/translation/utils/providerValidator.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useHighlightManager } from '../composables/useHighlightManager.js'
import { useProviderVisibility } from '../composables/useProviderVisibility.js'
import { getProvidersForDropdown, getProviderById } from '@/core/provider-registry.js'

// Components
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
// Trash asset for remove rows (ADR-001: shared mask component + currentColor)
import IconTrash from '@/icons/ui/trash-small.svg?url'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ProvidersTab')
const settingsStore = useSettingsStore()
const route = useRoute()
const { t } = useUnifiedI18n()
const { highlightElement } = useHighlightManager()

// Use the store-managed activeConfigProvider instead of a local ref.
// This allows the configuration state to persist across tab switches in the Options page,
// while remaining reactive to global TRANSLATION_API changes.
const selectedProvider = computed({
  get: () => settingsStore.activeConfigProvider,
  set: (val) => { settingsStore.activeConfigProvider = val }
})

// Route-driven switches skip the watcher's missing-setting highlight once:
// the URL highlight target owns the spotlight (fixes the compat-check
// first-load race where the watcher would steal it with CUSTOM_API_URL).
// Manual provider changes are unaffected; no timing dependence.
let suppressNextProviderMissingHighlight = false

// Auto-highlight missing settings when provider is changed manually
watch(selectedProvider, (newProvider) => {
  if (suppressNextProviderMissingHighlight) {
    suppressNextProviderMissingHighlight = false
    return
  }
  logger.debug(`[ProvidersTab] Local provider changed to ${newProvider}`);
  const missingKey = getFirstMissingSetting(newProvider, settingsStore.settings);
  if (missingKey) {
    // Increase timeout and use nextTick to allow async component loading and transition
    setTimeout(async () => {
      highlightElement(missingKey);
    }, 600);
  }
})

// Spotlight routing for non-persisted highlight targets. Explicit cases run
// first; required-setting keys fall back to the manifest lookup below.
// No validation or persisted-state change.
const resolveHighlightProvider = (highlightKey) => {
  if (highlightKey === 'CUSTOM_API_COMPATIBILITY_CHECK') return 'custom'
  return getProviderManifest().find(p => p.requiredSettings?.includes(highlightKey))?.id ?? null
}

// Reveal the provider panel for a highlight target. No-op when falsy,
// unmapped, or already active. Route-driven spotlight execution itself
// stays with OptionsLayout (sole owner of checkAndHighlight).
const revealProviderForHighlight = (highlightKey) => {
  if (!highlightKey) return
  const providerId = resolveHighlightProvider(highlightKey)
  if (!providerId || providerId === settingsStore.activeConfigProvider) return
  // The compat-check spotlight owns its highlight: suppress the watcher's
  // missing-setting highlight for this route-driven switch only. Set only
  // on an actual change, so a pre-active custom (no watcher fires) never
  // leaks the flag into a later manual change.
  if (highlightKey === 'CUSTOM_API_COMPATIBILITY_CHECK') {
    suppressNextProviderMissingHighlight = true
  }
  settingsStore.activeConfigProvider = providerId
}

// Reveal the matching provider for the current route highlight (if any).
onMounted(() => {
  revealProviderForHighlight(route.query.highlight)
})

// While-mounted navigations (e.g. a new ?highlight= while the tab is open)
// reveal their provider the same way.
watch(() => route.query.highlight, (highlightKey) => {
  revealProviderForHighlight(highlightKey)
})

// Provider Visibility logic
const { showInList } = useProviderVisibility(selectedProvider)

const currentOptimizationLevel = computed({
  get: () => settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS?.[selectedProvider.value] || settingsStore.settings?.OPTIMIZATION_LEVEL || 3,
  set: (val) => {
    const providerLevels = { ...(settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS || {}) }
    providerLevels[selectedProvider.value] = val
    settingsStore.updateSettingLocally('PROVIDER_OPTIMIZATION_LEVELS', providerLevels)
  }
})

const isAIProvider = computed(() => ['gemini', 'openai', 'openrouter', 'requesty', 'deepseek', 'webai', 'custom'].includes(selectedProvider.value))
const isAutoLanguageProvider = computed(() => selectedProviderInfo.value?.features?.includes('autoLanguage'))
const selectedProviderInfo = computed(() => findProviderById(selectedProvider.value))
const providerSettingsComponent = computed(() => {
  const p = selectedProvider.value
  const map = { gemini: 'Gemini', deepl: 'DeepL', browser: 'Browser', webai: 'WebAI', lingva: 'Lingva', openai: 'OpenAI', openrouter: 'OpenRouter', requesty: 'Requesty', deepseek: 'Deepseek', custom: 'Custom' }
  return map[p] ? defineAsyncComponent(() => import(`@/components/feature/api-settings/${map[p]}ApiSettings.vue`)) : null
})

// Validation feedback listener
const handleValidationFeedback = (e) => {
  const { field } = e.detail || {};
  
  if (!field) return;

  // 1. If it's a specific provider setting (e.g., DEEPL_API_KEY), 
  // check if we need to switch the active provider view first.
  if (field.includes('API') || field.includes('URL') || field.includes('MODEL')) {
    const manifest = getProviderManifest();
    const targetProvider = manifest.find(p => p.requiredSettings?.includes(field));
    
    if (targetProvider && targetProvider.id !== settingsStore.activeConfigProvider) {
      logger.debug(`[ProvidersTab] Switching view to ${targetProvider.id} to show error in ${field}`);
      settingsStore.activeConfigProvider = targetProvider.id;
    }
  }
  
  // 2. Perform highlight with a delay to ensure component is rendered
  if (field === 'provider' || field.includes('API') || field.includes('URL') || field.includes('MODEL')) {
    setTimeout(() => {
      highlightElement(field === 'provider' ? 'TRANSLATION_API' : field);
    }, 600);
  }
};

// --- Custom Provider List drawer (staged draft like the Auto Page Rules drawer) ---
const isCustomListDrawerOpen = ref(false)
const customListDrawerRef = ref(null)
const customListEnabledDraft = ref(false)
const customListDraftIds = ref([])
const customListAddSelection = ref('')
const isDraggingCustomListId = ref(null)
const isDragOverIndex = ref(-1)

// RTL check (same convention as OptionsApp/ActivationTab)
const isRTL = computed(() => {
  try {
    return t('IsRTL') === 'true'
  } catch {
    return false
  }
})

// Add-source eligibility: supported registry metadata with the same debug
// gating as the selectors, minus providers hidden from lists. Stored ids are
// never dropped from the draft, even when they become ineligible — they are
// displayed with their name (or raw id) and an "unavailable" tag until the
// user removes them.
const isCustomProviderSelectable = (id) => {
  const settings = settingsStore.settings || {}
  const hidden = settings.HIDDEN_PROVIDERS || []
  return getProvidersForDropdown(settings.DEBUG_MODE || false)
    .some(provider => provider.id === id && !hidden.includes(id))
}

const resolveCustomProviderLabel = (id) => getProviderById(id)?.name || ''

const customListAddCandidates = computed(() => {
  const selected = new Set(customListDraftIds.value)
  return getProvidersForDropdown(settingsStore.settings?.DEBUG_MODE || false)
    .filter(provider => !selected.has(provider.id))
    .filter(provider => isCustomProviderSelectable(provider.id))
    .map(provider => ({ id: provider.id, label: provider.name }))
})

const openCustomListDrawer = () => {
  const settings = settingsStore.settings || {}
  const storedIds = Array.isArray(settings.CUSTOM_PROVIDER_LIST) ? settings.CUSTOM_PROVIDER_LIST : []
  customListEnabledDraft.value = settings.CUSTOM_PROVIDER_LIST_ENABLED === true
  customListDraftIds.value = [...new Set(storedIds.filter(id => typeof id === 'string'))]
  customListAddSelection.value = ''
  isCustomListDrawerOpen.value = true
  nextTick(() => {
    customListDrawerRef.value?.querySelector('.custom-list-close-btn')?.focus({ preventScroll: true })
  })
}

// Close and Done both return focus to the Manage List row; only Done writes.
const refocusCustomListManageButton = () => {
  document.getElementById('CUSTOM_PROVIDER_LIST_MANAGE_BTN')?.focus({ preventScroll: true })
}

const closeCustomListDrawer = () => {
  if (!isCustomListDrawerOpen.value) return
  isCustomListDrawerOpen.value = false
  nextTick(refocusCustomListManageButton)
}

const saveAndCloseCustomListDrawer = () => {
  settingsStore.updateSettingLocally('CUSTOM_PROVIDER_LIST_ENABLED', customListEnabledDraft.value)
  settingsStore.updateSettingLocally('CUSTOM_PROVIDER_LIST', [...customListDraftIds.value])
  isCustomListDrawerOpen.value = false
  nextTick(refocusCustomListManageButton)
}

// Shared focus recovery after a row disappears: focus the replacing row's
// remove button (or the footer Done when the list emptied) — unless a live
// control already holds focus.
const restoreCustomListEntryFocus = (removedIndex) => {
  nextTick(() => {
    const container = customListDrawerRef.value
    if (!container) return
    const active = document.activeElement
    if (active && active.isConnected && active !== document.body && active !== document.documentElement) {
      return
    }
    const removeButtons = container.querySelectorAll('.custom-list-remove-btn')
    const target = removeButtons[removedIndex] || removeButtons[removeButtons.length - 1]
      || container.querySelector('.custom-list-drawer-footer button')
    target?.focus({ preventScroll: true })
  })
}

const removeCustomListEntry = (index) => {
  const removed = customListDraftIds.value[index]
  if (removed === undefined) return
  customListDraftIds.value = customListDraftIds.value.filter((_, i) => i !== index)
  if (isDragOverIndex.value === index) isDragOverIndex.value = -1
  restoreCustomListEntryFocus(index)
}

const moveCustomListEntry = (index, direction) => {
  const target = index + direction
  if (target < 0 || target >= customListDraftIds.value.length) return
  const ids = [...customListDraftIds.value]
  const [entry] = ids.splice(index, 1)
  ids.splice(target, 0, entry)
  customListDraftIds.value = ids
}

const addSelectedCustomProvider = () => {
  const id = customListAddSelection.value
  if (!id || customListDraftIds.value.includes(id)) return
  customListDraftIds.value.push(id)
  // Back to the placeholder so the next choice is always explicit.
  customListAddSelection.value = ''
}

// Native drag & drop reorder; keyboard users have the Move Up/Down buttons.
const onCustomListDragStart = (id, event) => {
  isDraggingCustomListId.value = id
  event.dataTransfer?.setData('text/plain', id)
}

const onCustomListDragOver = (index) => {
  isDragOverIndex.value = index
}

const onCustomListDrop = (index) => {
  const fromId = isDraggingCustomListId.value
  isDragOverIndex.value = -1
  isDraggingCustomListId.value = null
  if (fromId == null) return
  const ids = [...customListDraftIds.value]
  const from = ids.indexOf(fromId)
  if (from === -1 || from === index) return
  ids.splice(from, 1)
  ids.splice(index, 0, fromId)
  customListDraftIds.value = ids
}

const onCustomListDragEnd = () => {
  isDraggingCustomListId.value = null
  isDragOverIndex.value = -1
}

// Keep Tab cycling inside this drawer (close button ⇄ list rows ⇄ Done).
// Escape bypasses the trap and is handled by the window handler below.
const handleCustomListKeydown = (e) => {
  if (e.key !== 'Tab') return
  const container = customListDrawerRef.value
  if (!container) return
  const focusable = Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ))
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const isOutside = !active || !container.contains(active)
  if (e.shiftKey) {
    if (active === first || isOutside) {
      e.preventDefault()
      last.focus({ preventScroll: true })
    }
  } else if (active === last || isOutside) {
    e.preventDefault()
    first.focus({ preventScroll: true })
  }
}

// Escape discards this opening's draft without staging anything.
const handleCustomListEscape = (e) => {
  if (e.key !== 'Escape' || !isCustomListDrawerOpen.value) return
  closeCustomListDrawer()
}

onMounted(() => {
  window.addEventListener('keydown', handleCustomListEscape)
  window.addEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleCustomListEscape)
  window.removeEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})
</script>
