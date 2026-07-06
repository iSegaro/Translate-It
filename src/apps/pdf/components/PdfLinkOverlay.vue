<template>
  <div
    v-if="hasLinks"
    class="pdf-link-overlay"
  >
    <div
      v-for="link in links"
      :key="link.id"
      class="pdf-link-overlay__hit"
      :style="link.style"
      @click="handleLinkClick($event, link)"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import './PdfLinkOverlay.scss'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfLinkOverlay')

const props = defineProps({
  session: {
    type: Object,
    default: null
  },
  pageNumber: {
    type: Number,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  },
  handleNavigationTarget: {
    type: Function,
    default: null
  }
})

const links = ref([])
const hasLinks = ref(false)

let fetchGeneration = 0
let deferredLinks = true

async function fetchLinks() {
  if (!props.visible || !props.session) {
    return
  }

  const generation = ++fetchGeneration

  try {
    const viewport = props.session.getPageViewport(props.pageNumber)
    const annotations = await props.session.getLinkAnnotations(props.pageNumber)

    if (generation !== fetchGeneration) {
      return
    }

    if (!viewport) {
      links.value = []
      hasLinks.value = false
      return
    }

    const normalized = annotations
      .map((a) => normalizeAnnotation(a, viewport))
      .filter(Boolean)

    links.value = normalized
    hasLinks.value = normalized.length > 0
  } catch (error) {
    if (generation !== fetchGeneration) {
      return
    }

    logger.warn('Failed to fetch link annotations:', error)
    links.value = []
    hasLinks.value = false
  }
}

function normalizeAnnotation(annotation, viewport) {
  if (!annotation?.rect) {
    return null
  }

  const { x, y, width, height } = annotation.rect

  if (width <= 0 || height <= 0) {
    return null
  }

  const cssRect = viewport.convertToViewportRectangle([x, y, x + width, y + height])

  const left = Math.min(cssRect[0], cssRect[2])
  const top = Math.min(cssRect[1], cssRect[3])
  const right = Math.max(cssRect[0], cssRect[2])
  const bottom = Math.max(cssRect[1], cssRect[3])

  const cssWidth = right - left
  const cssHeight = bottom - top

  if (cssWidth <= 0 || cssHeight <= 0) {
    return null
  }

  const containerWidth = viewport.width
  const containerHeight = viewport.height

  return {
    id: annotation.id,
    target: annotation.target,
    style: {
      left: `${left / containerWidth * 100}%`,
      top: `${top / containerHeight * 100}%`,
      width: `${cssWidth / containerWidth * 100}%`,
      height: `${cssHeight / containerHeight * 100}%`
    }
  }
}

function handleLinkClick(event, link) {
  event.preventDefault()
  event.stopPropagation()

  if (props.handleNavigationTarget && link.target) {
    props.handleNavigationTarget(link.target)
  }
}

watch(
  () => [props.visible, props.pageNumber, props.session],
  () => {
    if (props.visible && deferredLinks) {
      deferredLinks = false
      requestAnimationFrame(() => {
        fetchLinks()
      })
      return
    }

    fetchLinks()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  fetchGeneration++
  links.value = []
  hasLinks.value = false
})
</script>
