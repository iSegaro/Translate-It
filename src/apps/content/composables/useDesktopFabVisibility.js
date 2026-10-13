import { computed, onMounted, onUnmounted, ref } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getDesktopFabExclusionKey } from '@/features/desktop-fab/desktopFabExclusions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageCore } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useDesktopFabVisibility');

export function useDesktopFabVisibility({ getEnvironment = () => ({}) } = {}) {
  const isReady = ref(false);
  const isPersistentlyExcluded = ref(false);
  const override = ref('none');
  const isChildPresent = ref(false);
  const currentUrl = ref(window.location.href);
  let readVersion = 0;
  let mounted = false;
  let pendingPersistentDismissUrl = null;

  const isDismissed = computed(() =>
    !isReady.value || override.value === 'hide'
      || (isPersistentlyExcluded.value && override.value !== 'show')
  );

  const readExclusions = async ({ failClosed = false } = {}) => {
    const url = currentUrl.value;
    const version = ++readVersion;
    const keys = [
      getDesktopFabExclusionKey('page', url),
      getDesktopFabExclusionKey('site', url),
    ].filter(Boolean);

    if (failClosed || !isReady.value) isReady.value = false;
    try {
      const values = keys.length ? await storageCore.getFresh(keys) : {};
      if (!mounted || version !== readVersion || url !== currentUrl.value || url !== window.location.href) return;
      isPersistentlyExcluded.value = keys.some(key => Boolean(values[key]));
      isReady.value = true;
      if (pendingPersistentDismissUrl === url) {
        pendingPersistentDismissUrl = null;
        if (override.value === 'hide') override.value = 'none';
      }
    } catch (error) {
      if (!mounted || version !== readVersion || url !== currentUrl.value || url !== window.location.href) return;
      isPersistentlyExcluded.value = true;
      isReady.value = false;
      if (pendingPersistentDismissUrl === url) {
        pendingPersistentDismissUrl = null;
        if (override.value === 'hide') override.value = 'none';
      }
      logger.error('Failed to read Desktop FAB exclusions; keeping the FAB hidden', error);
    }
  };

  const handleStorageChanged = ({ key }) => {
    const url = currentUrl.value;
    const keys = [
      getDesktopFabExclusionKey('page', url),
      getDesktopFabExclusionKey('site', url),
    ].filter(Boolean);
    if (keys.includes(key)) {
      void readExclusions();
    }
  };

  const handleFeatureStatusChanged = () => {
    const url = window.location.href;
    if (url === currentUrl.value) return;
    currentUrl.value = url;
    override.value = 'none';
    pendingPersistentDismissUrl = null;
    void readExclusions({ failClosed: true });
  };

  const dismiss = (detail) => {
    if (detail?.scope === 'temporary') {
      pendingPersistentDismissUrl = null;
      override.value = 'hide';
    } else if (detail?.scope === 'page' || detail?.scope === 'site') {
      pendingPersistentDismissUrl = currentUrl.value;
      override.value = 'hide';
      void readExclusions();
    }
  };

  const getStatus = () => {
    const environment = getEnvironment();
    const status = (value, reason) => ({
      success: true,
      status: value,
      url: window.location.href,
      ...(reason ? { reason } : {}),
    });

    if (environment.isInitialized === false) return status('loading', 'settings-loading');
    if (environment.extensionEnabled === false || environment.showDesktopFab === false) {
      return status('unavailable', 'global-disabled');
    }
    if (environment.isMobileUI) return status('unavailable', 'mobile-ui');
    if (environment.isFullscreen) return status('unavailable', 'fullscreen');
    if (!environment.isTopFrame || environment.isRestricted) return status('unavailable', 'restricted-context');
    if (currentUrl.value !== window.location.href) return status('loading', 'navigation-pending');
    if (!isReady.value) return status('loading', 'exclusions-loading');
    if (override.value === 'hide') return status('hidden', 'override-hide');
    if (isPersistentlyExcluded.value && override.value !== 'show') return status('hidden', 'excluded');
    if (!isChildPresent.value) return status('loading', 'fab-settling');
    return status('visible');
  };

  const setOverride = ({ expectedUrl, override: nextOverride } = {}) => {
    if (expectedUrl !== window.location.href || currentUrl.value !== window.location.href) {
      return { ...getStatus(), success: false, status: 'unavailable', reason: 'stale-url' };
    }
    if (nextOverride !== 'show' && nextOverride !== 'hide') {
      return { ...getStatus(), success: false, status: 'unavailable', reason: 'invalid-override' };
    }
    if (pendingPersistentDismissUrl === currentUrl.value) {
      return { ...getStatus(), success: false, status: 'unavailable', reason: 'exclusion-reconciling' };
    }
    const currentStatus = getStatus();
    if (currentStatus.status !== 'visible' && currentStatus.status !== 'hidden') {
      return {
        ...currentStatus,
        success: false,
        status: 'unavailable',
        reason: currentStatus.reason || 'unavailable',
      };
    }

    override.value = nextOverride;
    return getStatus();
  };

  const setChildPresence = (present) => {
    isChildPresent.value = present === true;
  };

  onMounted(() => {
    mounted = true;
    currentUrl.value = window.location.href;
    storageCore.on('change', handleStorageChanged);
    pageEventBus.on('FEATURE_STATUS_CHANGED', handleFeatureStatusChanged);
    void readExclusions({ failClosed: true });
  });

  onUnmounted(() => {
    mounted = false;
    readVersion++;
    storageCore.off('change', handleStorageChanged);
    pageEventBus.off('FEATURE_STATUS_CHANGED', handleFeatureStatusChanged);
  });

  return { isReady, isDismissed, dismiss, getStatus, setOverride, setChildPresence };
}
