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
      :aria-label="translateLabel"
      :title="translateLabel"
      @click="emit('update:modelValue', 'translate')"
    >
      <img
        :src="translateIcon"
        :alt="translateLabel"
        class="ti-popup-view-switcher__icon"
      >
    </button>
    <button
      v-if="showLiveDubbing"
      type="button"
      role="tab"
      class="ti-popup-view-switcher__tab"
      :class="{ 'is-active': modelValue === 'live-dubbing' }"
      :aria-selected="modelValue === 'live-dubbing'"
      :aria-label="liveDubbingLabel"
      :title="liveDubbingLabel"
      @click="emit('update:modelValue', 'live-dubbing')"
    >
      <img
        :src="liveDubbingIcon"
        :alt="liveDubbingLabel"
        class="ti-popup-view-switcher__icon"
      >
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import ExtensionContextManager from '@/core/extensionContext.js'

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

const translateLabel = computed(() => t('popup_view_translate', 'Translate'))
const liveDubbingLabel = computed(() => t('popup_view_live_dubbing', 'Live Dubbing'))
const translateIcon = computed(() => ExtensionContextManager.safeGetURL('icons/ui/translate-view.png'))
const liveDubbingIcon = computed(() => ExtensionContextManager.safeGetURL('icons/ui/dubbing.png'))
</script>
