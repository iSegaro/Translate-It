import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  copyLiveCaptionAudioWorkletAssets,
  PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH
} from './live-caption-audio-worklet-assets.js';

describe('live-caption audio worklet asset packaging', () => {
  const tempDirs = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      await fs.remove(dir);
    }
  });

  it('copies the PCM worklet processor into the packaged dist path', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-it-worklet-'));
    tempDirs.push(outDir);

    const copiedFile = await copyLiveCaptionAudioWorkletAssets(outDir, process.cwd(), fs);
    const expectedPath = path.resolve(outDir, PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);

    expect(copiedFile).toBe(expectedPath);
    expect(await fs.pathExists(expectedPath)).toBe(true);

    const stats = await fs.stat(expectedPath);
    expect(stats.isFile()).toBe(true);
  });

  it('resolves the source asset from the project root rather than a nested src directory', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-it-worklet-root-'));
    tempDirs.push(outDir);

    const copiedFile = await copyLiveCaptionAudioWorkletAssets(outDir, process.cwd(), fs);

    expect(copiedFile).toBe(path.resolve(outDir, PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH));
    expect(await fs.pathExists(path.resolve(outDir, PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH))).toBe(true);
  });

  it('fails clearly when the PCM worklet asset is missing', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-it-worklet-missing-'));
    tempDirs.push(outDir);

    await expect(
      copyLiveCaptionAudioWorkletAssets(outDir, path.join(process.cwd(), 'missing-project-root'), fs)
    ).rejects.toThrow(/Live-caption PCM worklet asset not found/);
  });
});
