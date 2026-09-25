<template>
  <div
    ref="switcherRef"
    class="ti-popup-view-switcher"
    role="tablist"
    :aria-label="t('popup_view_switcher_label', 'Popup views')"
  >
    <span
      ref="pillRef"
      class="ti-popup-view-switcher__pill"
      aria-hidden="true"
    />
    <button
      ref="translateTabRef"
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
      ref="dubbingTabRef"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import ExtensionContextManager from '@/core/extensionContext.js'

// Import adjacent SCSS
import './PopupViewSwitcher.scss'

const { t } = useUnifiedI18n()

const props = defineProps({
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

// Decorative sliding pill: positioned under the active tab via measured
// offsetLeft/offsetWidth. modelValue stays the single source of truth.
const switcherRef = ref(null)
const pillRef = ref(null)
const translateTabRef = ref(null)
const dubbingTabRef = ref(null)

let resizeObserver = null
let resizeFallback = null

function activeTabEl() {
  if (props.modelValue === 'live-dubbing' && props.showLiveDubbing) {
    return dubbingTabRef.value ?? null
  }
  return translateTabRef.value ?? null
}

function syncPill() {
  const pill = pillRef.value
  const tab = activeTabEl()
  if (!pill || !tab) return
  const left = tab.offsetLeft
  const width = tab.offsetWidth
  if (typeof left !== 'number' || typeof width !== 'number') return
  pill.style.left = `${left}px`
  pill.style.width = `${width}px`
}

function scheduleSyncPill() {
  nextTick().then(syncPill).catch(() => {})
}

watch(() => props.modelValue, scheduleSyncPill)
watch(() => props.showLiveDubbing, scheduleSyncPill)

onMounted(() => {
  scheduleSyncPill()
  const container = switcherRef.value
  if (!container) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleSyncPill)
    resizeObserver.observe(container)
  } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    resizeFallback = scheduleSyncPill
    window.addEventListener('resize', resizeFallback)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (resizeFallback && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('resize', resizeFallback)
    resizeFallback = null
  }
})
</script>
