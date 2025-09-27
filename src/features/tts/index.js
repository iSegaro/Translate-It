/**
 * TTS Feature Entry Point - Lazy Loading Support
 * This file provides a central entry point for TTS functionality with lazy loading
 */

// Export lazy loading composable
export { useTTSLazy } from './composables/useTTSLazy.js';
export { TTSFactory } from './TTSFactory.js';

// Lazy loading functions for dynamic imports
export const loadTTSCore = async () => {
  const [globalManager, smart] = await Promise.all([
    import('./core/TTSGlobalManager.js'),
    import('./composables/useTTSSmart.js')
  ]);

  return {
    useTTSGlobal: globalManager.useTTSGlobal,
    TTSGlobalManager: globalManager.TTSGlobalManager,
    useTTSSmart: smart.useTTSSmart
  };
};

export const loadTTSHandlers = () => {
  return Promise.all([
    import('./handlers/handleGoogleTTS.js'),
    import('./handlers/handleOffscreenReady.js')
  ]);
};

export const loadTTSConstants = () => {
  return import('./constants/ttsErrorTypes.js');
};

// Backward compatibility - these will be lazy loaded when accessed
export const useTTSGlobal = async (componentInfo = {}) => {
  const { useTTSGlobal: factory } = await loadTTSCore();
  return factory(componentInfo);
};

export const useTTSSmart = async () => {
  const { useTTSSmart: factory } = await loadTTSCore();
  return factory();
};

// Default export for main TTS functionality
export const TTS = {
  loadHandlers: loadTTSHandlers,
  loadCore: loadTTSCore,
  loadConstants: loadTTSConstants,
  useTTSGlobal,
  useTTSSmart
};

export default TTS;