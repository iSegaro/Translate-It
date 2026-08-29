import { describe, expect, it } from 'vitest';
import { resolveTranslationFontFamily } from './TranslationFontResolver.js';

describe('resolveTranslationFontFamily', () => {
  it('uses the Vazirmatn stack for auto Persian', () => {
    expect(resolveTranslationFontFamily('auto', 'fa'))
      .toBe('"Vazirmatn", "Vazir", Tahoma, Arial, sans-serif');
  });

  it('uses the Noto Sans stack for auto Arabic and other RTL languages', () => {
    const expected = '"Noto Sans", "Noto Sans Arabic", "Noto Sans CJK", Arial, sans-serif';

    expect(resolveTranslationFontFamily('auto', 'ar')).toBe(expected);
    expect(resolveTranslationFontFamily('auto', 'he')).toBe(expected);
  });

  it('uses the system stack for auto Latin', () => {
    expect(resolveTranslationFontFamily('auto', 'en'))
      .toBe('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto');
  });

  it('resolves explicit supported fonts', () => {
    expect(resolveTranslationFontFamily('vazirmatn', 'en'))
      .toBe('"Vazirmatn", "Vazir", Tahoma, Arial, sans-serif');
    expect(resolveTranslationFontFamily('arial', 'en')).toBe('Arial, Helvetica, sans-serif');
  });
});
