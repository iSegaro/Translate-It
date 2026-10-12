<template>
  <div
    ref="rootRef"
    class="model-catalog-picker"
    :class="{ 'is-open': isOpen, 'model-catalog-picker--no-pricing': !showPricing }"
  >
    <button
      ref="triggerRef"
      type="button"
      class="model-catalog-picker__trigger"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      @click="togglePanel"
    >
      <span class="model-catalog-picker__trigger-text">
        <template v-if="selectedModel">
          <span
            class="model-catalog-picker__trigger-name"
            dir="auto"
          >{{ selectedModel.name || selectedModel.value }}</span>
          <span
            class="model-catalog-picker__trigger-id"
            dir="ltr"
          >{{ selectedModel.value }}</span>
        </template>
        <span
          v-else-if="modelValue"
          class="model-catalog-picker__trigger-id"
          dir="ltr"
        >{{ modelValue }}</span>
        <span
          v-else
          class="model-catalog-picker__trigger-name"
        >{{ tr('model_catalog_browse', 'Browse models') }}</span>
      </span>
      <MaskIcon
        class="model-catalog-picker__trigger-arrow"
        :src="dropdownArrowIcon"
        :size="10"
      />
    </button>

    <div
      v-if="isOpen"
      :id="panelId"
      ref="panelRef"
      class="model-catalog-picker__panel"
      :style="panelStyle"
      @keydown.esc.stop.prevent="closePanel(true)"
    >
      <BaseInput
        v-model="searchQuery"
        class="model-catalog-picker__search"
        type="search"
        :label="tr('model_catalog_search_label', 'Search models')"
        :placeholder="tr('model_catalog_search_placeholder', 'Search by model name or ID')"
        dir="ltr"
      />
      <div
        class="model-catalog-picker__grid"
        role="table"
        :aria-label="tr('model_catalog_results_label', 'Available models')"
        :style="gridStyle"
      >
        <div
          class="model-catalog-picker__header"
          role="row"
        >
          <div
            class="model-catalog-picker__header-cell"
            role="columnheader"
            :aria-sort="sortState('name')"
          >
            <button
              type="button"
              class="model-catalog-picker__sort-button"
              @click="cycleSort('name')"
            >
              <span>{{ tr('model_catalog_column_model', 'Model') }}</span>
              <MaskIcon
                v-if="activeField === 'name'"
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-asc': sortKey.endsWith('_asc') }"
                :src="dropdownArrowIcon"
                :size="8"
              />
            </button>
          </div>
          <div
            v-if="showPricing"
            class="model-catalog-picker__header-cell"
            role="columnheader"
            :aria-sort="sortState('input')"
          >
            <button
              type="button"
              class="model-catalog-picker__sort-button"
              @click="cycleSort('input')"
            >
              <span>{{ tr('model_catalog_input_price', 'Input') }} <span class="model-catalog-picker__unit">{{ tr('model_catalog_per_million', '/ 1M tokens') }}</span></span>
              <MaskIcon
                v-if="activeField === 'input'"
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-asc': sortKey.endsWith('_asc') }"
                :src="dropdownArrowIcon"
                :size="8"
              />
            </button>
          </div>
          <div
            v-if="showPricing"
            class="model-catalog-picker__header-cell"
            role="columnheader"
            :aria-sort="sortState('output')"
          >
            <button
              type="button"
              class="model-catalog-picker__sort-button"
              @click="cycleSort('output')"
            >
              <span>{{ tr('model_catalog_output_price', 'Output') }} <span class="model-catalog-picker__unit">{{ tr('model_catalog_per_million', '/ 1M tokens') }}</span></span>
              <MaskIcon
                v-if="activeField === 'output'"
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-asc': sortKey.endsWith('_asc') }"
                :src="dropdownArrowIcon"
                :size="8"
              />
            </button>
          </div>
        </div>
        <div
          class="model-catalog-picker__results"
          role="rowgroup"
          :style="resultsStyle"
        >
          <div
            v-for="model in visibleModels"
            :key="model.value"
            class="model-catalog-picker__row"
            role="row"
          >
            <div
              class="model-catalog-picker__model-cell"
              role="cell"
            >
              <label class="model-catalog-picker__row-label">
                <input
                  type="radio"
                  class="model-catalog-picker__radio"
                  :name="radioGroupName"
                  :value="model.value"
                  :checked="model.value === modelValue"
                  @change="handleSelect"
                >
                <span class="model-catalog-picker__meta">
                  <span
                    class="model-catalog-picker__name"
                    dir="auto"
                  >{{ model.name || model.value }}</span>
                  <span
                    class="model-catalog-picker__id"
                    dir="ltr"
                  >{{ model.value }}</span>
                  <span
                    v-if="showPricing && isVariablePricing(model)"
                    class="model-catalog-picker__variable"
                  >{{ tr('model_catalog_variable', 'Variable pricing') }}</span>
                </span>
              </label>
            </div>
            <div
              v-if="showPricing"
              class="model-catalog-picker__price"
              role="cell"
            >
              <span class="model-catalog-picker__price-label">{{ tr('model_catalog_input_price', 'Input') }}:</span>
              {{ priceText(model, 'prompt') }}
            </div>
            <div
              v-if="showPricing"
              class="model-catalog-picker__price"
              role="cell"
            >
              <span class="model-catalog-picker__price-label">{{ tr('model_catalog_output_price', 'Output') }}:</span>
              {{ priceText(model, 'completion') }}
            </div>
          </div>
        </div>
      </div>
      <p
        v-if="showPricing"
        class="model-catalog-picker__note"
        :style="footerStyle"
      >
        {{ tr('model_catalog_base_rates_note', 'Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.') }}
      </p>
      <small
        v-if="totalMatches === 0 && models.length > 0"
        class="model-catalog-picker__status"
        :style="footerStyle"
      >{{ tr('model_catalog_no_matches', 'No models match your search.') }}</small>
      <small
        v-else-if="totalMatches > visibleModels.length"
        class="model-catalog-picker__status"
        :style="footerStyle"
      >{{ showingCountText }}</small>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, unref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseInput from '@/components/base/BaseInput.vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
import dropdownArrowIcon from '@/icons/ui/dropdown-arrow.svg?url'
import './ModelCatalogPicker.scss'

const props = defineProps({
  models: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: String,
    required: true,
  },
  showPricing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const { t, locale } = useI18n()
const tr = (key, fallback, params) => t(key, params) || fallback

const rootRef = ref(null)
const triggerRef = ref(null)
const panelRef = ref(null)
const isOpen = ref(false)
const searchQuery = ref('')
const sortKey = ref('api')
const panelStyle = ref({})
const panelScroll = ref(false)
const radioGroupName = `model-catalog-${useId()}`
const panelId = `model-catalog-picker-panel-${useId()}`

const selectedModel = computed(() => props.models.find(model => model.value === props.modelValue) || null)

// ---------------------------------------------------------------- pricing ---
// Per-token price sentinel: only finite numbers >= 0 or nonempty numeric
// strings count. Booleans, objects, whitespace, NaN, Infinity and negatives
// stay null — never coerced to zero (which would display as Free).
function toPriceValue(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null
  }
  if (typeof raw === 'string' && raw.trim()) {
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  return null
}

function priceOf(model, kind) {
  return toPriceValue(model?.pricing?.[kind])
}

const priceFormatter = computed(() => new Intl.NumberFormat(unref(locale) || undefined, {
  style: 'currency',
  currency: 'USD',
  // Significant digits keep tiny positive per-token rates from collapsing to $0.00.
  maximumSignificantDigits: 6,
}))

function priceText(model, kind) {
  const value = priceOf(model, kind)
  if (value === null) return tr('model_catalog_unavailable', 'N/A')
  if (value === 0) return tr('model_catalog_free', 'Free')
  return priceFormatter.value.format(value * 1e6)
}

function isVariablePricing(model) {
  return Boolean(model?.pricing?.variable)
}

// ---------------------------------------------------------------- sorting ---
function compareNullableNumbers(a, b, direction) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direction === 'desc' ? b - a : a - b
}

function nameOf(model) {
  return model.name || model.value || ''
}

const comparators = {
  name_asc: (a, b) => nameOf(a).localeCompare(nameOf(b)),
  name_desc: (a, b) => nameOf(b).localeCompare(nameOf(a)),
  input_asc: (a, b) => compareNullableNumbers(priceOf(a, 'prompt'), priceOf(b, 'prompt'), 'asc'),
  input_desc: (a, b) => compareNullableNumbers(priceOf(a, 'prompt'), priceOf(b, 'prompt'), 'desc'),
  output_asc: (a, b) => compareNullableNumbers(priceOf(a, 'completion'), priceOf(b, 'completion'), 'asc'),
  output_desc: (a, b) => compareNullableNumbers(priceOf(a, 'completion'), priceOf(b, 'completion'), 'desc'),
}

const activeField = computed(() => (sortKey.value === 'api' ? null : sortKey.value.split('_')[0]))

function sortState(field) {
  if (sortKey.value === `${field}_asc`) return 'ascending'
  if (sortKey.value === `${field}_desc`) return 'descending'
  return 'none'
}

// Third click on the active header returns to API order.
function cycleSort(field) {
  if (sortKey.value === `${field}_asc`) sortKey.value = `${field}_desc`
  else if (sortKey.value === `${field}_desc`) sortKey.value = 'api'
  else sortKey.value = `${field}_asc`
}

const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return props.models
  return props.models.filter((model) => {
    const value = typeof model?.value === 'string' ? model.value : ''
    const name = typeof model?.name === 'string' ? model.name : ''
    return value.toLocaleLowerCase().includes(query) || name.toLocaleLowerCase().includes(query)
  })
})

const sortedModels = computed(() => {
  const comparator = comparators[sortKey.value]
  // Array sort is stable, so price/name ties keep API order; never sort props.models in place.
  return comparator ? [...filteredModels.value].sort(comparator) : filteredModels.value
})

const visibleModels = computed(() => sortedModels.value.slice(0, 50))
const totalMatches = computed(() => filteredModels.value.length)

const showingCountText = computed(() => tr(
  'model_catalog_showing_count',
  `Showing ${visibleModels.value.length} of ${totalMatches.value} models`,
  { shown: visibleModels.value.length, total: totalMatches.value },
))

watch(() => props.showPricing, (showPricing) => {
  if (!showPricing && activeField.value && activeField.value !== 'name') sortKey.value = 'api'
})

// --------------------------------------------------------------- positioning ---
// Pure math over a trigger rect and viewport dims so positioning is testable
// without layout (jsdom getBoundingClientRect always returns zeros).
// Opens on whichever side of the trigger has more room, sizes max-height to
// that side's real available space (no floor — a panel that fits a 40px gap
// beats one that overflows it), and clamps the inline edge for both directions.
function computePanelPosition(triggerRect, viewport, options = {}) {
  const {
    isRtl = false,
    gap = 4,
    padding = 8,
    maxWidth = 560,
    maxHeight: preferredMaxHeight = 460,
  } = options
  const width = Math.min(Math.max(triggerRect.width, 300), maxWidth, viewport.width - padding * 2)
  const spaceBelow = viewport.height - triggerRect.bottom - gap - padding
  const spaceAbove = triggerRect.top - gap - padding
  const openDown = spaceBelow >= spaceAbove
  const available = openDown ? spaceBelow : spaceAbove
  const style = {
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(available, preferredMaxHeight))}px`,
  }
  // Keep [edge, edge + width] inside the viewport, padding aside.
  const edgeMax = viewport.width - width - padding
  if (isRtl) {
    style.right = `${Math.min(Math.max(viewport.width - triggerRect.right, padding), edgeMax)}px`
  } else {
    style.left = `${Math.min(Math.max(triggerRect.left, padding), edgeMax)}px`
  }
  if (openDown) style.top = `${triggerRect.bottom + gap}px`
  else style.bottom = `${viewport.height - triggerRect.top + gap}px`
  return style
}

defineExpose({ computePanelPosition })

// Fixed-column chrome needs ~112px (search ~60 + gaps 16 + header ~36); keep
// ~48px more for at least one visible, focusable row. Below that total, the
// clipped column would hide sort controls/results, so the panel switches to a
// single whole-panel scroller (see region/footer styles below).
const PANEL_SCROLL_FALLBACK_BELOW = 160

// Whole-panel scroll fallback: children keep natural size and stop being
// scroll containers themselves, so one scroller reaches search, headers,
// rows, note and count alike — no nested scroll regions.
const naturalSizeStyle = { flex: '0 0 auto', overflow: 'visible' }
const gridStyle = computed(() => (panelScroll.value ? naturalSizeStyle : { flex: '1 1 auto' }))
const resultsStyle = computed(() => (panelScroll.value
  ? naturalSizeStyle
  : { flex: '1 1 auto', overflowY: 'auto' }))
const footerStyle = computed(() => (panelScroll.value ? naturalSizeStyle : null))

// The Options page scrolls inside .tab-content-container (overflow-x: hidden),
// which would clip an absolutely positioned panel. No ancestor of this picker
// creates a containing block (no transform/filter), so fixed positioning with
// trigger-relative coordinates is the minimal fix; teleport is avoided on
// purpose (see BaseModal: extension contexts keep components in place).
function positionPanel() {
  const trigger = triggerRef.value
  if (!trigger) return
  const visualViewport = window.visualViewport
  const style = computePanelPosition(
    trigger.getBoundingClientRect(),
    {
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    },
    { isRtl: getComputedStyle(trigger).direction === 'rtl' },
  )
  panelScroll.value = parseFloat(style.maxHeight) < PANEL_SCROLL_FALLBACK_BELOW
  panelStyle.value = { ...style, overflowY: panelScroll.value ? 'auto' : 'hidden' }
}

function handleDocumentClick(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) closePanel(false)
}

async function openPanel() {
  positionPanel()
  isOpen.value = true
  await nextTick()
  // Focus the search field so typing works right after opening.
  panelRef.value?.querySelector('input[type="search"]')?.focus()
}

function closePanel(restoreFocus) {
  if (!isOpen.value) return
  isOpen.value = false
  searchQuery.value = ''
  if (restoreFocus) triggerRef.value?.focus()
}

function togglePanel() {
  if (isOpen.value) closePanel(false)
  else openPanel()
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('scroll', positionPanel, true)
    window.addEventListener('resize', positionPanel)
    // Only width/height are read (no offsets), so resize alone re-positions.
    // Optional chaining keeps SSR/older test envs without visualViewport working.
    window.visualViewport?.addEventListener('resize', positionPanel)
  } else {
    document.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('scroll', positionPanel, true)
    window.removeEventListener('resize', positionPanel)
    window.visualViewport?.removeEventListener('resize', positionPanel)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('resize', positionPanel)
  window.visualViewport?.removeEventListener('resize', positionPanel)
})

// ---------------------------------------------------------------- selection ---
function handleSelect(event) {
  // Explicit radio change only: emit once, then close and hand focus back.
  emit('update:modelValue', event.target.value)
  closePanel(true)
}
</script>
