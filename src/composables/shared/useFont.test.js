import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: useSettingsStoreMock,
}));

import { useFont } from './useFont.js';

describe('useFont', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStoreMock.mockReturnValue({
      fontFamily: 'auto',
      fontSize: '14',
    });
  });

  it('keeps fallback font behavior when smart detection is disabled for auto', () => {
    const { fontFamilyCSS } = useFont('fa', { enableSmartDetection: false });

    expect(fontFamilyCSS.value)
      .toBe('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto');

    const fallback = useFont('fa', { enableSmartDetection: false, fallbackFont: 'arial' });
    expect(fallback.fontFamilyCSS.value).toBe('Arial, Helvetica, sans-serif');
  });
});
