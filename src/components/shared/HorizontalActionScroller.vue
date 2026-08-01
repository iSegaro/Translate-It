<template>
  <div
    class="ti-horizontal-action-scroller"
    :class="{ 'ti-horizontal-action-scroller--overflowing': hasOverflow }"
  >
    <button
      v-if="canScrollPrevious"
      class="ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--previous"
      type="button"
      :aria-label="previousLabel"
      @click="scroll(-1)"
    >
      <span
        class="ti-horizontal-action-scroller__icon ti-horizontal-action-scroller__icon--previous"
        aria-hidden="true"
      />
    </button>

    <div
      ref="viewport"
      class="ti-horizontal-action-scroller__viewport"
      role="region"
      :aria-label="ariaLabel"
    >
      <div class="ti-horizontal-action-scroller__track">
        <slot />
      </div>
    </div>

    <button
      v-if="canScrollNext"
      class="ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--next"
      type="button"
      :aria-label="nextLabel"
      @click="scroll(1)"
    >
      <span
        class="ti-horizontal-action-scroller__icon ti-horizontal-action-scroller__icon--next"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import './HorizontalActionScroller.scss'

const { ariaLabel } = defineProps({
  ariaLabel: {
    type: String,
    required: true
  }
})

const viewport = ref(null)
const hasOverflow = ref(false)
const canScrollPrevious = ref(false)
const canScrollNext = ref(false)

const { t } = useUnifiedI18n()
const previousLabel = computed(() => t('horizontal_action_scroller_previous'))
const nextLabel = computed(() => t('horizontal_action_scroller_next'))

const EPSILON = 1
let resizeObserver = null
let animationFrameId = null

const updateScrollState = () => {
  const element = viewport.value
  if (!element) return

  const nextHasOverflow = element.scrollWidth > element.clientWidth + EPSILON
  const maximumScrollLeft = element.scrollWidth - element.clientWidth
  const nextCanScrollPrevious = nextHasOverflow && element.scrollLeft > EPSILON
  const nextCanScrollNext = nextHasOverflow && maximumScrollLeft - element.scrollLeft > EPSILON

  if (hasOverflow.value !== nextHasOverflow) hasOverflow.value = nextHasOverflow
  if (canScrollPrevious.value !== nextCanScrollPrevious) canScrollPrevious.value = nextCanScrollPrevious
  if (canScrollNext.value !== nextCanScrollNext) canScrollNext.value = nextCanScrollNext
}

const scheduleScrollStateUpdate = () => {
  if (animationFrameId !== null) return

  animationFrameId = requestAnimationFrame(() => {
    animationFrameId = null
    updateScrollState()
  })
}

const scroll = (direction) => {
  viewport.value?.scrollBy({
    left: direction * viewport.value.clientWidth * 0.8,
    behavior: 'smooth'
  })
}

onMounted(async () => {
  await nextTick()
  const element = viewport.value
  if (!element) return

  element.addEventListener('scroll', scheduleScrollStateUpdate, { passive: true })

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleScrollStateUpdate)
    resizeObserver.observe(element)
  }

  scheduleScrollStateUpdate()
})

onUpdated(scheduleScrollStateUpdate)

onUnmounted(() => {
  viewport.value?.removeEventListener('scroll', scheduleScrollStateUpdate)
  resizeObserver?.disconnect()
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
})
</script>
