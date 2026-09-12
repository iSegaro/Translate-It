import { describe, expect, it } from 'vitest';
import { LOG_CATEGORIES, LOG_COMPONENTS } from './logConstants.js';

describe('logConstants live dubbing scope', () => {
  it('exposes a dedicated LiveDubbing component value', () => {
    expect(LOG_COMPONENTS.LIVE_DUBBING).toBe('LiveDubbing');
  });

  it('files LiveDubbing under the Features category only', () => {
    expect(LOG_CATEGORIES.FEATURES.components).toContain(LOG_COMPONENTS.LIVE_DUBBING);
    for (const [name, category] of Object.entries(LOG_CATEGORIES)) {
      if (name === 'FEATURES') continue;
      expect(category.components).not.toContain(LOG_COMPONENTS.LIVE_DUBBING);
    }
  });
});
