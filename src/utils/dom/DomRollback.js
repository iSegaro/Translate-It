/**
 * Runs explicit DOM restoration operations without allowing one failure to
 * prevent later restoration work.
 *
 * @param {Object} options
 * @param {Error|Object|null} [options.primaryError=null] - Original mutation failure.
 * @param {Array<Object>} [options.restorations=[]] - Ordered restoration operations.
 * @returns {{primaryError: (Error|Object|null), rollbackFailures: Object[]}}
 */
export function runBestEffortRollback({ primaryError = null, restorations = [] } = {}) {
  const rollbackFailures = [];

  for (const restoration of restorations) {
    try {
      const failures = restoration.restore();
      if (Array.isArray(failures)) rollbackFailures.push(...failures);
    } catch (error) {
      rollbackFailures.push(
        restoration.createFailure
          ? restoration.createFailure(error)
          : { kind: restoration.kind || 'rollback', error },
      );
    }
  }

  return { primaryError, rollbackFailures };
}
