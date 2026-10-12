<template>
  <div
    ref="rootRef"
    class="model-catalog-picker"
    :class="{ 'is-open': isOpen, 'model-catalog-picker--no-pricing': !showPricing }"
    @focusout="handleRootFocusout"
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
      @keydown="handlePanelKeydown"
      @keyup="handlePanelKeyup"
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
              <span class="model-catalog-picker__header-text">
                <span>{{ tr('model_catalog_column_model', 'Model') }}</span>
              </span>
              <MaskIcon
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-active': activeField === 'name', 'is-asc': sortKey === 'name_asc' }"
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
              <span class="model-catalog-picker__header-text">
                <span>{{ tr('model_catalog_input_price', 'Input') }}</span>
                <span class="model-catalog-picker__unit">{{ tr('model_catalog_per_million', '/ 1M tokens') }}</span>
              </span>
              <MaskIcon
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-active': activeField === 'input', 'is-asc': sortKey === 'input_asc' }"
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
              <span class="model-catalog-picker__header-text">
                <span>{{ tr('model_catalog_output_price', 'Output') }}</span>
                <span class="model-catalog-picker__unit">{{ tr('model_catalog_per_million', '/ 1M tokens') }}</span>
              </span>
              <MaskIcon
                class="model-catalog-picker__sort-icon"
                :class="{ 'is-active': activeField === 'output', 'is-asc': sortKey === 'output_asc' }"
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
      >
        {{ tr('model_catalog_base_rates_note', 'Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.') }}
      </p>
      <small
        v-if="totalMatches === 0 && models.length > 0"
        class="model-catalog-picker__status"
      >{{ tr('model_catalog_no_matches', 'No models match your search.') }}</small>
      <small
        v-else-if="totalMatches > visibleModels.length"
        class="model-catalog-picker__status"
      >{{ showingCountText }}</small>
      <!-- Persistent announcer: one stable element per open panel whose text
           mirrors search outcomes for AT (no-match, results back, count
           changes). The visible hints above stay conditional and unchanged. -->
      <span
        class="ti-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >{{ announcementText }}</span>
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
// Mirrors useUnifiedI18n's fallback: vue-i18n echoes the key when a message
// is missing, so a key-echo (or empty) result counts as missing here too.
const tr = (key, fallback, params) => {
  const translated = t(key, params)
  return translated && translated !== key ? translated : fallback
}

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

// ------------------------------------------------------- search announcements ---
// Persistent polite live region (see template): announces settled search
// outcomes only — no-match, results available again, and match-count changes.
// The message derives from match counts alone, so opening the panel or
// re-sorting never changes it and never announces.
const SEARCH_ANNOUNCE_DEBOUNCE_MS = 300
const announcementText = ref('')
let announceTimer

const announcementMessage = computed(() => {
  if (totalMatches.value === 0) {
    return props.models.length > 0
      ? tr('model_catalog_no_matches', 'No models match your search.')
      : ''
  }
  return showingCountText.value
})

function scheduleAnnouncement() {
  // Close resets searchQuery; that change must never schedule an announcement.
  if (!isOpen.value) return
  // Debounce restarts on EVERY trigger: the announcement fires only after
  // SEARCH_ANNOUNCE_DEBOUNCE_MS without one. The message is read at fire time,
  // and an identical message never mutates the region (no duplicates).
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    announceTimer = null
    const message = announcementMessage.value
    if (!isOpen.value || message === announcementText.value) return
    announcementText.value = message
  }, SEARCH_ANNOUNCE_DEBOUNCE_MS)
}
// Every keystroke resets the window — including count-preserving queries that
// leave announcementMessage untouched — so typing can never announce mid-burst.
watch(searchQuery, scheduleAnnouncement)
// Count changes without typing (models arriving/refreshing) also schedule.
watch(announcementMessage, scheduleAnnouncement)

watch(() => props.showPricing, (showPricing) => {
  if (!showPricing && activeField.value && activeField.value !== 'name') sortKey.value = 'api'
})

// --------------------------------------------------------------- positioning ---
// Pure math over a trigger rect, VISUAL viewport dims and (optionally) LAYOUT
// viewport dims plus the visual viewport's layout offsets, so it is testable
// without layout (jsdom getBoundingClientRect always returns zeros).
// getBoundingClientRect and fixed-position offsets are layout-viewport
// coordinates; the visual viewport is a sub-rectangle of it (offsetX/offsetY,
// exposed by pinch-zoom). Reproduced Greptile bug: with layout height 800 /
// visible 400 / trigger top 300, computing `bottom` from the VISIBLE height
// gave 104px — fixed positioning measures from the LAYOUT edge, so the panel
// landed at 696 instead of 296. Therefore `top`/`left` map straight from the
// rect, while `bottom`/`right` convert back through layoutWidth/layoutHeight;
// side choice and bounds use the visual viewport only.
function computePanelPosition(triggerRect, viewport, options = {}) {
  const {
    isRtl = false,
    gap = 4,
    padding = 8,
    maxWidth = 560,
    maxHeight: preferredMaxHeight = 460,
    layoutWidth = viewport.width,
    layoutHeight = viewport.height,
    offsetX = 0,
    offsetY = 0,
  } = options
  const width = Math.min(Math.max(triggerRect.width, 300), maxWidth, viewport.width - padding * 2)
  // Available space, measured inside the visual viewport only.
  const spaceBelow = offsetY + viewport.height - triggerRect.bottom - gap - padding
  const spaceAbove = triggerRect.top - offsetY - gap - padding
  const openDown = spaceBelow >= spaceAbove
  const available = openDown ? spaceBelow : spaceAbove
  const style = {
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(available, preferredMaxHeight))}px`,
  }
  if (isRtl) {
    // `right` is measured from the LAYOUT edge: clamp the panel's right edge
    // inside the visual viewport first, then convert.
    const rightEdge = Math.min(
      Math.max(triggerRect.right, offsetX + width + padding),
      offsetX + viewport.width - padding,
    )
    style.right = `${layoutWidth - rightEdge}px`
  } else {
    style.left = `${Math.min(Math.max(triggerRect.left, offsetX + padding), offsetX + viewport.width - width - padding)}px`
  }
  // `top` comes straight from the layout-coordinate rect; `bottom` converts
  // the layout-space top edge through the layout height.
  if (openDown) style.top = `${triggerRect.bottom + gap}px`
  else style.bottom = `${layoutHeight - triggerRect.top + gap}px`
  return style
}

defineExpose({ computePanelPosition })

// Fixed-column chrome (panel padding 16 + search ~60 + gaps ~24 + header ~36
// + note ~32 + count ~18 — footers no longer shrink) needs ~186px; keep ~48px
// more for at least one visible, focusable row. Below that total the clipped
// column would hide footers/sort controls/results, so the panel switches to a
// single whole-panel scroller — the fallback owns every height where the
// non-shrinking layout would clip (see region styles below).
const PANEL_SCROLL_FALLBACK_BELOW = 240

// Whole-panel scroll fallback: children keep natural size and stop being
// scroll containers themselves, so one scroller reaches search, headers,
// rows, note and count alike — no nested scroll regions. Footers need no
// regime override: they are non-shrinking (flex: 0 0 auto) in both regimes.
const naturalSizeStyle = { flex: '0 0 auto', overflow: 'visible' }
const gridStyle = computed(() => (panelScroll.value ? naturalSizeStyle : { flex: '1 1 auto' }))
const resultsStyle = computed(() => (panelScroll.value
  ? naturalSizeStyle
  : { flex: '1 1 auto', overflowY: 'auto' }))

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
    {
      isRtl: getComputedStyle(trigger).direction === 'rtl',
      // Fixed positioning lives in layout coordinates; without visualViewport
      // the layouts coincide (offsets 0) and behavior is unchanged.
      layoutWidth: window.innerWidth,
      layoutHeight: window.innerHeight,
      offsetX: visualViewport?.offsetLeft ?? 0,
      offsetY: visualViewport?.offsetTop ?? 0,
    },
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
  // A pending announcement must not outlive the panel; reopening starts
  // silent (no announcement on open).
  clearTimeout(announceTimer)
  announceTimer = null
  announcementText.value = ''
  // A pending arrow flag must not outlive the panel (keydown without a
  // follow-up change, then Escape/outside close before keyup).
  arrowNavPending = false
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
    // positionPanel reads visualViewport width/height AND offsets, so both
    // resize and scroll re-position. Optional chaining keeps SSR/older test
    // envs without visualViewport working.
    window.visualViewport?.addEventListener('resize', positionPanel)
    window.visualViewport?.addEventListener('scroll', positionPanel)
  } else {
    document.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('scroll', positionPanel, true)
    window.removeEventListener('resize', positionPanel)
    window.visualViewport?.removeEventListener('resize', positionPanel)
    window.visualViewport?.removeEventListener('scroll', positionPanel)
  }
})

onBeforeUnmount(() => {
  clearTimeout(announceTimer)
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('resize', positionPanel)
  window.visualViewport?.removeEventListener('resize', positionPanel)
  window.visualViewport?.removeEventListener('scroll', positionPanel)
})

// ---------------------------------------------------------------- keyboard ---
// Product semantics (deliberate): EVERY radio change still emits — any checked
// radio IS the selection, so persistence guarantees are untouched. Only the
// close trigger differs by input: arrow-driven changes keep the panel open
// (continuous browsing, focus stays on the radio); pointer changes close as
// before. Alternatives considered: deferring the emit pending a highlight —
// rejected as new product semantics that fights native radio behavior.
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
let arrowNavPending = false

function handlePanelKeydown(event) {
  const target = event.target
  if (!target || target.type !== 'radio') return
  if (NAV_KEYS.has(event.key)) {
    // Native arrow navigation fires change right after keydown; the pending
    // flag tells handleSelect to keep the panel open for that change.
    arrowNavPending = true
  } else if ((event.key === 'Enter' || event.key === ' ') && target.checked) {
    // Confirmation affordance after browsing: close without any new writes.
    closePanel(true)
  }
}

function handlePanelKeyup(event) {
  // An arrow pressed at the group edge fires keydown but no change; clear the
  // flag on keyup so the next pointer selection still closes normally.
  if (NAV_KEYS.has(event.key)) arrowNavPending = false
}

function handleRootFocusout(event) {
  // Tabbing out of the picker closes it silently — never steal focus back.
  const next = event.relatedTarget
  if (next && rootRef.value && !rootRef.value.contains(next)) closePanel(false)
}

// ---------------------------------------------------------------- selection ---
function handleSelect(event) {
  // Explicit radio change only: always emit once (the checked radio is the
  // selection). Arrow-driven changes stay open; everything else closes.
  emit('update:modelValue', event.target.value)
  if (arrowNavPending) {
    arrowNavPending = false
    return
  }
  closePanel(true)
}
</script>
