import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pageRootEls, pageRectMap, mapperMock, executeRegionOcrMock, cancelRegionOcrMock } = vi.hoisted(() => {
  const pageRootEls = new Map()
  const pageRectMap = new Map()
  return {
    pageRootEls,
    pageRectMap,
    mapperMock: vi.fn(),
    executeRegionOcrMock: vi.fn(),
    cancelRegionOcrMock: vi.fn()
  }
})

function buildRect(top, height = 100, width = 300, left = 0) {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top
  }
}

vi.mock('./PdfPageView.vue', () => ({
  default: defineComponent({
    name: 'PdfPageView',
    props: {
      page: { type: Object, required: true },
      session: { type: Object, required: true },
      visible: { type: Boolean, default: false },
      renderAllowed: { type: Boolean, default: true },
      renderPriority: { type: Number, default: null },
      renderPriorityGroup: { type: String, default: '' },
      clearOnUnmount: { type: Boolean, default: true },
      regionSelectionActive: { type: Boolean, default: false },
      regionSelectionRect: { type: Object, default: null }
    },
    emits: [
      'render-started',
      'render-committed',
      'render-cancelled',
      'render-failed',
      'region-selection-pointer-down',
      'region-selection-pointer-move',
      'region-selection-pointer-up',
      'region-selection-pointer-cancel',
      'region-selection-lost-pointer-capture',
      'region-selection-page-unmounted'
    ],
    setup(props, { expose }) {
      const rootEl = ref(null)

      onMounted(() => {
        if (!rootEl.value) return

        rootEl.value.dataset.pageNumber = String(props.page.pageNumber)
        rootEl.value.getBoundingClientRect = () => pageRectMap.get(props.page.pageNumber) || buildRect(0)
        pageRootEls.set(props.page.pageNumber, rootEl.value)
      })

      onBeforeUnmount(() => {
        if (props.clearOnUnmount) {
          props.session.clearPage?.(props.page.pageNumber)
        }
      })

      expose({
        getRootEl: () => rootEl.value,
        rootEl
      })
      return () => h('article', { ref: rootEl, class: 'pdf-page' })
    }
  })
}))

vi.mock('@/features/pdf-translation/core/PdfRegionMapper.js', () => ({
  mapPageLocalCssRectToPdfRegion: mapperMock
}))

vi.mock('../composables/usePdfRegionOcr.js', () => ({
  usePdfRegionOcr: () => ({
    outcome: { value: null },
    isProcessing: { value: false },
    executeRegionOcr: executeRegionOcrMock,
    cancelRegionOcr: cancelRegionOcrMock
  })
}))

import PdfViewer from './PdfViewer.vue'
import { VIEWER_ROLE } from '../composables/usePdfViewerMode.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

const observeMock = vi.fn()
const disconnectMock = vi.fn()
const resizeObserveMock = vi.fn()
const resizeDisconnectMock = vi.fn()
let intersectionObserverClass
let resizeObserverClass
let visibilityCallback
const waitAnimationFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

function createSession() {
  return {
    updateVisiblePages: vi.fn(),
    getPageViewport: vi.fn(),
    pdfDocument: { getPage: vi.fn() }
  }
}

function createPages(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    pageNumber: index + 1,
    width: 100,
    height: 100,
    scale: 1
  }))
}

function setViewerViewport(wrapper, { height = 100, scrollTop = 0 } = {}) {
  const viewerEl = wrapper.find('.pdf-viewer').element
  Object.defineProperty(viewerEl, 'clientHeight', {
    configurable: true,
    get: () => height
  })
  viewerEl.scrollTop = scrollTop
  viewerEl.getBoundingClientRect = () => buildRect(0, height, 300)
}

function setPageTops(tops) {
  for (const [pageNumber, top] of Object.entries(tops)) {
    pageRectMap.set(Number(pageNumber), buildRect(top, 100, 300))
  }
}

function lastVisiblePages(session) {
  const lastCall = session.updateVisiblePages.mock.calls.at(-1)
  return lastCall ? [...lastCall[0]].sort((a, b) => a - b) : []
}

async function updatePages(wrapper) {
  await wrapper.setProps({ pages: createPages() })
  await nextTick()
}

function createFarPageTops(count, defaultTop = 10000) {
  const tops = {}
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    tops[pageNumber] = defaultTop + pageNumber * 200
  }
  return tops
}

async function mountViewerWithPages({ count = 75, session = createSession(), viewerRole = VIEWER_ROLE.ORIGINAL } = {}) {
  const pages = createPages(count)
  const wrapper = mount(PdfViewer, {
    props: {
      pages,
      session,
      viewerRole
    },
    attachTo: document.body
  })

  setViewerViewport(wrapper)
  await nextTick()
  await nextTick()
  return { wrapper, session, pages }
}

async function applyWindow(wrapper, tops) {
  setPageTops(tops)
  wrapper.vm.refreshRenderWindow()
  await nextTick()
}

describe('PdfViewer', () => {
  beforeEach(() => {
    observeMock.mockClear()
    disconnectMock.mockClear()
    resizeObserveMock.mockClear()
    resizeDisconnectMock.mockClear()
    mapperMock.mockReset()
    executeRegionOcrMock.mockReset()
    cancelRegionOcrMock.mockReset()
    pageRootEls.clear()
    pageRectMap.clear()
    visibilityCallback = null
    let instanceCount = 0

    intersectionObserverClass = class IntersectionObserver {
      constructor(callback) {
        this._index = instanceCount++
        if (this._index === 0) {
          visibilityCallback = callback
        }
      }
      observe(target) {
        observeMock(target)
      }
      disconnect() {
        disconnectMock()
      }
    }

    resizeObserverClass = class ResizeObserver {
      constructor() {}
      observe(target) {
        resizeObserveMock(target)
      }
      disconnect() {
        resizeDisconnectMock()
      }
    }

    vi.stubGlobal('IntersectionObserver', intersectionObserverClass)
    vi.stubGlobal('ResizeObserver', resizeObserverClass)
  })

  it('keeps one originating page active and emits its completed CSS rectangle', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 2 })
    await wrapper.setProps({ regionSelectionActive: true })
    const pageViews = wrapper.findAllComponents({ name: 'PdfPageView' })
    const surface = document.createElement('div')
    const captured = new Set()
    surface.getBoundingClientRect = () => buildRect(20, 100, 100, 10)
    surface.setPointerCapture = (pointerId) => captured.add(pointerId)
    surface.hasPointerCapture = (pointerId) => captured.has(pointerId)
    surface.releasePointerCapture = (pointerId) => captured.delete(pointerId)
    const event = (clientX, clientY) => ({
      button: 0,
      isPrimary: true,
      pointerId: 7,
      clientX,
      clientY,
      currentTarget: surface,
      preventDefault: vi.fn()
    })

    pageViews[0].vm.$emit('region-selection-pointer-down', 1, event(30, 40))
    await nextTick()

    expect(pageViews[0].props('regionSelectionRect')).toEqual({ x: 20, y: 20, width: 0, height: 0 })
    expect(pageViews[1].props('regionSelectionRect')).toBeNull()

    pageViews[0].vm.$emit('region-selection-pointer-up', 1, event(80, 90))
    await nextTick()

    expect(wrapper.emitted('region-selection-complete')).toEqual([[
      { pageNumber: 1, rect: { x: 20, y: 20, width: 50, height: 50 } }
    ]])
    wrapper.unmount()
  })

  it('maps completed selection and hands canonical PdfRegion to Region OCR composable', async () => {
    const viewport = { id: 'viewport' }
    const pdfDocument = { getPage: vi.fn() }
    const session = {
      ...createSession(),
      pdfDocument,
      getPageViewport: vi.fn(() => viewport)
    }
    const mappedRegion = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    mapperMock.mockReturnValue(mappedRegion)
    const { wrapper } = await mountViewerWithPages({ count: 1, session })
    await wrapper.setProps({ regionSelectionActive: true, regionOcrScale: 2, regionOcrLanguage: 'eng' })
    const pageView = wrapper.findComponent({ name: 'PdfPageView' })
    const surface = document.createElement('div')
    surface.getBoundingClientRect = () => buildRect(20, 100, 100, 10)
    surface.setPointerCapture = vi.fn()
    surface.releasePointerCapture = vi.fn()
    const event = (clientX, clientY) => ({
      button: 0,
      isPrimary: true,
      pointerId: 3,
      clientX,
      clientY,
      currentTarget: surface,
      preventDefault: vi.fn()
    })

    pageView.vm.$emit('region-selection-pointer-down', 1, event(30, 40))
    pageView.vm.$emit('region-selection-pointer-up', 1, event(80, 90))
    await nextTick()

    expect(session.getPageViewport).toHaveBeenCalledWith(1)
    expect(mapperMock).toHaveBeenCalledWith({
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 50, height: 50 },
      viewport
    })
    expect(executeRegionOcrMock).toHaveBeenCalledWith({
      region: mappedRegion,
      pdfDocument,
      scale: 2,
      language: 'eng'
    })
    wrapper.unmount()
  })

  it('does not execute Region OCR when mapping fails', async () => {
    const session = {
      ...createSession(),
      getPageViewport: vi.fn(() => ({ id: 'viewport' }))
    }
    mapperMock.mockReturnValue(null)
    const { wrapper } = await mountViewerWithPages({ count: 1, session })
    await wrapper.setProps({ regionSelectionActive: true, regionOcrScale: 2, regionOcrLanguage: 'eng' })
    const pageView = wrapper.findComponent({ name: 'PdfPageView' })
    const surface = document.createElement('div')
    surface.getBoundingClientRect = () => buildRect(0, 100, 100)
    surface.setPointerCapture = vi.fn()
    surface.releasePointerCapture = vi.fn()
    const event = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      currentTarget: surface,
      preventDefault: vi.fn()
    }

    pageView.vm.$emit('region-selection-pointer-down', 1, event)
    pageView.vm.$emit('region-selection-pointer-up', 1, { ...event, clientX: 50, clientY: 50 })
    await nextTick()

    expect(mapperMock).toHaveBeenCalledOnce()
    expect(executeRegionOcrMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('preserves viewer-role guard for region selection', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 1, viewerRole: VIEWER_ROLE.OVERLAY })
    await wrapper.setProps({ regionSelectionActive: true })

    expect(wrapper.findComponent({ name: 'PdfPageView' }).props('regionSelectionActive')).toBe(false)
    wrapper.unmount()
  })

  it('cancels selection when the originating page unmounts', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 1 })
    await wrapper.setProps({ regionSelectionActive: true })
    const pageView = wrapper.findComponent({ name: 'PdfPageView' })
    const surface = document.createElement('div')
    surface.getBoundingClientRect = () => buildRect(0, 100, 100)
    surface.setPointerCapture = vi.fn()
    surface.releasePointerCapture = vi.fn()
    const event = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      currentTarget: surface,
      preventDefault: vi.fn()
    }

    pageView.vm.$emit('region-selection-pointer-down', 1, event)
    pageView.vm.$emit('region-selection-page-unmounted', 1)
    pageView.vm.$emit('region-selection-pointer-up', 1, { ...event, clientX: 50, clientY: 50 })
    await nextTick()

    expect(wrapper.emitted('region-selection-complete')).toBeFalsy()
    wrapper.unmount()
  })

  it('observes raw page root elements from exposed page views', async () => {
    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session: {
          updateVisiblePages: vi.fn(),
        }
      },
      attachTo: document.body
    })

    wrapper.find('.pdf-viewer').element.getBoundingClientRect = () => buildRect(0, 500, 300)

    await nextTick()
    await nextTick()

    expect(observeMock).toHaveBeenCalledWith(pageRootEls.get(1))

    wrapper.unmount()
  })

  it('emits the primary page as the current page', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      
    }
    pageRectMap.set(1, buildRect(10, 100, 300))
    pageRectMap.set(2, buildRect(120, 100, 300))

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [
          { pageNumber: 1, width: 100, height: 100, scale: 1 },
          { pageNumber: 2, width: 100, height: 100, scale: 1 }
        ],
        session
      },
      attachTo: document.body
    })

    wrapper.find('.pdf-viewer').element.getBoundingClientRect = () => buildRect(0, 500, 300)

    await nextTick()
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    pageRectMap.set(1, buildRect(-60, 100, 300))
    pageRectMap.set(2, buildRect(20, 100, 300))
    await wrapper.setProps({
      pages: [
        { pageNumber: 1, width: 100, height: 100, scale: 1 },
        { pageNumber: 2, width: 100, height: 100, scale: 1 }
      ]
    })

    await waitAnimationFrame()
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(2)

    wrapper.unmount()
  })

  it('emits visible-pages-change only when the visible set changes', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 3 })

    await applyWindow(wrapper, {
      1: 0,
      2: 120,
      3: 1000
    })
    const firstCount = wrapper.emitted('visible-pages-change')?.length || 0
    const firstVisiblePages = wrapper.emitted('visible-pages-change')?.at(-1)?.[0] || []
    expect([...firstVisiblePages].sort((a, b) => a - b)).toEqual([1])

    await applyWindow(wrapper, {
      1: 0,
      2: 120,
      3: 1000
    })
    expect(wrapper.emitted('visible-pages-change')?.length || 0).toBe(firstCount)

    await applyWindow(wrapper, {
      1: -120,
      2: 0,
      3: 120
    })
    expect(wrapper.emitted('visible-pages-change')?.length || 0).toBe(firstCount + 1)
    const lastVisiblePages = wrapper.emitted('visible-pages-change')?.at(-1)?.[0] || []
    expect([...lastVisiblePages].sort((a, b) => a - b)).toEqual([2])

    wrapper.unmount()
  })

  it('emits current page from geometry without waiting for observer visibility', async () => {
    pageRectMap.set(1, buildRect(10, 100, 300))

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session: {
          updateVisiblePages: vi.fn(),
          
        }
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    wrapper.unmount()
  })

  it('suppresses explicit current-page refresh while current-page updates are suppressed', async () => {
    pageRectMap.set(1, buildRect(10, 100, 300))

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session: createSession(),
        suppressCurrentPageUpdates: true
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()
    wrapper.vm.refreshCurrentPage()

    expect(wrapper.emitted('current-page-change')).toBeFalsy()

    await wrapper.setProps({ suppressCurrentPageUpdates: false })
    wrapper.vm.refreshCurrentPage()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    wrapper.unmount()
  })

  it('emits both width and height for layout changes', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      
    }

    const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

    try {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 960
      })
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get: () => 720
      })

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      expect(wrapper.emitted('layout-change')?.at(-1)?.[0]).toEqual({ width: 960, height: 720 })

      wrapper.unmount()
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor)
      }
      if (heightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor)
      }
    }
  })

  it('rebuilds observers when scroll container changes', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      
    }
    const firstRoot = document.createElement('div')
    const secondRoot = document.createElement('div')

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session,
        scrollContainer: firstRoot
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(resizeObserveMock).toHaveBeenCalledWith(firstRoot)
    const disconnectCount = disconnectMock.mock.calls.length
    const resizeDisconnectCount = resizeDisconnectMock.mock.calls.length

    await wrapper.setProps({ scrollContainer: secondRoot })
    await nextTick()
    await nextTick()

    expect(disconnectMock.mock.calls.length).toBeGreaterThan(disconnectCount)
    expect(resizeDisconnectMock.mock.calls.length).toBeGreaterThan(resizeDisconnectCount)
    expect(resizeObserveMock).toHaveBeenCalledWith(secondRoot)
    expect(observeMock).toHaveBeenCalledWith(pageRootEls.get(1))

    wrapper.unmount()
  })

  it('keeps existing render candidates unchanged while eviction is frozen', async () => {
    const session = createSession()
    setPageTops({ 1: -100, 2: 0, 3: 100, 4: 200 })

    const wrapper = mount(PdfViewer, {
      props: {
        pages: createPages(),
        session
      },
      attachTo: document.body
    })

    setViewerViewport(wrapper)
    await updatePages(wrapper)
    await waitAnimationFrame()
    await nextTick()

    expect(lastVisiblePages(session)).toEqual([2])

    await wrapper.setProps({ freezeRenderWindowEviction: true })
    setPageTops({ 1: -300, 2: -200, 3: -100, 4: 0 })
    await updatePages(wrapper)

    expect(lastVisiblePages(session)).toEqual([2])

    wrapper.unmount()
  })

  it('does not seed render candidates while eviction is frozen', async () => {
    const session = createSession()
    setPageTops({ 1: -100, 2: 0, 3: 100, 4: 200 })

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [],
        session,
        freezeRenderWindowEviction: true
      },
      attachTo: document.body
    })

    setViewerViewport(wrapper)
    await wrapper.setProps({ pages: createPages() })
    await nextTick()
    await nextTick()

    expect(session.updateVisiblePages).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('commits pending replacement locally from overlay render commits', async () => {
    const { wrapper } = await mountViewerWithPages({ viewerRole: VIEWER_ROLE.OVERLAY })

    await applyWindow(wrapper, {
      ...createFarPageTops(75),
      1: -100,
      2: 0,
      3: 100
    })
    await applyWindow(wrapper, {
      ...createFarPageTops(75),
      69: -100,
      70: 0,
      71: 100
    })

    const beforeCommit = wrapper.findAllComponents({ name: 'PdfPageView' })
      .filter(component => component.props('visible'))
      .map(component => component.props('page').pageNumber)
      .sort((a, b) => a - b)
    const page70 = wrapper.findAllComponents({ name: 'PdfPageView' })
      .find(component => component.props('page').pageNumber === 70)
    page70.vm.$emit('render-committed', 70)
    await nextTick()
    const afterCommit = wrapper.findAllComponents({ name: 'PdfPageView' })
      .filter(component => component.props('visible'))
      .map(component => component.props('page').pageNumber)
      .sort((a, b) => a - b)

    expect(beforeCommit).toEqual([1, 2, 3, 70])
    expect(afterCommit).toEqual([69, 70, 71])

    wrapper.unmount()
  })

  it('processes overlay render lifecycle events without shared session updates', async () => {
    const { wrapper, session } = await mountViewerWithPages({ viewerRole: VIEWER_ROLE.OVERLAY })

    await applyWindow(wrapper, {
      ...createFarPageTops(75),
      1: -100,
      2: 0,
      3: 100
    })

    const page2 = wrapper.findAllComponents({ name: 'PdfPageView' })
      .find(component => component.props('page').pageNumber === 2)

    const page3 = wrapper.findAllComponents({ name: 'PdfPageView' })
      .find(component => component.props('page').pageNumber === 3)

    expect(page3.props('renderAllowed')).toBe(false)

    page2.vm.$emit('render-started', 2)
    await nextTick()

    expect(page3.props('renderAllowed')).toBe(true)

    page2.vm.$emit('render-failed', 2)
    page2.vm.$emit('render-committed', 2)
    await nextTick()

    expect(session.updateVisiblePages).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('passes render priority metadata to page views', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 6 })

    await applyWindow(wrapper, {
      ...createFarPageTops(6),
      1: -100,
      2: 0,
      3: 100
    })

    const pageViews = wrapper.findAllComponents({ name: 'PdfPageView' })
    const page2 = pageViews.find(component => component.props('page').pageNumber === 2)
    const page1 = pageViews.find(component => component.props('page').pageNumber === 1)
    const page3 = pageViews.find(component => component.props('page').pageNumber === 3)

    expect(page2.props('renderPriority')).toBe(0)
    expect(page2.props('renderPriorityGroup')).toBe('primary-visible')
    expect(page1.props('renderPriorityGroup')).toBe('near-buffer')
    expect(page3.props('renderPriorityGroup')).toBe('near-buffer')

    wrapper.unmount()
  })

  it('passes render eligibility to page views', async () => {
    const { wrapper } = await mountViewerWithPages({ count: 6 })

    await applyWindow(wrapper, {
      ...createFarPageTops(6),
      1: -100,
      2: 0,
      3: 100
    })

    const pageViews = wrapper.findAllComponents({ name: 'PdfPageView' })
    const page1 = pageViews.find(component => component.props('page').pageNumber === 1)
    const page2 = pageViews.find(component => component.props('page').pageNumber === 2)
    const page3 = pageViews.find(component => component.props('page').pageNumber === 3)

    expect(page1.props('renderAllowed')).toBe(false)
    expect(page2.props('renderAllowed')).toBe(true)
    expect(page3.props('renderAllowed')).toBe(false)

    page2.vm.$emit('render-started', 2)
    await nextTick()

    expect(page1.props('renderAllowed')).toBe(true)
    expect(page2.props('renderAllowed')).toBe(true)
    expect(page3.props('renderAllowed')).toBe(true)

    wrapper.unmount()
  })

  // ── viewerRole ───────────────────────────────────────────────

  describe('viewerRole', () => {
    it('defaults to VIEWER_ROLE.ORIGINAL', () => {
      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session: {
            updateVisiblePages: vi.fn(),
            
          }
        }
      })

      expect(wrapper.props('viewerRole')).toBe(VIEWER_ROLE.ORIGINAL)
    })

    it('does not emit layout-change for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        
      }

      const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
      const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

      try {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get: () => 960
        })
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
          configurable: true,
          get: () => 720
        })

        const wrapper = mount(PdfViewer, {
          props: {
            pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
            session,
            viewerRole: VIEWER_ROLE.OVERLAY
          },
          attachTo: document.body
        })

        await nextTick()
        await nextTick()

        expect(wrapper.emitted('layout-change')).toBeFalsy()

        wrapper.unmount()
      } finally {
        if (widthDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor)
        }
        if (heightDescriptor) {
          Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor)
        }
      }
    })

    it('does not emit current-page-change for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [
            { pageNumber: 1, width: 100, height: 100, scale: 1 },
            { pageNumber: 2, width: 100, height: 100, scale: 1 }
          ],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      visibilityCallback?.([
        { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
      ])

      await nextTick()

      expect(wrapper.emitted('current-page-change')).toBeFalsy()

      wrapper.unmount()
    })

    it('does not call session.updateVisiblePages for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      visibilityCallback?.([
        { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
      ])

      await nextTick()

      expect(session.updateVisiblePages).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('does not let overlay page unmount clear shared session pages', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        
        clearPage: vi.fn()
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 82, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      wrapper.unmount()

      expect(session.clearPage).not.toHaveBeenCalled()
    })

  })
})
