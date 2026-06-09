import { vi } from 'vitest';

// Set up global mock state
global.__mockBrowserInfo = {
  isMobile: false,
  isFirefox: false
};

// Mock compatibility.js directly
vi.mock('@/utils/browser/compatibility.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deviceDetector: {
      isMobile: () => global.__mockBrowserInfo.isMobile,
      isTouchDevice: () => false,
      shouldEnableMobileUI: () => global.__mockBrowserInfo.isMobile
    },
    getBrowserInfoSync: () => ({
      isFirefox: global.__mockBrowserInfo.isFirefox,
      isMobile: global.__mockBrowserInfo.isMobile,
      isChrome: !global.__mockBrowserInfo.isFirefox,
      isEdge: false,
      isTouch: false,
      os: 'WINDOWS',
      name: global.__mockBrowserInfo.isFirefox ? 'Firefox' : 'Chrome'
    })
  };
});

// Mock other dependencies
vi.mock('@/core/content-scripts/chunks/lazy-styles.js', () => ({
  fabUiStyles: ''
}));

vi.mock('@/utils/ui/styleInjector.js', () => ({
  injectStylesToShadowRoot: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/composables/shared/useUnifiedI18n', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn()
  })
}));

vi.mock('@/features/tts/composables/useTTSSmart.js', () => ({
  useTTSSmart: () => ({
    state: ref('idle'),
    play: vi.fn(),
    stop: vi.fn()
  })
}));

vi.mock('@/features/mouse-hover/composables/useMouseHoverToggle.js', () => ({
  useMouseHoverToggle: () => ({
    isMouseHoverEnabled: ref(false),
    toggleMouseHover: vi.fn()
  })
}));

vi.mock('@/apps/content/composables/useFabSelection.js', () => ({
  default: () => ({
    pendingSelection: ref({ hasSelection: false, mode: '' }),
    clearSelection: vi.fn()
  })
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  default: {
    getInstance: () => ({
      getFeatureStatus: vi.fn().mockResolvedValue({
        initialized: true,
        features: {
          selectElement: { allowed: true },
          pageTranslation: { allowed: true },
          screenCapture: { allowed: true },
          liveCaption: { allowed: true }
        }
      })
    })
  }
}));

vi.mock('@/features/page-translation/composables/useAutoTranslateRules.js', () => ({
  useAutoTranslateRules: () => ({
    isAutoTranslateToggleVisible: ref(false),
    isAutoTranslateToggleActive: ref(false),
    isAutoTranslateToggleDisabled: ref(false),
    autoTranslateToggleTitle: ref(''),
    toggleAutoTranslateForCurrentPage: vi.fn()
  })
}));

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => ({
    hasElementTranslations: false,
    clearTranslations: vi.fn(),
    pageTranslationData: {
      status: 'idle',
      isAutoTranslating: false
    }
  })
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  default: () => ({
    settings: {
      THEME: 'light',
      SHOW_DESKTOP_FAB: true,
      FAB_IDLE_OPACITY: 100,
      FAB_SIZE: '1',
      selectionTranslationMode: 'on_click'
    },
    isDarkTheme: false,
    loadSettings: vi.fn().mockResolvedValue(undefined),
    getEffectiveProvider: vi.fn().mockReturnValue('googlev2')
  })
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(true)
  }
}));

// Regular imports
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { pageEventBus } from '@/core/PageEventBus.js';
import DesktopFabMenu from './DesktopFabMenu.vue';

describe('DesktopFabMenu - Live Caption Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    global.__mockBrowserInfo.isMobile = false;
    global.__mockBrowserInfo.isFirefox = false;
  });

  it('determines live caption is allowed on Chrome/Edge Desktop', async () => {
    global.__mockBrowserInfo.isFirefox = false;
    global.__mockBrowserInfo.isMobile = false;

    const wrapper = mount(DesktopFabMenu, {
      global: {
        stubs: {
          PageTranslationStatus: true
        }
      }
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.allowedFeatures.liveCaption).toBe(true);
  });

  it('determines live caption is NOT allowed on Firefox', async () => {
    global.__mockBrowserInfo.isFirefox = true;
    global.__mockBrowserInfo.isMobile = false;

    const wrapper = mount(DesktopFabMenu, {
      global: {
        stubs: {
          PageTranslationStatus: true
        }
      }
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.allowedFeatures.liveCaption).toBe(false);
  });

  it('determines live caption is NOT allowed on Mobile browser', async () => {
    global.__mockBrowserInfo.isFirefox = false;
    global.__mockBrowserInfo.isMobile = true;

    const wrapper = mount(DesktopFabMenu, {
      global: {
        stubs: {
          PageTranslationStatus: true
        }
      }
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.allowedFeatures.liveCaption).toBe(false);
  });

  it('emits live-caption-start-request on pageEventBus when Live Caption is clicked', async () => {
    global.__mockBrowserInfo.isFirefox = false;
    global.__mockBrowserInfo.isMobile = false;

    const emitSpy = vi.spyOn(pageEventBus, 'emit');

    const wrapper = mount(DesktopFabMenu, {
      global: {
        stubs: {
          PageTranslationStatus: true
        }
      }
    });

    await flushPromises();
    await nextTick();

    const liveCaptionItem = wrapper.vm.menuItems.find(item => item.id === 'live_caption');
    expect(liveCaptionItem).toBeDefined();

    await liveCaptionItem.action();

    expect(emitSpy).toHaveBeenCalledWith('live-caption-start-request');
  });
});
