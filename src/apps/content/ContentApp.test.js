import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref, reactive } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { pageEventBus } from '@/core/PageEventBus.js';
import { useLiveCaptionStore } from '@/features/live-caption/stores/liveCaption.js';

// Mock defineAsyncComponent from vue to resolve immediately as a dummy component
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    defineAsyncComponent: (loader) => {
      return {
        name: 'AsyncComponentStub',
        props: ['visible'],
        template: '<div class="async-stub"><slot></slot></div>'
      };
    }
  };
});

// We must import ContentApp AFTER mocking vue
import ContentApp from './ContentApp.vue';

// Mock static components
vi.mock('@/features/text-field-interaction/components/TextFieldIcon.vue', () => ({
  default: { name: 'TextFieldIcon', render: () => null }
}));

// Mock settings store reactively
const mockSettingsStoreObj = reactive({
  isInitialized: true,
  isDarkTheme: false,
  settings: {
    THEME: 'light',
    SHOW_DESKTOP_FAB: true,
    LIVE_CAPTION_DISPLAY_MODE: 'translated_only'
  }
});

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStoreObj,
  default: () => mockSettingsStoreObj
}));

// Mock mobile store reactively
const mockMobileStoreObj = reactive({
  hasElementTranslations: false,
  isOpen: false,
  isFullscreen: false
});

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => mockMobileStoreObj
}));

// Mock resource tracker
vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    trackResource: vi.fn((key, cleanup) => cleanup),
    trackTimeout: vi.fn(),
    addEventListener: vi.fn(),
    cleanup: vi.fn()
  })
}));

// Mock other composables
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
}));

vi.mock('@/apps/content/composables/useContentAppLocalization.js', () => ({
  useContentAppLocalization: () => ({
    toastRTL: ref('ltr'),
    updateToastRTL: vi.fn()
  })
}));

vi.mock('@/apps/content/composables/useContentAppUIState.js', () => ({
  useContentAppUIState: () => ({
    isTopFrame: ref(true),
    shouldShowGlobalUI: ref(true),
    isSelectModeActive: ref(false),
    isScreenCaptureActive: ref(false),
    isFullscreen: ref(false),
    isExtensionEnabled: ref(true),
    showDesktopFab: ref(true),
    showMobileFab: ref(false),
    isMobileUI: ref(false)
  })
}));

vi.mock('@/apps/content/composables/useContentAppNotifications.js', () => ({
  useContentAppNotifications: vi.fn()
}));

vi.mock('@/apps/content/composables/useContentAppTextFieldIcons.js', () => ({
  useContentAppTextFieldIcons: () => ({
    activeIcons: ref([]),
    onIconClick: vi.fn(),
    onIconPositionUpdated: vi.fn(),
    setIconRef: vi.fn()
  })
}));

vi.mock('@/apps/content/composables/useContentAppPageTranslation.js', () => ({
  useContentAppPageTranslation: vi.fn()
}));

vi.mock('@/apps/content/composables/useContentAppLifecycle.js', () => ({
  useContentAppLifecycle: vi.fn()
}));

// Mock Live Caption Runtime Controller as a proper constructor
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/live-caption/content/index.js', () => ({
  LiveCaptionRuntimeController: vi.fn().mockImplementation(function() {
    this.start = mockStart;
    this.stop = mockStop;
    this.currentVideoElement = null;
  })
}));

describe('ContentApp - Live Caption Integration', () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useLiveCaptionStore();
    store.reset();
    vi.clearAllMocks();
  });

  it('handles live-caption-start-request event and starts directly', async () => {
    const wrapper = mount(ContentApp, {
      global: {
        stubs: {
          Toaster: true,
          TextFieldIcon: true
        },
        mocks: {
          activeCapture: false
        }
      }
    });

    await flushPromises();
    await nextTick();

    // Verify initial state: overlay is hidden
    expect(store.overlayVisible).toBe(false);

    // Simulate clicking Popup start (emits event on pageEventBus)
    pageEventBus.emit('live-caption-start-request-popup');
    await nextTick();

    // Verify that overlay is visible and controller.start() gets called directly
    expect(store.overlayVisible).toBe(true);
    expect(mockStart).toHaveBeenCalled();
  });
});
