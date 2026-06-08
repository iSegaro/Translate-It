import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref, nextTick } from 'vue'
import MobileSheet from './MobileSheet.vue'

let mockMobileStore
let mockSettingsStore

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => mockMobileStore
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}))

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
}))

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    TTS_STOP: 'TTS_STOP'
  }
}))

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false)
  }
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@/shared/constants/mobile.js', () => ({
  MOBILE_CONSTANTS: {
    VIEWS: {
      DASHBOARD: 'dashboard',
      SELECTION: 'selection',
      INPUT: 'input',
      PAGE_TRANSLATION: 'page-translation',
      HISTORY: 'history'
    },
    SHEET_STATE: {
      PEEK: 'peek',
      FULL: 'full',
      CLOSED: 'closed'
    }
  }
}))

vi.mock('./views/DashboardView.vue', () => ({
  default: {
    name: 'DashboardView',
    template: '<div class="dashboard-view-stub" />'
  }
}))

vi.mock('./views/SelectionView.vue', () => ({
  default: {
    name: 'SelectionView',
    template: '<div class="selection-view-stub" />'
  }
}))

vi.mock('./views/InputView.vue', () => ({
  default: {
    name: 'InputView',
    template: `
      <div class="input-view-stub">
        <select class="test-native-select">
          <option value="en">English</option>
        </select>
        <div class="test-dead-zone">Dead zone</div>
      </div>
    `
  }
}))

vi.mock('./views/PageTranslationView.vue', () => ({
  default: {
    name: 'PageTranslationView',
    template: '<div class="page-translation-view-stub" />'
  }
}))

vi.mock('./views/HistoryView.vue', () => ({
  default: {
    name: 'HistoryView',
    template: '<div class="history-view-stub" />'
  }
}))

describe('MobileSheet', () => {
  beforeEach(() => {
    mockMobileStore = reactive({
      isOpen: ref(true),
      activeView: ref('input'),
      sheetState: ref('peek'),
      isFullscreen: ref(false),
      closeSheet: vi.fn(),
      setSheetState: vi.fn(),
      navigate: vi.fn()
    })

    mockSettingsStore = reactive({
      isDarkTheme: false
    })

    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))

    window.visualViewport = { height: 800 }
    window.innerHeight = 800
  })

  afterEach(() => {
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.documentElement.style.overflow = ''
    delete window.visualViewport
  })

  it('allows native select controls to bypass sheet mousedown suppression', async () => {
    const wrapper = mount(MobileSheet)
    await nextTick()

    const select = wrapper.get('.test-native-select').element
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    })

    select.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('still suppresses mousedown on non-interactive sheet content', async () => {
    const wrapper = mount(MobileSheet)
    await nextTick()

    const deadZone = wrapper.get('.test-dead-zone').element
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    })

    deadZone.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})
