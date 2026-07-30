import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      update: vi.fn(),
    },
    windows: {
      update: vi.fn(),
    },
  },
}));

import { handleLaunchExtensionApp } from './handleLaunchExtensionApp.js';

describe('handleLaunchExtensionApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.tabs.query.mockResolvedValue([]);
  });
  it('creates a tab with pdf.html URL', async () => {
    const result = await handleLaunchExtensionApp({
      data: {
        urlPath: 'src/html/pdf.html',
        launchPolicy: 'always-create',
      },
    });

    expect(result.success).toBe(true);
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/src/html/pdf.html',
    });
  });

  it('appends ?remote= to tab URL when remoteUrl is present', async () => {
    const result = await handleLaunchExtensionApp({
      data: {
        urlPath: 'src/html/pdf.html',
        launchPolicy: 'always-create',
        remoteUrl: 'https://example.com/document.pdf',
      },
    });

    expect(result.success).toBe(true);
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/src/html/pdf.html?remote=https%3A%2F%2Fexample.com%2Fdocument.pdf',
    });
  });

  it('encodes special characters in remote URL', async () => {
    await handleLaunchExtensionApp({
      data: {
        urlPath: 'src/html/pdf.html',
        launchPolicy: 'always-create',
        remoteUrl: 'https://example.com/doc.pdf?id=1&name=test',
      },
    });

    expect(browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('id%3D1%26name%3Dtest'),
      }),
    );
  });

  it('does not append ?remote when not present', async () => {
    await handleLaunchExtensionApp({
      data: {
        urlPath: 'src/html/pdf.html',
        launchPolicy: 'always-create',
      },
    });

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/src/html/pdf.html',
    });
  });

  it('creates tab for focus-or-create when no matching tabs', async () => {
    await handleLaunchExtensionApp({
      data: {
        urlPath: 'src/html/subtitle.html',
        launchPolicy: 'focus-or-create',
      },
    });

    expect(browser.tabs.create).toHaveBeenCalled();
  });
});
