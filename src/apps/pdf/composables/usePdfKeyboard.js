import { watch, onBeforeUnmount } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfKeyboard')

const HANDLED_KEYS = new Set(['PageDown', 'PageUp', 'Home', 'End'])

function isInteractiveElement(target) {
  if (!target || !(target instanceof HTMLElement)) {
    return false
  }

  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') {
    return true
  }

  if (target.isContentEditable) {
    return true
  }

  return false
}

export function usePdfKeyboard({ currentPage, totalPages, navigateToPage, containerRef }) {
  let containerEl = null

  function handleKeyDown(event) {
    if (!HANDLED_KEYS.has(event.key)) {
      return
    }

    if (event.repeat) {
      return
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return
    }

    if (isInteractiveElement(event.target)) {
      return
    }

    event.preventDefault()

    const current = Number(currentPage.value) || 0
    const total = Number(totalPages.value) || 0

    switch (event.key) {
      case 'PageDown':
        if (current < total) {
          navigateToPage(current + 1)
        }
        break

      case 'PageUp':
        if (current > 1) {
          navigateToPage(current - 1)
        }
        break

      case 'Home':
        if (total > 0) {
          navigateToPage(1)
        }
        break

      case 'End':
        if (total > 0) {
          navigateToPage(total)
        }
        break
    }
  }

  function attachListener() {
    detachListener()

    const container = containerRef?.value ?? null
    if (!container) {
      return
    }

    containerEl = container
    containerEl.addEventListener('keydown', handleKeyDown)
    logger.info('Keyboard listener attached')
  }

  function detachListener() {
    if (containerEl) {
      containerEl.removeEventListener('keydown', handleKeyDown)
      containerEl = null
      logger.info('Keyboard listener detached')
    }
  }

  watch(containerRef, () => {
    attachListener()
  })

  onBeforeUnmount(() => {
    detachListener()
  })

  attachListener()

  return {
    attachListener,
    detachListener
  }
}
