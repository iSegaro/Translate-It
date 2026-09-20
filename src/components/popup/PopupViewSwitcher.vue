<template>
  <div
    class="ti-popup-view-switcher"
    role="tablist"
    :aria-label="t('popup_view_switcher_label', 'Popup views')"
  >
    <button
      type="button"
      role="tab"
      class="ti-popup-view-switcher__tab"
      :class="{ 'is-active': modelValue === 'translate' }"
      :aria-selected="modelValue === 'translate'"
      @click="emit('update:modelValue', 'translate')"
    >
      {{ t('popup_view_translate', 'Translate') }}
    </button>
    <button
      v-if="showLiveDubbing"
      type="button"
      role="tab"
      class="ti-popup-view-switcher__tab"
      :class="{ 'is-active': modelValue === 'live-dubbing' }"
      :aria-selected="modelValue === 'live-dubbing'"
      @click="emit('update:modelValue', 'live-dubbing')"
    >
      {{ t('popup_view_live_dubbing', 'Live Dubbing') }}
    </button>
  </div>
</template>

<script setup>
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

// Import adjacent SCSS
import './PopupViewSwitcher.scss'

const { t } = useUnifiedI18n()

defineProps({
  modelValue: {
    type: String,
    default: 'translate',
    validator: (value) => ['translate', 'live-dubbing'].includes(value)
  },
  showLiveDubbing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])
</script>
