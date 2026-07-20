<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :page-count="pageCount"
      :current-page-number="currentPage"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :can-export="canExport"
      :ocr-recommendation-count="ocrRecommendationCount"
      :is-ocr-processing="isOcrProcessing"
      :content-view="contentView"
      :layout-mode="selectedLayoutMode"
      :zoom-mode="zoomMode"
      :zoom-percent="zoomPercent"
      :show-translation-option="hasTranslationContent"
      :has-outline="hasOutline"
      :is-outline-visible="isOutlineVisible"
      :execution-mode="executionMode"
      :execution-modes="supportedExecutionModes"
      :region-ocr-state="regionOcrState"
      :region-ocr-available="regionOcrAvailable"
      :region-comparison-state="regionComparisonState"
      :can-export-region-comparison-artifact="canExportRegionComparisonArtifact"
      @toggle-outline="toggleOutline"
      @translate-visible="handleTranslateVisiblePages"
      @cancel-translation="handleCancelTranslation"
      @content-view-change="handleContentViewChange"
      @layout-mode-change="handleLayoutModeChange"
      @zoom-step="handleZoomStep"
      @zoom-change="handleZoomChange"
      @export-txt="handleExportTxt"
      @export-markdown="handleExportMarkdown"
      @export-html="handleExportHtml"
      @request-ocr="requestOcr"
      @request-region-ocr="handleRequestRegionOcr"
      @request-region-comparison="handleRequestRegionComparison"
      @cancel-region-comparison="handleCancelRegionComparison"
      @export-region-comparison-artifact="handleExportRegionComparisonArtifact"
      @clear-cache="handleClearCache"
      @request-open-pdf="requestOpenPdf"
      @execution-mode-change="handleExecutionModeChange"
    />

    <input
      ref="fileInput"
      class="pdf-app__file-input"
      hidden
      type="file"
      accept="application/pdf,.pdf"
      @change="handleFileInputChange"
    >

    <div class="pdf-app__viewport">
      <div class="pdf-app__status-layer">
        <div
          v-if="isPdfStatusBannerVisible"
          class="pdf-app__status-row"
        >
          <PdfStatusBanner
            :visible="isPdfStatusBannerVisible"
            :variant="pdfStatusBanner.variant || 'info'"
            :title="pdfStatusBanner.title || ''"
            :message="pdfStatusBanner.message || ''"
            :detail="pdfStatusBanner.detail || ''"
            :body="pdfStatusBanner.body || null"
            :dismissible="pdfStatusBanner?.dismissible ?? false"
            @dismiss="dismissPdfStatusBanner"
          >
            <template #body="{ body }">
              <PdfNotificationBodyRenderer :body="body" />
            </template>
          </PdfStatusBanner>
        </div>

        <PdfOcrProgress
          :processing="isOcrProcessing"
          :progress="ocrProgress"
          @cancel="cancelOcr"
        />

        <div
          v-if="regionOcrNotice"
          class="pdf-app__status-row"
        >
          <PdfStatusBanner
            :visible="true"
            :variant="regionOcrNotice.variant"
            :title="regionOcrNotice.title"
            :message="regionOcrNotice.message"
            dismissible
            @dismiss="regionOcrNotice = null"
          />
        </div>
      </div>

      <main class="pdf-app__content">
        <div class="pdf-app__workspace">
          <PdfOutline
            :outline="pdfOutline"
            :visible="isOutlineVisible && hasOutline"
            :active-dest="activeOutlineDest"
            :expanded-dests="expandedDests"
            @close="isOutlineVisible = false"
            @navigate="handleOutlineNavigate"
          />

          <PdfDropzone
            :has-document="hasDocument"
            :is-drag-over="isDragOver"
            @file-selected="handleFileSelected"
            @drag-state-change="isDragOver = $event"
            @request-open-pdf="requestOpenPdf"
          >
            <template #empty>
              <div class="pdf-app__empty">
                <p class="pdf-app__empty-title">
                  Drop a PDF here or choose one from disk.
                </p>
              </div>
            </template>

            <template #document>
              <PdfViewerLayout
                ref="pdfViewerLayoutRef"
                :layout-mode="layoutMode"
                :show-original-pane="showOriginalPane"
                :show-translated-pane="showTranslatedTextPane || showTranslatedPdfPane"
                :suppress-scroll-sync="suppressScrollSync"
              >
                <template
                  v-if="showOriginalPane"
                  #original
                >
                  <PdfViewer
                    ref="pdfViewerRef"
                    :viewer-role="VIEWER_ROLE.ORIGINAL"
                    :pages="pageMetrics"
                    :session="session"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    :freeze-render-window-eviction="renderWindowEvictionFrozen"
                    :show-overlay="showOverlayLayer"
                    :overlay-page-data="translatedPageData"
                    :handle-navigation-target="handleNavigationTarget"
                    :scroll-container="originalScrollContainer"
                    :region-selection-active="regionOcrState === REGION_OCR_STATE.SELECTING"
                    @layout-change="handleLayoutChange"
                    @current-page-change="handleCurrentPageChange"
                    @visible-pages-change="handleVisiblePagesChange"
                    @region-selection-complete="handleRegionSelectionComplete"
                  />
                </template>

                <template #translated>
                  <PdfTranslatedPane
                    v-if="showTranslatedTextPane"
                    ref="pdfTranslatedPaneRef"
                    :translated-page-data="translatedPageData"
                    :page-metrics="pageMetrics"
                    :layout-mode="layoutMode"
                    :scroll-container="translatedScrollContainer"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    @current-page-change="handleTranslatedPaneCurrentPageChange"
                    @visible-pages-change="handleTranslatedPaneVisiblePages"
                  />
                  <PdfViewer
                    v-if="showTranslatedPdfPane"
                    :viewer-role="VIEWER_ROLE.OVERLAY"
                    :pages="pageMetrics"
                    :session="session"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    :freeze-render-window-eviction="renderWindowEvictionFrozen"
                    :show-overlay="true"
                    :overlay-page-data="translatedPageData"
                    :handle-navigation-target="handleNavigationTarget"
                    :scroll-container="translatedScrollContainer"
                  />
                </template>
              </PdfViewerLayout>
            </template>
          </PdfDropzone>
        </div>
      </main>
    </div>

    <PdfWindowsHost
      ref="pdfWindowsHostRef"
      :pdf-fingerprint="pdfFingerprint"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfToolbar from './components/PdfToolbar.vue'
import PdfDropzone from './components/PdfDropzone.vue'
import PdfViewer from './components/PdfViewer.vue'
import PdfViewerLayout from './components/PdfViewerLayout.vue'
import PdfTranslatedPane from './components/PdfTranslatedPane.vue'
import PdfOcrProgress from './components/PdfOcrProgress.vue'
import PdfStatusBanner from './components/PdfStatusBanner.vue'
import PdfNotificationBodyRenderer from './components/notifications/PdfNotificationBodyRenderer.vue'
import PdfWindowsHost from './components/PdfWindowsHost.vue'
import PdfOutline from './components/PdfOutline.vue'
import { usePdfViewerController } from './composables/usePdfViewerController.js'
import { usePdfViewerMode, CONTENT_VIEW, VIEWER_ROLE } from './composables/usePdfViewerMode.js'
import { usePdfExport } from './composables/usePdfExport.js'
import { usePdfOcr } from './composables/usePdfOcr.js'
import { usePdfRegionOcr } from './composables/usePdfRegionOcr.js'
import { createRegionExecutionDispatcher } from './composables/regionExecutionDispatcher.js'
import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { usePdfNavigation } from './composables/usePdfNavigation.js'
import { usePdfKeyboard } from './composables/usePdfKeyboard.js'
import { createPdfTransitionController } from './composables/createPdfTransitionController.js'
import { createPdfStatusBannerController } from './utils/pdfStatusBanner.js'
import { REGION_OCR_STATE } from './constants/regionOcrState.js'
import { PdfDeveloperApi } from './PdfDeveloperApi.js'
import { RegionComparisonRunner } from './RegionComparisonRunner.js'
import { RegionComparisonAnalyzer } from './RegionComparisonAnalyzer.js'
import { RegionComparisonArtifactWriter } from './RegionComparisonArtifactWriter.js'
import { REGION_COMPARISON_CONFIGURATIONS } from './regionComparisonConfigurations.js'
import { PDF_NOTIFICATION_BODY_TYPE } from './notifications/PdfNotificationBodyType.js'
import { createRegionComparisonNotificationViewModel } from './components/notifications/RegionComparisonNotificationMapper.js'
import { downloadFile } from '@/features/pdf-translation/core/PdfFileDownloader.js'
import { PDF_REGION_OCR_RENDER_SCALE } from '@/features/pdf-translation/core/pdfRenderingConstants.js'
import { getSourceLanguageAsync } from '@/shared/config/config.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { applyTheme } from '@/utils/ui/theme.js'
import './PdfApp.scss'

const {
  error,
  fileName,
  hasDocument,
  isLoading,
  isTranslating,
  canTranslateVisiblePages,
  hasTranslationContent,
  pageCount,
  pageMetrics,
  translationSummary,
  translatedPageData,
  translationTick,
  pdfFingerprint,
  session,
  loadPdfFile,
  recomputeLayout,
  translateVisiblePages,
  hydrateVisiblePageBlocks,
  refreshTranslatedPageBlocks,
  cancelTranslation,
  clearDocumentCache,
  cleanup
} = usePdfViewerController()

const {
  contentView,
  layoutMode,
  selectedLayoutMode,
  isSideBySide,
  showOriginalPane,
  showTranslatedTextPane,
  showTranslatedPdfPane,
  showOverlayLayer,
  setContentView,
  setLayoutMode
} = usePdfViewerMode()

const {
  canExport,
  exportError,
  exportTxt,
  exportMarkdown,
  exportHtml,
  clearExportError
} = usePdfExport(translationTick)

const pdfViewerRef = ref(null)
const pdfWindowsHostRef = ref(null)
const pdfTranslatedPaneRef = ref(null)
const pdfViewerLayoutRef = ref(null)
const fileInput = ref(null)
const originalScrollContainer = computed(() => pdfViewerLayoutRef.value?.scrollContainer ?? null)
const translatedScrollContainer = computed(() => pdfViewerLayoutRef.value?.translatedPaneRef ?? null)
const {
  currentPage,
  isNavigating,
  outline: pdfOutline,
  hasOutline,
  activeOutlineDest,
  expandedDests,
  navigateToPage,
  navigateToDestination,
  handleNavigationTarget,
  attachDocument,
  detachDocument
} = usePdfNavigation(pdfViewerRef)
const exportSuccess = ref(null)
const exportSuccessTimer = ref(null)
const EXPORT_SUCCESS_DURATION_MS = 2200
const dismissedPdfStatusBannerKey = ref('')
let activeRegionPosition = null
const regionOcrState = ref(REGION_OCR_STATE.IDLE)
const regionSelectionTarget = ref(null)
const regionOcrNotice = ref(null)
const regionComparisonState = ref(null)
const developerNotification = ref(null)
let developerNotificationOccurrenceId = 0
const canExportRegionComparisonArtifact = computed(() => regionComparisonState.value?.status === 'completed')
const regionOcrAvailable = computed(() => hasDocument.value && showOriginalPane.value)
const supportedExecutionModes = Object.freeze([REGION_EXECUTION_TARGET.OCR])
const executionMode = ref(REGION_EXECUTION_TARGET.OCR)
const pdfStatusBannerController = createPdfStatusBannerController()

const {
  ocrRecommendationCount,
  isOcrProcessing,
  ocrProgress,
  ocrError,
  refreshOcrRecommendations,
  requestOcr,
  cancelOcr
} = usePdfOcr({
  onOcrComplete: ({ pageNumbers } = {}) => {
    refreshTranslatedPageBlocks(pageNumbers)
    translationTick.value += 1
    refreshOcrRecommendations()
  }
})

const { startRegionOcr, cancelRegionOcr } = usePdfRegionOcr({
  onRecognized: handleRegionOcrRecognized
})
const regionComparisonRunner = new RegionComparisonRunner({
  configurations: REGION_COMPARISON_CONFIGURATIONS,
  getPdfDocument: () => session.pdfDocument,
  onProgress: handleRegionComparisonProgress
})
const regionComparisonArtifactWriter = new RegionComparisonArtifactWriter()
const regionComparisonAnalyzer = new RegionComparisonAnalyzer()
let activeRegionComparisonOperation = null
let completedRegionComparisonResult = null
let completedRegionComparisonRegion = null

const regionExecutionDispatcher = createRegionExecutionDispatcher({
  runners: {
    [REGION_EXECUTION_TARGET.OCR]: (request) => startRegionOcr({
      region: request.region,
      pdfDocument: session.pdfDocument,
      scale: PDF_REGION_OCR_RENDER_SCALE,
      language: getSourceLanguageAsync().catch(() => undefined)
    }),
    [REGION_EXECUTION_TARGET.REGION_COMPARISON]: (request) => regionComparisonRunner.execute(request)
  }
})
const pdfDeveloperApi = new PdfDeveloperApi({ regionExecutionDispatcher })

usePdfKeyboard({
  currentPage,
  totalPages: pageCount,
  navigateToPage,
  containerRef: originalScrollContainer
})

  const {
    handleContentViewChange,
    handleLayoutModeChange,
    handleLayoutChange,
    handleZoomChange,
    handleZoomStep,
    buildLayoutRequest,
    resetViewerState,
    currentPageUpdatesSuppressed,
    renderWindowEvictionFrozen,
    suppressScrollSync,
    zoomMode,
    zoomPercent
  } = createPdfTransitionController({
    contentView,
    selectedLayoutMode,
    isSideBySide,
    showOriginalPane,
    showTranslatedTextPane,
    showTranslatedPdfPane,
    setContentView,
    setLayoutMode,
    session,
    hasDocument,
    recomputeLayout,
    currentPage,
    originalScrollContainer,
    translatedScrollContainer,
    pdfViewerRef,
    pdfTranslatedPaneRef,
    pdfViewerLayoutRef
  })

const isDragOver = ref(false)
const isOutlineVisible = ref(false)

const settingsStore = useSettingsStore()
const isDebugMode = computed(() => settingsStore.settings?.DEBUG_MODE === true)

let removeThemeMessageListener = null
let themeMediaQuery = null
let themeMqHandler = null

watch(() => settingsStore.settings.THEME, (theme) => {
  applyTheme(theme || 'auto')
}, { immediate: true })

function toggleOutline() {
  isOutlineVisible.value = !isOutlineVisible.value
}

function handleOutlineNavigate(dest) {
  navigateToDestination(dest)
}

function handleExecutionModeChange(mode) {
  if (!supportedExecutionModes.includes(mode)) return
  executionMode.value = mode
}

const pdfStatusBanner = computed(() => pdfStatusBannerController.build({
  error: error.value,
  exportError: exportError.value,
  ocrError: ocrError.value,
  isLoading: isLoading.value,
  isTranslating: isTranslating.value,
  developerNotification: isDebugMode.value ? developerNotification.value : null,
  exportSuccess: exportSuccess.value,
  translationStatus: translationSummary.value?.status ?? 'idle',
  translationOccurrenceId: translationSummary.value?.translationOccurrenceId ?? 0
}))

const isPdfStatusBannerVisible = computed(() => {
  if (!pdfStatusBanner.value) {
    return false
  }
  const dismissed = dismissedPdfStatusBannerKey.value
  const bid = pdfStatusBanner.value.id
  if (dismissed === bid) {
    return false
  }
  return true
})

watch(hasDocument, (has) => {
  if (has) {
    refreshOcrRecommendations()
  }
})

watch(hasTranslationContent, (has) => {
  if (!has && !isTranslating.value && contentView.value !== CONTENT_VIEW.ORIGINAL) {
    setContentView(CONTENT_VIEW.ORIGINAL)
  }
})

watch(regionOcrAvailable, (available) => {
  if (!available) exitRegionSelection()
})

function resetPresentationState() {
  currentPage.value = 0
  activeRegionPosition = null
  setRegionOcrIdle()
  resetViewerState()
}

async function handleFileSelected(file) {
  cancelRegionOcr()
  resetPresentationState()
  const loaded = await loadPdfFile(file, buildLayoutRequest())
  if (loaded) {
    isDragOver.value = false
    void attachDocument(session)
  }
}

function requestOpenPdf() {
  const input = fileInput.value
  if (!input) return

  input.value = ''
  input.click()
}

async function handleFileInputChange(event) {
  const [file] = event.target.files || []

  try {
    if (file) {
      await handleFileSelected(file)
    }
  } finally {
    event.target.value = ''
  }
}

function handleCurrentPageChange(pageNumber) {
  if (isNavigating.value) return
  if (!Number.isFinite(Number(pageNumber))) return
  currentPage.value = Number(pageNumber) || 0
}

function handleVisiblePagesChange(pageNumbers) {
  if (contentView.value !== CONTENT_VIEW.TRANSLATED_PDF) return
  const pages = new Set(pageNumbers || [])
  if (pages.size === 0) return

  void hydrateVisiblePageBlocks(pages)
}

function handleTranslatedPaneVisiblePages(pageNumbers) {
  if (contentView.value !== CONTENT_VIEW.TRANSLATION) return

  session.updateVisiblePages(new Set(pageNumbers))
}

function resolveRegionViewportPosition(region) {
  const pageElement = pdfViewerRef.value?.getPageStageElement?.(region?.pageNumber)
  const viewport = session?.getPageViewport?.(region?.pageNumber)
  const bounds = pageElement?.getBoundingClientRect?.()

  if (!pageElement || !viewport || !bounds) return null

  const topLeft = viewport.convertToViewportPoint(region.left, region.top)
  const bottomRight = viewport.convertToViewportPoint(region.right, region.bottom)
  if (![...topLeft, ...bottomRight, bounds.left, bounds.top].every(Number.isFinite)) return null

  return {
    x: bounds.left + Math.min(topLeft[0], bottomRight[0]),
    y: bounds.top + Math.min(topLeft[1], bottomRight[1]),
    width: Math.abs(bottomRight[0] - topLeft[0]),
    height: Math.abs(bottomRight[1] - topLeft[1]),
    _isViewportRelative: true
  }
}

function handleRegionSelectionComplete(region) {
  const target = regionSelectionTarget.value
  exitRegionSelection()

  if (target === REGION_EXECUTION_TARGET.REGION_COMPARISON) {
    developerNotification.value = null
    const operation = pdfDeveloperApi.runRegionComparison({ region })
    activeRegionComparisonOperation = operation
    completedRegionComparisonResult = null
    completedRegionComparisonRegion = null
    regionComparisonState.value = {
      status: 'running',
      progress: Object.freeze({
        totalCandidates: 0,
        completedCandidates: 0,
        currentCandidate: null
      }),
      results: Object.freeze([]),
      analysis: null,
      summary: null
    }
    regionOcrState.value = REGION_OCR_STATE.PROCESSING
    void operation.promise.then(
      result => handleRegionComparisonOutcome(operation, result),
      error => handleRegionComparisonFailure(operation, error)
    )
    return
  }

  activeRegionPosition = resolveRegionViewportPosition(region)
  const request = createRegionExecutionRequest({
    region,
    target: executionMode.value
  })

  if (!request) return

  const operation = regionExecutionDispatcher.dispatchRegionExecution(request)
  regionOcrState.value = REGION_OCR_STATE.PROCESSING
  void operation.promise.then(handleRegionOcrOutcome, handleRegionOcrFailure)
  void operation.promise
}

function handleRequestRegionOcr() {
  beginRegionSelection(REGION_EXECUTION_TARGET.OCR)
}

function handleRequestRegionComparison() {
  beginRegionSelection(REGION_EXECUTION_TARGET.REGION_COMPARISON)
}

function handleCancelRegionComparison() {
  if (!activeRegionComparisonOperation) return

  regionComparisonState.value = {
    ...regionComparisonState.value,
    status: 'cancelling'
  }
  activeRegionComparisonOperation.cancel()
}

function handleExportRegionComparisonArtifact() {
  if (!canExportRegionComparisonArtifact.value || !completedRegionComparisonResult || !completedRegionComparisonRegion) return

  const artifact = regionComparisonArtifactWriter.write(completedRegionComparisonResult, {
    region: completedRegionComparisonRegion
  })
  downloadFile(JSON.stringify(artifact, null, 2), 'region-comparison-artifact.json', 'application/json')
}

function handleRegionComparisonProgress(progress) {
  if (!regionComparisonState.value) return

  regionComparisonState.value = {
    ...regionComparisonState.value,
    status: progress.status === 'cancelled' ? 'cancelled' : regionComparisonState.value.status,
    progress
  }
}

function handleRegionComparisonOutcome(operation, result) {
  if (activeRegionComparisonOperation !== operation) return

  activeRegionComparisonOperation = null
  completedRegionComparisonResult = result.status === 'ready' ? result : null
  completedRegionComparisonRegion = result.status === 'ready' ? operation.context.request.region : null
  const analysis = result.status === 'ready' ? regionComparisonAnalyzer.analyze(result) : null
  regionComparisonState.value = {
    status: result.status === 'cancelled' ? 'cancelled' : 'completed',
    progress: Object.freeze({
      totalCandidates: result.summary.totalCandidates,
      completedCandidates: result.summary.completedCandidates,
      currentCandidate: null
    }),
    results: result.results,
    analysis,
    summary: result.summary
  }

  setRegionOcrIdle()
  if (result.status === 'ready') {
    developerNotification.value = createRegionComparisonSuccessNotification(analysis, result)
  }
}

function handleRegionComparisonFailure(operation, error) {
  if (activeRegionComparisonOperation !== operation) return

  activeRegionComparisonOperation = null
  regionComparisonState.value = {
    ...regionComparisonState.value,
    status: 'failed'
  }
  setRegionOcrIdle()
  developerNotification.value = createRegionComparisonFailureNotification(error)
}

function createRegionComparisonSuccessNotification(summary, result) {
  const details = []
  if (summary?.winner?.candidateId) details.push(`Winner: ${summary.winner.candidateId}.`)
  if (Number.isFinite(summary?.latency?.fastestMs)) details.push(`Fastest: ${summary.latency.fastestMs}ms.`)

  return {
    id: `developer-notification:${++developerNotificationOccurrenceId}`,
    variant: 'success',
    title: 'Region Comparison complete',
    message: details.join(' ') || 'Region Comparison completed.',
    body: Object.freeze({
      type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS,
      payload: Object.freeze(createRegionComparisonNotificationViewModel({
        analysis: summary,
        results: result.results,
        totalElapsedMs: result.summary?.totalElapsedMs
      }))
    })
  }
}

function createRegionComparisonFailureNotification(error) {
  return {
    id: `developer-notification:${++developerNotificationOccurrenceId}`,
    variant: 'error',
    title: 'Region Comparison failed',
    message: error?.message || 'Region Comparison failed. Please try again.'
  }
}

function beginRegionSelection(target) {
  if (regionOcrState.value === REGION_OCR_STATE.PROCESSING) return
  if (regionOcrState.value === REGION_OCR_STATE.SELECTING) {
    if (regionSelectionTarget.value === target) {
      exitRegionSelection()
      return
    }
  }
  if (!regionOcrAvailable.value) return
  regionOcrNotice.value = null
  regionSelectionTarget.value = target
  regionOcrState.value = REGION_OCR_STATE.SELECTING
}

function exitRegionSelection() {
  if (regionOcrState.value === REGION_OCR_STATE.SELECTING) {
    setRegionOcrIdle()
  }
}

function setRegionOcrIdle() {
  regionOcrState.value = REGION_OCR_STATE.IDLE
  regionSelectionTarget.value = null
}

function handleRegionOcrOutcome(result) {
  if (regionOcrState.value !== REGION_OCR_STATE.PROCESSING) return
  setRegionOcrIdle()

  if (result?.status === 'recognized' && !String(result?.data?.text || '').trim()) {
    regionOcrNotice.value = {
      variant: 'warning',
      title: 'Region OCR',
      message: 'No text found in the selected region.'
    }
  } else if (result?.status === 'failed') {
    regionOcrNotice.value = {
      variant: 'error',
      title: 'Region OCR',
      message: 'OCR failed. Please try another region.'
    }
  }
}

function handleRegionOcrFailure() {
  handleRegionOcrOutcome({ status: 'failed' })
}

function handleRegionOcrRecognized(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const position = activeRegionPosition
  activeRegionPosition = null
  if (!text || !position) return

  void pdfWindowsHostRef.value?.openTranslation?.({
    text,
    position
  })
}

function handleTranslatedPaneCurrentPageChange(pageNumber) {
  if (showOriginalPane.value) return
  handleCurrentPageChange(pageNumber)
}

function handleTranslateVisiblePages() {
  void translateVisiblePages()
}

function handleCancelTranslation() {
  void cancelTranslation()
}

async function handleExportTxt() {
  clearExportSuccess()
  clearExportError()
  if (await exportTxt()) {
    showExportSuccess('TXT')
  }
}

async function handleExportMarkdown() {
  clearExportSuccess()
  clearExportError()
  if (await exportMarkdown()) {
    showExportSuccess('Markdown')
  }
}

async function handleExportHtml() {
  clearExportSuccess()
  clearExportError()
  const canvasDataUrls = pdfViewerRef.value?.collectCanvasDataUrls?.() || new Map()
  if (await exportHtml(canvasDataUrls)) {
    showExportSuccess('HTML')
  }
}

function handleClearCache() {
  void clearDocumentCache()
}

function dismissPdfStatusBanner() {
  if (!pdfStatusBanner.value?.id || !pdfStatusBanner.value.dismissible) {
    return
  }
  dismissedPdfStatusBannerKey.value = pdfStatusBanner.value.id
}

function clearExportSuccess() {
  if (exportSuccessTimer.value) {
    clearTimeout(exportSuccessTimer.value)
    exportSuccessTimer.value = null
  }

  exportSuccess.value = null
}

function showExportSuccess(formatLabel) {
  clearExportSuccess()
  exportSuccess.value = {
    variant: 'success',
    title: `${formatLabel} export ready`,
    message: `${formatLabel} export downloaded successfully.`,
    detail: ''
  }

  exportSuccessTimer.value = setTimeout(() => {
    exportSuccess.value = null
    exportSuccessTimer.value = null
  }, EXPORT_SUCCESS_DURATION_MS)
}

onMounted(() => {
  if (import.meta.env.DEV) {
    import('./debug/pdfOverlayDiagnostics.js')
  }

  const handler = (message) => {
    if (message.action === 'THEME_CHANGED') {
      applyTheme(message.payload.theme)
    }
  }
  browser.runtime.onMessage.addListener(handler)
  removeThemeMessageListener = () => browser.runtime.onMessage.removeListener(handler)

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const mqHandler = () => {
    if (settingsStore.settings.THEME === 'auto') {
      applyTheme('auto')
    }
  }
  mq.addEventListener('change', mqHandler)
  themeMediaQuery = mq
  themeMqHandler = mqHandler

  document.addEventListener('keydown', handleRegionOcrKeyDown)
})

onBeforeUnmount(() => {
  clearExportSuccess()
  activeRegionPosition = null
  activeRegionComparisonOperation?.cancel()
  activeRegionComparisonOperation = null
  setRegionOcrIdle()
  detachDocument()
  void cleanup()

  if (removeThemeMessageListener) {
    removeThemeMessageListener()
    removeThemeMessageListener = null
  }
  if (themeMediaQuery && themeMqHandler) {
    themeMediaQuery.removeEventListener('change', themeMqHandler)
  }
  document.removeEventListener('keydown', handleRegionOcrKeyDown)
})

function handleRegionOcrKeyDown(event) {
  if (event.key !== 'Escape' || regionOcrState.value !== REGION_OCR_STATE.SELECTING) return
  event.preventDefault()
  exitRegionSelection()
}
</script>
