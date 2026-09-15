import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateManifest } from '../../../../../config/manifest-generator.js';

describe('Firefox Phase 2 DEV spike registrations', () => {
  it('keeps content registration DEV-gated and Firefox-only', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/content-scripts/index-main.js'), 'utf8');
    const importIndex = source.indexOf('spikes/firefox/spikeDevContent.js');
    expect(importIndex).toBeGreaterThan(0);
    const guard = source.slice(Math.max(0, importIndex - 500), importIndex);
    expect(guard).toContain('__IS_DEVELOPMENT__');
    expect(guard).toContain('__BROWSER__');
    expect(guard).toContain("'firefox'");
  });

  it('keeps the background receiver DEV-gated and Firefox-only', async () => {
    const source = await readFile(join(process.cwd(), 'src/core/background/index.js'), 'utf8');
    const importIndex = source.indexOf('spikes/firefox/spikeDevBackground.js');
    expect(importIndex).toBeGreaterThan(0);
    const guard = source.slice(Math.max(0, importIndex - 500), importIndex);
    expect(guard).toContain('__IS_DEVELOPMENT__');
    expect(guard).toContain('__BROWSER__');
    expect(guard).toContain("'firefox'");
  });

  it('adds the iframe resource only to the explicit Firefox DEV manifest', async () => {
    const devManifest = generateManifest('firefox', { includeFirefoxDevSpikeIframe: true });
    const productionManifest = generateManifest('firefox', { includeFirefoxDevSpikeIframe: false });
    const devResources = devManifest.web_accessible_resources.flatMap(entry => entry.resources || []);
    const productionResources = productionManifest.web_accessible_resources.flatMap(entry => entry.resources || []);

    expect(devResources).toContain('spikeDevIframe.html');
    expect(productionResources).not.toContain('spikeDevIframe.html');
  });

  it('registers the extension iframe as a Firefox DEV-only build input', async () => {
    const source = await readFile(join(process.cwd(), 'config/vite/vite.config.firefox.js'), 'utf8');
    expect(source).toContain('src/features/live-dubbing/spikes/firefox/spikeDevIframe.html');
    expect(source).toContain('includeFirefoxDevSpikeIframe');
    expect(source).toContain("process.env.NODE_ENV !== 'production'");
  });
});
