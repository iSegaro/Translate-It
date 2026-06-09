import { describe, it, expect } from 'vitest';
import { generateManifest } from '../../../config/manifest-generator.js';

describe('manifest-generator live caption scaffolding', () => {
  it('adds live-caption permissions for chrome and keeps firefox unchanged', () => {
    const chromeManifest = generateManifest('chrome');
    expect(chromeManifest.permissions).toContain('activeTab');
    expect(chromeManifest.permissions).toContain('tabCapture');
    expect(chromeManifest.permissions).toContain('offscreen');

    const firefoxManifest = generateManifest('firefox');
    expect(firefoxManifest.permissions).not.toContain('activeTab');
    expect(firefoxManifest.permissions).not.toContain('tabCapture');
    expect(firefoxManifest.permissions).not.toContain('offscreen');
  });

  it('keeps the offscreen document web accessible on chrome', () => {
    const chromeManifest = generateManifest('chrome');
    const offscreenResources = chromeManifest.web_accessible_resources
      .flatMap((entry) => entry.resources);

    expect(offscreenResources).toContain('src/html/offscreen.html');
    expect(offscreenResources).toContain('src/html/offscreen.js');
  });
});
