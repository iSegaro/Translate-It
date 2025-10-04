import { ref, reactive } from 'vue';
import { ExclusionChecker } from '../core/ExclusionChecker.js';
// import { getScopedLogger } from '@/shared/logging/logger.js';
// import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// const logger = getScopedLogger(LOG_COMPONENTS.EXCLUSION, 'useExclusionChecker');

let checkerInstance = null;
const isInitialized = ref(false);
const featureStatus = reactive({});

export function useExclusionChecker() {
  
  const initializeChecker = async () => {
    if (!checkerInstance) {
      checkerInstance = ExclusionChecker.getInstance();
    }
    
    if (!isInitialized.value) {
      await checkerInstance.initialize();
      isInitialized.value = true;
      updateFeatureStatus();
    }
    
    return checkerInstance;
  };

  const checkFeature = async (featureName) => {
    const checker = await initializeChecker();
    return await checker.isFeatureAllowed(featureName);
  };

  const updateUrl = async (newUrl) => {
    if (checkerInstance) {
      checkerInstance.updateUrl(newUrl);
      updateFeatureStatus();
    }
  };

  const refreshSettings = async () => {
    if (checkerInstance) {
      await checkerInstance.refreshSettings();
      updateFeatureStatus();
    }
  };

  const updateFeatureStatus = () => {
    if (checkerInstance && isInitialized.value) {
      const status = checkerInstance.getFeatureStatus();
      Object.assign(featureStatus, status);
    }
  };

  const getChecker = () => {
    return checkerInstance;
  };

  // Static helper for quick checks
  const shouldConsiderFeature = async (featureName, url = window.location.href) => {
    return await ExclusionChecker.shouldConsiderFeature(featureName, url);
  };

  return {
    isInitialized,
    featureStatus,
    initializeChecker,
    checkFeature,
    updateUrl,
    refreshSettings,
    getChecker,
    shouldConsiderFeature
  };
}