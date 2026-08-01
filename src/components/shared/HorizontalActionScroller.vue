<template>
  <div
    class="ti-horizontal-action-scroller"
    :class="{ 'ti-horizontal-action-scroller--overflowing': hasOverflow }"
  >
    <button
      v-if="hasOverflow"
      ref="previousControl"
      class="ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--previous"
      :class="{ 'ti-horizontal-action-scroller__control--inactive': !canScrollPrevious }"
      type="button"
      :aria-label="previousLabel"
      :aria-hidden="canScrollPrevious ? undefined : 'true'"
      :disabled="!canScrollPrevious"
      :tabindex="canScrollPrevious ? undefined : -1"
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
      v-if="hasOverflow"
      ref="nextControl"
      class="ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--next"
      :class="{ 'ti-horizontal-action-scroller__control--inactive': !canScrollNext }"
      type="button"
      :aria-label="nextLabel"
      :aria-hidden="canScrollNext ? undefined : 'true'"
      :disabled="!canScrollNext"
      :tabindex="canScrollNext ? undefined : -1"
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
const previousControl = ref(null)
const nextControl = ref(null)
const hasOverflow = ref(false)
const canScrollPrevious = ref(false)
const canScrollNext = ref(false)

const { t } = useUnifiedI18n()
const previousLabel = computed(() => t('horizontal_action_scroller_previous'))
const nextLabel = computed(() => t('horizontal_action_scroller_next'))

const EPSILON = 1
let resizeObserver = null
let animationFrameId = null
let hasInitializedEndPosition = false

const updateScrollState = () => {
  const element = viewport.value
  if (!element) return

  const nextHasOverflow = element.scrollWidth > element.clientWidth + EPSILON
  const maximumScrollLeft = element.scrollWidth - element.clientWidth
  const nextCanScrollPrevious = nextHasOverflow && element.scrollLeft > EPSILON
  const nextCanScrollNext = nextHasOverflow && maximumScrollLeft - element.scrollLeft > EPSILON
  const previousBecameInactive = canScrollPrevious.value && !nextCanScrollPrevious
  const nextBecameInactive = canScrollNext.value && !nextCanScrollNext
  const focusedControl = document.activeElement
  const focusTarget = previousBecameInactive && focusedControl === previousControl.value
    ? nextControl
    : nextBecameInactive && focusedControl === nextControl.value
      ? previousControl
      : null

  if (hasOverflow.value !== nextHasOverflow) hasOverflow.value = nextHasOverflow
  if (canScrollPrevious.value !== nextCanScrollPrevious) canScrollPrevious.value = nextCanScrollPrevious
  if (canScrollNext.value !== nextCanScrollNext) canScrollNext.value = nextCanScrollNext

  if (focusTarget) {
    nextTick(() => {
      if (focusTarget.value && !focusTarget.value.disabled) {
        focusTarget.value.focus()
      } else {
        focusedControl.blur()
      }
    })
  }
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

const scrollToEnd = async () => {
  const element = viewport.value
  if (!element) return

  if (!hasInitializedEndPosition) {
    hasInitializedEndPosition = true

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    element.scrollLeft = element.scrollWidth
    updateScrollState()
    await nextTick()
    element.scrollLeft = element.scrollWidth
  } else {
    element.scrollLeft = element.scrollWidth
  }

  scheduleScrollStateUpdate()
}

defineExpose({ scrollToEnd })

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
