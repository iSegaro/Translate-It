import { describe, expect, it, vi } from 'vitest';
import { runBestEffortRollback } from './DomRollback.js';

describe('runBestEffortRollback', () => {
  it('runs all restorations successfully', () => {
    const calls = [];

    const result = runBestEffortRollback({
      restorations: [
        { restore: () => calls.push('first') },
        { restore: () => calls.push('second') },
      ],
    });

    expect(calls).toEqual(['first', 'second']);
    expect(result.rollbackFailures).toEqual([]);
  });

  it('continues after the first restoration throws', () => {
    const second = vi.fn();

    const result = runBestEffortRollback({
      restorations: [
        { kind: 'first', restore: () => { throw new Error('first failed'); } },
        { restore: second },
      ],
    });

    expect(second).toHaveBeenCalledOnce();
    expect(result.rollbackFailures).toEqual([
      { kind: 'first', error: expect.objectContaining({ message: 'first failed' }) },
    ]);
  });

  it('collects multiple restoration failures', () => {
    const first = new Error('first failed');
    const second = new Error('second failed');

    const result = runBestEffortRollback({
      restorations: [
        { restore: () => { throw first; } },
        { restore: () => { throw second; } },
      ],
    });

    expect(result.rollbackFailures).toEqual([
      { kind: 'rollback', error: first },
      { kind: 'rollback', error: second },
    ]);
  });

  it('preserves original error objects', () => {
    const restorationError = new Error('restore failed');
    const primaryError = new Error('mutation failed');

    const result = runBestEffortRollback({
      primaryError,
      restorations: [{ restore: () => { throw restorationError; } }],
    });

    expect(result.primaryError).toBe(primaryError);
    expect(result.rollbackFailures[0].error).toBe(restorationError);
  });

  it('does not replace primary error with rollback failure', () => {
    const primaryError = new Error('primary');

    const result = runBestEffortRollback({
      primaryError,
      restorations: [{ restore: () => { throw new Error('secondary'); } }],
    });

    expect(result.primaryError).toBe(primaryError);
  });

  it('preserves deterministic restoration order', () => {
    const calls = [];

    runBestEffortRollback({
      restorations: [
        { restore: () => calls.push(1) },
        { restore: () => calls.push(2) },
        { restore: () => calls.push(3) },
      ],
    });

    expect(calls).toEqual([1, 2, 3]);
  });

  it('handles an empty restoration list', () => {
    const primaryError = new Error('primary');

    expect(runBestEffortRollback({ primaryError })).toEqual({
      primaryError,
      rollbackFailures: [],
    });
  });

  it('runs synchronously without scheduling asynchronous work', () => {
    const calls = [];

    runBestEffortRollback({
      restorations: [{ restore: () => calls.push('restored') }],
    });

    expect(calls).toEqual(['restored']);
  });
});
