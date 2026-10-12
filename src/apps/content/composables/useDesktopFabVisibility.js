import { computed, onMounted, onUnmounted, ref } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getDesktopFabExclusionKey } from '@/features/desktop-fab/desktopFabExclusions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageCore } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useDesktopFabVisibility');

export function useDesktopFabVisibility() {
  const isReady = ref(false);
  const isTemporarilyDismissed = ref(false);
  const isPersistentlyExcluded = ref(false);
  const currentUrl = ref(window.location.href);
  let readVersion = 0;
  let mounted = false;

  const isDismissed = computed(() =>
    !isReady.value || isTemporarilyDismissed.value || isPersistentlyExcluded.value
  );

  const readExclusions = async () => {
    const url = currentUrl.value;
    const version = ++readVersion;
    const keys = [
      getDesktopFabExclusionKey('page', url),
      getDesktopFabExclusionKey('site', url),
    ].filter(Boolean);

    isReady.value = false;
    try {
      const values = keys.length ? await storageCore.getFresh(keys) : {};
      if (!mounted || version !== readVersion || url !== currentUrl.value) return;
      isPersistentlyExcluded.value = keys.some(key => Boolean(values[key]));
      isReady.value = true;
    } catch (error) {
      if (!mounted || version !== readVersion || url !== currentUrl.value) return;
      isPersistentlyExcluded.value = true;
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
    isTemporarilyDismissed.value = false;
    void readExclusions();
  };

  const dismiss = (detail) => {
    if (detail?.scope === 'temporary') {
      isTemporarilyDismissed.value = true;
    } else if (detail?.scope === 'page' || detail?.scope === 'site') {
      void readExclusions();
    }
  };

  onMounted(() => {
    mounted = true;
    currentUrl.value = window.location.href;
    storageCore.on('change', handleStorageChanged);
    pageEventBus.on('FEATURE_STATUS_CHANGED', handleFeatureStatusChanged);
    void readExclusions();
  });

  onUnmounted(() => {
    mounted = false;
    readVersion++;
    storageCore.off('change', handleStorageChanged);
    pageEventBus.off('FEATURE_STATUS_CHANGED', handleFeatureStatusChanged);
  });

  return { isReady, isDismissed, dismiss };
}
