import { describe, expect, it } from 'vitest';
import { generateManifest } from '../../config/manifest-generator.js';

describe('live dubbing manifest capability', () => {
  it('adds Chrome capture permissions only and keeps Chrome minimum at 116', () => {
    const chromeManifest = generateManifest('chrome');
    const firefoxManifest = generateManifest('firefox');

    expect(chromeManifest.minimum_chrome_version).toBe('116');
    expect(chromeManifest.permissions).toContain('tabCapture');
    expect(chromeManifest.permissions).toContain('activeTab');
    expect(firefoxManifest.permissions).not.toContain('tabCapture');
    expect(firefoxManifest.permissions).not.toContain('activeTab');
  });

  it('does not expose the Chrome offscreen document through web accessible resources', () => {
    const chromeManifest = generateManifest('chrome');
    const resources = chromeManifest.web_accessible_resources.flatMap(({ resources }) => resources);

    expect(resources).not.toContain('src/html/offscreen.html');
    expect(resources).not.toContain('src/html/offscreen.js');
  });
});
