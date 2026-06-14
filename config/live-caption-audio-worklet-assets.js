import fs from 'fs-extra';
import { resolve } from 'path';
import { PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH } from '../src/features/live-caption/stt/worklets/pcm16MonoStreamingProcessorAsset.js';

export async function copyLiveCaptionAudioWorkletAssets(outDir, projectRoot = process.cwd(), fsModule = fs) {
  const sourceFile = resolve(projectRoot, PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
  const destinationFile = resolve(outDir, PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);

  if (!await fsModule.pathExists(sourceFile)) {
    throw new Error(`Live-caption PCM worklet asset not found at ${sourceFile}`);
  }

  await fsModule.ensureDir(resolve(outDir, 'src/features/live-caption/stt/worklets'));
  await fsModule.copy(sourceFile, destinationFile);

  return destinationFile;
}

export { PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH };
