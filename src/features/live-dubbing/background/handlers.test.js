import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleLiveDubbingGetStatus,
  handleLiveDubbingStart,
  handleLiveDubbingStop,
} from './handlers.js';

describe('live dubbing browser gate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns unsupported without routing Firefox background requests', () => {
    vi.stubGlobal('__BROWSER__', 'firefox');

    expect(handleLiveDubbingStart()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
    expect(handleLiveDubbingStop()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
    expect(handleLiveDubbingGetStatus()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
  });
});
