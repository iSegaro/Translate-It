export const PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH = 'src/features/live-caption/stt/worklets/pcm16MonoStreamingProcessor.js';

function resolveRuntimeGetUrl(runtime = globalThis) {
  return runtime?.chrome?.runtime?.getURL
    ?? runtime?.browser?.runtime?.getURL
    ?? null;
}

export function resolvePcm16MonoStreamingProcessorModuleUrl(runtime = globalThis) {
  const getURL = resolveRuntimeGetUrl(runtime);

  if (typeof getURL === 'function') {
    return getURL(PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
  }

  return PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH;
}

export default PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH;
