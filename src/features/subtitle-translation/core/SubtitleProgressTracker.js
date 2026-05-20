/**
 * Subtitle Progress Tracker - Maintains granular state of the translation job.
 */
export class SubtitleProgressTracker {
  constructor(totalCues) {
    this.totalCues = totalCues;
    this.translatedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
    this.startTime = Date.now();
    this.terminalError = null;
  }

  /**
   * Sets a terminal error message that caused the job to stop prematurely.
   */
  setTerminalError(error) {
    this.terminalError = error;
  }

  update(results) {
    results.forEach(cue => {
      if (cue.status === 'translated') this.translatedCount++;
      else if (cue.status === 'failed') this.failedCount++;
      else if (cue.status === 'skipped') this.skippedCount++;
    });
  }

  getProgress() {
    const processed = this.translatedCount + this.failedCount + this.skippedCount;
    const percent = this.totalCues > 0 ? (processed / this.totalCues) * 100 : 0;
    
    // Estimate Time Remaining
    const elapsed = Date.now() - this.startTime;
    const msPerCue = processed > 0 ? elapsed / processed : 0;
    const remainingCues = this.totalCues - processed;
    const etaMs = remainingCues * msPerCue;

    return {
      total: this.totalCues,
      processed,
      translated: this.translatedCount,
      failed: this.failedCount,
      skipped: this.skippedCount,
      percent: Math.round(percent),
      etaMs: Math.round(etaMs),
      elapsedMs: elapsed,
      terminalError: this.terminalError
    };
  }

  /**
   * Finalizes the tracker, marking any remaining cues as skipped.
   * Useful for partial completions due to fatal errors or cancellation.
   */
  finalize() {
    const processed = this.translatedCount + this.failedCount + this.skippedCount;
    const remaining = this.totalCues - processed;
    if (remaining > 0) {
      this.skippedCount += remaining;
    }
  }
}
