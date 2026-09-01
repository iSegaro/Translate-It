import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: useSettingsStoreMock,
}));

import { useFont } from './useFont.js';

describe('useFont', () => {
  const apps = [];

  function withSetup(composable) {
    let result;
    const app = createApp({
      setup() {
        result = composable();
        return () => null;
      },
    });
    app.mount(document.createElement('div'));
    apps.push(app);
    return result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStoreMock.mockReturnValue({
      fontFamily: 'auto',
      fontSize: '14',
    });
  });

  afterEach(() => {
    apps.splice(0).forEach(app => app.unmount());
  });

  it('keeps fallback font behavior when smart detection is disabled for auto', () => {
    const { fontFamilyCSS } = withSetup(() => useFont('fa', { enableSmartDetection: false }));

    expect(fontFamilyCSS.value)
      .toBe('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto');

    const fallback = withSetup(() => useFont('fa', { enableSmartDetection: false, fallbackFont: 'arial' }));
    expect(fallback.fontFamilyCSS.value).toBe('Arial, Helvetica, sans-serif');
  });
});
