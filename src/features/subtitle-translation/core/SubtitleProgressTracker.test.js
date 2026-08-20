import { describe, expect, it } from 'vitest';
import { SubtitleProgressTracker } from './SubtitleProgressTracker.js';

describe('SubtitleProgressTracker', () => {
  it('preserves terminal structured details without a legacy error field', () => {
    const tracker = new SubtitleProgressTracker(2);
    const errorDetails = { message: 'raw provider diagnostic', type: 'MODEL_NOT_FOUND' };

    tracker.setTerminalError(errorDetails);

    expect(tracker.getProgress()).toMatchObject({
      terminalErrorDetails: errorDetails
    });
    expect(tracker.getProgress()).not.toHaveProperty('terminalError');
  });

  it('preserves partial progress counts while finalizing', () => {
    const tracker = new SubtitleProgressTracker(2);
    tracker.update([{ status: 'translated' }]);
    tracker.finalize();

    expect(tracker.getProgress()).toMatchObject({ translated: 1, skipped: 1, failed: 0, percent: 100 });
  });
});
