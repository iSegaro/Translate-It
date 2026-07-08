import { ref } from 'vue'
import { resolveRenderWindow } from '../utils/pdfRenderWindowResolver.js'
import { PdfRenderScheduler } from '../rendering/PdfRenderScheduler.js'

export function usePdfRenderPipeline({
  isOriginalRole,
  freezeRenderWindowEviction,
  getContainer,
  getPageView,
  onVisiblePagesChange,
  onRenderCandidatesChange
} = {}) {
  const renderScheduler = new PdfRenderScheduler()
  const visiblePageNumbers = ref(new Set())
  const renderCandidatePageNumbers = ref(new Set())
  const renderAllowedPageNumbers = ref(new Set())
  const renderPlanByPageNumber = ref(new Map())

  let renderWindowFrameId = null
  let renderWindowEpoch = 0

  function updateVisiblePages(nextVisible) {
    visiblePageNumbers.value = nextVisible

    if (isOriginalRole.value) {
      onVisiblePagesChange?.(nextVisible)
    }
  }

  function updateRenderCandidates(nextRenderable) {
    renderCandidatePageNumbers.value = nextRenderable

    if (isOriginalRole.value) {
      onRenderCandidatesChange?.(nextRenderable)
    }
  }

  function updateRenderPlan(plan = []) {
    renderPlanByPageNumber.value = new Map(
      plan.map(item => [item.pageNumber, item])
    )
  }

  function getRenderPriority(pageNumber) {
    return renderPlanByPageNumber.value.get(pageNumber)?.priority ?? null
  }

  function getRenderPriorityGroup(pageNumber) {
    return renderPlanByPageNumber.value.get(pageNumber)?.priorityGroup ?? ''
  }

  function updateRenderAllowedPages(pageNumbers = new Set()) {
    renderAllowedPageNumbers.value = new Set(pageNumbers)
  }

  function isRenderAllowed(pageNumber) {
    return renderAllowedPageNumbers.value.has(pageNumber)
  }

  function applySchedulerResult(result) {
    updateRenderPlan(result.plan)
    if (result.renderAllowedChanged) {
      updateRenderAllowedPages(result.renderAllowedPages)
    }
    if (result.changed) {
      updateRenderCandidates(result.candidates)
    }
    if (result.cancelRenderPages?.size > 0 && isOriginalRole.value) {
      for (const pageNumber of result.cancelRenderPages) {
        const instance = getPageView?.(pageNumber)
        if (!instance) continue
        instance.cancelRender?.()
      }
    }
  }

  function applyRenderWindow({ epoch = renderWindowEpoch, force = false } = {}) {
    if (freezeRenderWindowEviction.value) {
      renderScheduler.updateWindow({ frozen: true })
      return
    }

    if (!force && epoch !== renderWindowEpoch) {
      return
    }

    const container = getContainer?.() || null
    const renderWindow = resolveRenderWindow({
      container,
      pageSelector: '.pdf-page[data-page-number]',
      bufferPages: 1
    })

    updateVisiblePages(new Set(renderWindow.visiblePages))
    const result = renderScheduler.updateWindow({
      visiblePages: renderWindow.visiblePages,
      renderPages: renderWindow.renderPages,
      primaryPage: renderWindow.primaryPage,
      frozen: freezeRenderWindowEviction.value
    })
    applySchedulerResult(result)
  }

  function handleRenderCommitted(pageNumber) {
    if (!isOriginalRole.value) return

    const result = renderScheduler.markRendered(pageNumber)
    applySchedulerResult(result)
  }

  function handleRenderStarted(pageNumber) {
    if (!isOriginalRole.value) return

    applySchedulerResult(renderScheduler.markRenderStarted(pageNumber))
  }

  function handleRenderFailed(pageNumber) {
    if (!isOriginalRole.value) return

    applySchedulerResult(renderScheduler.markRenderFailed(pageNumber))
  }

  function handleRenderCancelled(pageNumber) {
    if (!isOriginalRole.value) return

    applySchedulerResult(renderScheduler.markRenderCancelled(pageNumber))
  }

  function cancelRenderWindowFrame() {
    if (renderWindowFrameId != null) {
      cancelAnimationFrame(renderWindowFrameId)
      renderWindowFrameId = null
    }
  }

  function scheduleRenderWindowUpdate() {
    if (renderWindowFrameId != null) return

    const epoch = renderWindowEpoch
    renderWindowFrameId = requestAnimationFrame(() => {
      renderWindowFrameId = null
      applyRenderWindow({ epoch })
    })
  }

  function onFreezeChange() {
    renderWindowEpoch += 1
    cancelRenderWindowFrame()
    renderScheduler.updateWindow({ frozen: true })
  }

  function reset() {
    cancelRenderWindowFrame()
    renderScheduler.reset()
    visiblePageNumbers.value = new Set()
    renderCandidatePageNumbers.value = new Set()
    renderAllowedPageNumbers.value = new Set()
    renderPlanByPageNumber.value = new Map()

    onVisiblePagesChange?.(new Set())
    onRenderCandidatesChange?.(new Set())
  }

  return {
    renderCandidatePageNumbers,
    renderAllowedPageNumbers,
    getRenderPriority,
    getRenderPriorityGroup,
    isRenderAllowed,
    applyRenderWindow,
    scheduleRenderWindowUpdate,
    cancelRenderWindowFrame,
    handleRenderStarted,
    handleRenderCommitted,
    handleRenderCancelled,
    handleRenderFailed,
    onFreezeChange,
    reset
  }
}
