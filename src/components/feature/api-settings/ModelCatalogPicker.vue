<template>
  <div class="model-catalog-picker">
    <BaseInput
      v-model="searchQuery"
      type="search"
      :label="tr('model_catalog_search_label', 'Search models')"
      :placeholder="tr('model_catalog_search_placeholder', 'Search by model name or ID')"
      dir="ltr"
    />
    <div class="model-catalog-picker__sort">
      <label :for="sortId">{{ tr('model_catalog_sort_label', 'Sort') }}</label>
      <BaseSelect
        :id="sortId"
        v-model="sortKey"
        :options="sortOptions"
        :style="rtlSelectStyle"
      />
    </div>
    <p
      v-if="showPricing"
      class="model-catalog-picker__note"
    >
      {{ tr('model_catalog_base_rates_note', 'Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.') }}
    </p>
    <fieldset class="model-catalog-picker__fieldset">
      <legend>{{ tr('model_catalog_results_label', 'Available models') }}</legend>
      <div class="model-catalog-picker__list">
        <label
          v-for="model in visibleModels"
          :key="model.value"
          class="model-catalog-picker__option"
        >
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
              v-if="showPricing"
              class="model-catalog-picker__pricing"
            >
              <span>{{ tr('model_catalog_input_price', 'Input') }}: {{ priceText(model, 'prompt') }}</span>
              <span>{{ tr('model_catalog_output_price', 'Output') }}: {{ priceText(model, 'completion') }}</span>
              <span>{{ tr('model_catalog_per_million', 'per 1M tokens') }}</span>
              <span
                v-if="isVariablePricing(model)"
                class="model-catalog-picker__variable"
              >{{ tr('model_catalog_variable', 'Variable pricing') }}</span>
            </span>
          </span>
        </label>
      </div>
    </fieldset>
    <small
      v-if="totalMatches === 0 && models.length > 0"
      class="model-catalog-picker__status"
    >{{ tr('model_catalog_no_matches', 'No models match your search.') }}</small>
    <small
      v-else-if="totalMatches > visibleModels.length"
      class="model-catalog-picker__status"
    >{{ showingCountText }}</small>
  </div>
</template>

<script setup>
import { computed, ref, unref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
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
const { rtlSelectStyle } = useRTLSelect()
const tr = (key, fallback, params) => t(key, params) || fallback

const searchQuery = ref('')
const sortKey = ref('api')
const radioGroupName = `model-catalog-${useId()}`
const sortId = `model-catalog-sort-${useId()}`

const PRICE_SORT_KEYS = new Set(['input_asc', 'input_desc', 'output_asc', 'output_desc'])

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

const sortOptions = computed(() => {
  const options = [
    { value: 'api', label: tr('model_catalog_sort_api', 'API order') },
    { value: 'name_asc', label: tr('model_catalog_sort_name_asc', 'Name (A to Z)') },
    { value: 'name_desc', label: tr('model_catalog_sort_name_desc', 'Name (Z to A)') },
  ]
  if (props.showPricing) {
    options.push(
      { value: 'input_asc', label: tr('model_catalog_sort_input_asc', 'Input price (low to high)') },
      { value: 'input_desc', label: tr('model_catalog_sort_input_desc', 'Input price (high to low)') },
      { value: 'output_asc', label: tr('model_catalog_sort_output_asc', 'Output price (low to high)') },
      { value: 'output_desc', label: tr('model_catalog_sort_output_desc', 'Output price (high to low)') },
    )
  }
  return options
})

watch(() => props.showPricing, (showPricing) => {
  if (!showPricing && PRICE_SORT_KEYS.has(sortKey.value)) sortKey.value = 'api'
})

function handleSelect(event) {
  emit('update:modelValue', event.target.value)
}
</script>
