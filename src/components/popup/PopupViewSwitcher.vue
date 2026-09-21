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
      :aria-label="translateTabLabel"
      :title="translateLabel"
      @click="emit('update:modelValue', 'translate')"
    >
      <MaskIcon
        :src="translateIcon"
        :size="18"
        class="ti-popup-view-switcher__icon"
      />
      <span
        class="ti-popup-view-switcher__label"
        aria-hidden="true"
      >{{ translateTabLabel }}</span>
    </button>
    <button
      v-if="showLiveDubbing"
      type="button"
      role="tab"
      class="ti-popup-view-switcher__tab"
      :class="{ 'is-active': modelValue === 'live-dubbing' }"
      :aria-selected="modelValue === 'live-dubbing'"
      :aria-label="liveDubbingTabLabel"
      :title="liveDubbingLabel"
      @click="emit('update:modelValue', 'live-dubbing')"
    >
      <MaskIcon
        :src="liveDubbingIcon"
        :size="18"
        class="ti-popup-view-switcher__icon"
      />
      <span
        class="ti-popup-view-switcher__label"
        aria-hidden="true"
      >{{ liveDubbingTabLabel }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
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
const translateTabLabel = computed(() => t('popup_view_switcher_translate_label', 'Text'))
const liveDubbingTabLabel = computed(() => t('popup_view_switcher_dubbing_label', 'Dubbing'))
const translateIcon = computed(() => ExtensionContextManager.safeGetURL('icons/ui/translate-view.png'))
const liveDubbingIcon = computed(() => ExtensionContextManager.safeGetURL('icons/ui/dubbing.png'))
</script>
