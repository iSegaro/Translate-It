import { describe, it, expect } from 'vitest';
import { LOG_CATEGORIES, LOG_COMPONENTS } from './logConstants.js';
import { getComponentLogLevel } from './GlobalDebugState.js';

describe('logConstants live caption registration', () => {
  it('registers the LiveCaption component and feature category membership', () => {
    expect(LOG_COMPONENTS.LIVE_CAPTION).toBe('LiveCaption');
    expect(LOG_CATEGORIES.FEATURES.components).toContain(LOG_COMPONENTS.LIVE_CAPTION);
  });

  it('initializes a default log level for LiveCaption', () => {
    expect(getComponentLogLevel(LOG_COMPONENTS.LIVE_CAPTION)).toBe(1);
  });
});
