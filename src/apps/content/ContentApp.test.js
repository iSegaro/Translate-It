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
        props: ['visible', 'showConsentNotice', 'consentAccepted'],
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

describe('ContentApp - Live Caption Consent Notice Integration', () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useLiveCaptionStore();
    store.reset();
    vi.clearAllMocks();
  });

  it('handles live-caption-start-request event and registers consent notice flow', async () => {
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

    // Verify initial state: overlay and consent are hidden
    expect(store.overlayVisible).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);

    // Simulate clicking Popup start (emits event on pageEventBus)
    pageEventBus.emit('live-caption-start-request-popup');
    await nextTick();

    // Verify that store states are correctly updated to show consent notice first
    expect(store.overlayVisible).toBe(true);
    expect(store.consentNoticeVisible).toBe(true);
    expect(store.consentAccepted).toBe(false);
    expect(mockStart).not.toHaveBeenCalled();

    // Verify LiveCaptionOverlay displays consent panel
    // Note: Since all defineAsyncComponent components are resolved to AsyncComponentStub,
    // we find the stub representing the overlay.
    const overlays = wrapper.findAll('.async-stub');
    // LiveCaptionOverlay is rendered when overlayVisible is true
    expect(overlays.length).toBeGreaterThan(0);

    // Emulating the events directly from our store callbacks as the stub UI doesn't render full markup
    await wrapper.vm.handleLiveCaptionAcceptConsent();
    await nextTick();

    // Verify consent states are updated and controller.start() gets called
    expect(store.consentAccepted).toBe(true);
    expect(store.consentNoticeVisible).toBe(false);
    expect(mockStart).toHaveBeenCalled();
  });
});
