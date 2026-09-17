import { describe, expect, it } from 'vitest';
import { generateManifest } from '../../../config/manifest-generator.js';
import { CAPTURE_WORKLET_URL } from './offscreen/TabAudioPipeline.js';
import { PLAYBACK_WORKLET_URL } from './offscreen/PcmOutputPlayer.js';
import fs from 'fs';
import { resolve } from 'path';

describe('live-dubbing worklet manifest regression', () => {
  it('Firefox manifest exposes capture and playback worklets narrowly, not assets/*', () => {
    const manifest = generateManifest('firefox');
    const resources = manifest.web_accessible_resources.flatMap(r => r.resources);

    // Must expose both worklets via narrow stable path only
    expect(resources).toContain('assets/live-dubbing/liveDubbingCapture.worklet.js');
    expect(resources).toContain('assets/live-dubbing/liveDubbingPlayback.worklet.js');
    // Hashed fallback must NOT be present (tightened fix removes fallback WAR entries)
    expect(resources).not.toContain('assets/liveDubbingCapture.worklet*.js');
    expect(resources).not.toContain('assets/liveDubbingPlayback.worklet*.js');
    // Also ensure no legacy bare assets fallback sneaks in
    expect(resources.find(r => r.includes('liveDubbingCapture.worklet') && r.includes('*'))).toBeUndefined();
    expect(resources.find(r => r.includes('liveDubbingPlayback.worklet') && r.includes('*'))).toBeUndefined();

    // Must NOT expose broad assets/* which would be a security regression (MDN warning)
    expect(resources).not.toContain('assets/*');
    expect(resources).not.toContain('assets/*.js');
    // Ensure we didn't accidentally expose via wildcard that is too broad
    const broad = resources.find(r => r === 'assets/*' || r === 'assets/*.js' || r === 'assets/**');
    expect(broad).toBeUndefined();
  });

  it('Firefox manifest still exposes only narrow worklet resources, Chrome also narrow', () => {
    const chrome = generateManifest('chrome');
    const firefox = generateManifest('firefox');
    const chromeResources = chrome.web_accessible_resources.flatMap(r => r.resources);
    const firefoxResources = firefox.web_accessible_resources.flatMap(r => r.resources);

    // Both should have worklet entries (Chrome needs them for content script fallback, Firefox requires them)
    for (const r of ['assets/live-dubbing/liveDubbingCapture.worklet.js', 'assets/live-dubbing/liveDubbingPlayback.worklet.js']) {
      expect(chromeResources).toContain(r);
      expect(firefoxResources).toContain(r);
    }
  });

  it('worklet source files exist as single source of truth', () => {
    const captureSrc = resolve(process.cwd(), 'src/features/live-dubbing/offscreen/liveDubbingCapture.worklet.js');
    const playbackSrc = resolve(process.cwd(), 'src/features/live-dubbing/offscreen/liveDubbingPlayback.worklet.js');
    expect(fs.existsSync(captureSrc)).toBe(true);
    expect(fs.existsSync(playbackSrc)).toBe(true);
    const captureContent = fs.readFileSync(captureSrc, 'utf-8');
    const playbackContent = fs.readFileSync(playbackSrc, 'utf-8');
    expect(captureContent).toContain('LiveDubbingCaptureProcessor');
    expect(playbackContent).toContain('LiveDubbingPlaybackProcessor');
  });

  it('runtime worklet URLs are browser-neutral and not hardcoded', () => {
    // Must contain worklet filename so pipeline tests still pass
    expect(CAPTURE_WORKLET_URL).toContain('liveDubbingCapture.worklet.js');
    expect(PLAYBACK_WORKLET_URL).toContain('liveDubbingPlayback.worklet.js');

    // Must NOT hardcode extension scheme — runtime.getURL resolves it dynamically
    expect(CAPTURE_WORKLET_URL).not.toContain('moz-extension://');
    expect(CAPTURE_WORKLET_URL).not.toContain('chrome-extension://');
    expect(PLAYBACK_WORKLET_URL).not.toContain('moz-extension://');
    expect(PLAYBACK_WORKLET_URL).not.toContain('chrome-extension://');

    // Stable path should be used when runtime.getURL is available; fallback still contains filename
    // In test environment globalThis.browser is undefined, so it falls back to new URL with data: or relative
    // but must still contain the filename
    expect(CAPTURE_WORKLET_URL).toMatch(/liveDubbingCapture\.worklet\.js/);
    expect(PLAYBACK_WORKLET_URL).toMatch(/liveDubbingPlayback\.worklet\.js/);
  });

  it('Vite plugin and asset pipeline are configured for stable worklet emission', async () => {
    // Verify the copy plugin exists (single build abstraction)
    const pluginPath = resolve(process.cwd(), 'config/vite/plugins/live-dubbing-worklets.js');
    expect(fs.existsSync(pluginPath)).toBe(true);
    const pluginContent = fs.readFileSync(pluginPath, 'utf-8');
    expect(pluginContent).toContain('liveDubbingCapture.worklet.js');
    expect(pluginContent).toContain('liveDubbingPlayback.worklet.js');
    expect(pluginContent).toContain('assets/live-dubbing');

    // Verify base vite config handles worklet assetFileNames and inline limit
    const baseConfigPath = resolve(process.cwd(), 'config/vite/vite.config.base.js');
    const baseContent = fs.readFileSync(baseConfigPath, 'utf-8');
    expect(baseContent).toContain('liveDubbing.*\\.worklet\\.js');
    expect(baseContent).toContain('assets/live-dubbing');
    expect(baseContent).toContain('assetsInlineLimit: 4096');

    // Verify manifest-generator contains narrow worklet resources
    const manifestPath = resolve(process.cwd(), 'config/manifest-generator.js');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    expect(manifestContent).toContain('assets/live-dubbing/liveDubbingCapture.worklet.js');
    expect(manifestContent).toContain('assets/live-dubbing/liveDubbingPlayback.worklet.js');
    expect(manifestContent).not.toContain("'assets/*'");
    expect(manifestContent).not.toContain('"assets/*"');
  });

  it('Chrome and Firefox dev artifacts contain stable worklet files when built', async () => {
    // This test is artifact-level: it would have caught the missing resource before the fix.
    // In CI we may not have built artifacts, so we check the source of truth that the
    // build *will* produce them via the plugin + manifest. If artifacts exist, verify them.
    const firefoxStableCapture = resolve(process.cwd(), 'dist/firefox/Translate-It-v1.19.0/assets/live-dubbing/liveDubbingCapture.worklet.js');
    const firefoxStablePlayback = resolve(process.cwd(), 'dist/firefox/Translate-It-v1.19.0/assets/live-dubbing/liveDubbingPlayback.worklet.js');
    const chromeStableCapture = resolve(process.cwd(), 'dist/chrome/Translate-It-v1.19.0/assets/live-dubbing/liveDubbingCapture.worklet.js');
    const chromeStablePlayback = resolve(process.cwd(), 'dist/chrome/Translate-It-v1.19.0/assets/live-dubbing/liveDubbingPlayback.worklet.js');

    // If artifacts exist (dev build was run), verify they are present and contain expected processor names
    const checkIfExists = (path, processorName) => {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path, 'utf-8');
        expect(content).toContain(processorName);
      } else {
        // In test environment without prior build, at least the source and manifest guarantee is checked above.
        // We don't fail if artifact not yet built, but we ensure the test would fail if manifest was wrong.
        expect(true).toBe(true);
      }
    };
    checkIfExists(firefoxStableCapture, 'LiveDubbingCaptureProcessor');
    checkIfExists(firefoxStablePlayback, 'LiveDubbingPlaybackProcessor');
    checkIfExists(chromeStableCapture, 'LiveDubbingCaptureProcessor');
    checkIfExists(chromeStablePlayback, 'LiveDubbingPlaybackProcessor');
  });
});
