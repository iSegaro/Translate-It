import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FEATURE_CONFIG } from '@/core/managers/content/FeatureConfig.js';
import { MainFeatureLoader } from '@/core/content-scripts/main/MainFeatureLoader.js';
import {
  LIVE_DUBBING_FEATURE_NAME,
  LiveDubbingFeatureHandler,
} from './LiveDubbingFeatureHandler.js';

describe('LiveDubbingFeatureHandler lifecycle', () => {
  it('exposes the shared feature name', () => {
    expect(LIVE_DUBBING_FEATURE_NAME).toBe('liveDubbing');
  });

  it('is injectable and starts inactive', () => {
    const manager = { name: 'fake-manager' };
    const handler = new LiveDubbingFeatureHandler({ featureManager: manager });
    expect(handler.featureManager).toBe(manager);
    expect(handler.isActive()).toBe(false);
    expect(new LiveDubbingFeatureHandler().featureManager).toBeNull();
  });

  it('activates and deactivates idempotently with lifecycle-only state', async () => {
    const handler = new LiveDubbingFeatureHandler({});
    expect(await handler.activate()).toBe(true);
    expect(handler.isActive()).toBe(true);
    expect(await handler.activate()).toBe(true);
    expect(await handler.deactivate()).toBe(true);
    expect(handler.isActive()).toBe(false);
    expect(await handler.deactivate()).toBe(true);
  });
});

describe('liveDubbing feature registration conventions', () => {
  it('registers host-addressable policy without a user setting', () => {
    const config = FEATURE_CONFIG.liveDubbing;
    expect(config).toBeDefined();
    expect(config.alwaysEnabled).toBeUndefined();
    expect(config.settingKey).toBeUndefined();
    expect(config.settings ?? []).toEqual([]);
    expect(config.isEnabled()).toBe(true);
  });

  it('stays out of every MainFeatureLoader startup category', () => {
    const loader = new MainFeatureLoader(null, async () => ({}));
    const categorized = Object.values(loader.FEATURE_CATEGORIES).flat();
    expect(categorized).not.toContain(LIVE_DUBBING_FEATURE_NAME);
  });

  it('keeps the handler free of Firefox, site, capture, provider, media, DOM, and page APIs', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js'),
      'utf8',
    );
    const forbiddenTokens = [
      'firefox',
      'youtube',
      'captureStream',
      'getUserMedia',
      'MediaStream',
      'AudioContext',
      'provider',
      'Provider',
      'transcript',
      'sdp',
      'payload',
      'document.',
      'window.',
      'window.top',
      'querySelector',
      'chrome.',
      'browser.',
      'tabs.',
    ];
    for (const token of forbiddenTokens) {
      expect(source).not.toContain(token);
    }
  });
});
