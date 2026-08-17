import { createTranslationDiagnosticReport } from './TranslationOutcome.js'
import { createUsageRecord, normalizeCompletionTermination } from './CompletionContract.js'

const MAX_DIAGNOSTIC_ENTRIES = 100
const MAX_COMPLETION_ENTRIES = 100
const MAX_STRING_LENGTH = 256
const MAX_DIAGNOSTIC_ARRAY_ITEMS = 32
const MAX_DIAGNOSTIC_ID_LENGTH = 64
const SettlementState = Object.freeze({
  UNSETTLED: Symbol('UNSETTLED'),
  SETTLED: Symbol('SETTLED'),
  CANCELLED: Symbol('CANCELLED'),
})
const EMPTY_CANCELLED_UNIT_IDS = Object.freeze([])

export const ParentCandidateState = Object.freeze({
  PROVISIONAL: 'PROVISIONAL',
  STAGED: 'STAGED',
  RESULT_STAGED: 'RESULT_STAGED',
  DISCARDED: 'DISCARDED',
})

/**
 * Provisional semantic contribution owned by one TranslationOperation.
 * Provider batches may locate it by parentId, but never own its lifecycle.
 */
function createParentCandidate(metadata) {
  let source = null
  let result = null
  let state = ParentCandidateState.PROVISIONAL

  const candidate = {
    parentId: metadata.parentId,
    sourceOrder: metadata.sourceOrder,
    sessionId: metadata.sessionId,
    provider: metadata.provider,
    mode: metadata.mode,
    conversationParticipates: true,
    get state() { return state },
    stageSource(value) {
      if (state === ParentCandidateState.DISCARDED) return false
      if (source !== null) return false
      if (typeof value !== 'string') return false
      source = value
      if (result === null) state = ParentCandidateState.STAGED
      return true
    },
    stageResult(value) {
      if (state === ParentCandidateState.DISCARDED) return false
      if (result !== null) return false
      if (typeof value !== 'string') return false
      result = value
      state = ParentCandidateState.RESULT_STAGED
      return true
    },
    discard() {
      if (state === ParentCandidateState.DISCARDED) return false
      state = ParentCandidateState.DISCARDED
      return true
    },
    snapshot() {
      return Object.freeze({
        parentId: candidate.parentId,
        sourceOrder: candidate.sourceOrder,
        sessionId: candidate.sessionId,
        provider: candidate.provider,
        mode: candidate.mode,
        conversationParticipates: candidate.conversationParticipates,
        cleanSource: source,
        cleanResult: result,
        state,
      })
    },
  }

  return candidate
}

export const RecoveryFinalOutcome = Object.freeze({
  NONE: 'NONE',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  INCOMPLETE: 'INCOMPLETE',
  SUPERSEDED: 'SUPERSEDED',
})

export function deriveRecoverySummary(report, terminalContext = {}) {
  const passes = []
  const providers = new Map()
  for (const entry of Array.isArray(report?.entries) ? report.entries : []) {
    if (entry?.type === 'RECOVERY_TRIGGERED') {
      const pass = { provider: entry.provider, terminal: null }
      passes.push(pass)
      const fact = providers.get(pass.provider) || { provider: pass.provider, structuredResponseViolations: 0, recoveryPasses: 0, recoverySuccesses: 0, recoveryFailures: 0, incompleteRecoveries: 0 }
      fact.structuredResponseViolations++
      fact.recoveryPasses++
      providers.set(pass.provider, fact)
    } else if ((entry?.type === 'RECOVERY_SUCCEEDED' || entry?.type === 'RECOVERY_FAILED')) {
      const pass = [...passes].reverse().find(item => item.terminal === null)
      if (pass) {
        pass.terminal = entry.type
        pass.terminalProvider = entry.provider || null
        const provider = entry.provider || pass.provider
        const fact = providers.get(provider) || { provider, structuredResponseViolations: 0, recoveryPasses: 0, recoverySuccesses: 0, recoveryFailures: 0, incompleteRecoveries: 0 }
        if (entry.type === 'RECOVERY_SUCCEEDED') fact.recoverySuccesses++
        else fact.recoveryFailures++
        providers.set(provider, fact)
      }
    }
  }
  for (const pass of passes.filter(item => item.terminal === null)) {
    const providerFact = providers.get(pass.provider)
    if (providerFact) providerFact.incompleteRecoveries++
  }
  const last = passes.at(-1)
  const success = passes.some(item => item.terminal === 'RECOVERY_SUCCEEDED')
  const failure = passes.some(item => item.terminal === 'RECOVERY_FAILED')
  let finalRecoveryOutcome = RecoveryFinalOutcome.NONE
  if (last) {
    if (last.terminal === 'RECOVERY_SUCCEEDED' && terminalContext.operationSucceeded) finalRecoveryOutcome = RecoveryFinalOutcome.SUCCEEDED
    else if (last.terminal === 'RECOVERY_FAILED' && terminalContext.operationSucceeded) finalRecoveryOutcome = RecoveryFinalOutcome.SUPERSEDED
    else if (last.terminal === 'RECOVERY_FAILED' && terminalContext.terminalStatus === 'failed') finalRecoveryOutcome = RecoveryFinalOutcome.FAILED
    else finalRecoveryOutcome = RecoveryFinalOutcome.INCOMPLETE
  }
  const providerFacts = Object.freeze([...providers.values()].map(fact => Object.freeze(fact)))
  const finalRecoveryProvider = last ? (last.terminalProvider || last.provider || null) : null
  return Object.freeze({ structuredResponseViolations: passes.length, recoveryPasses: passes.length, hadRecovery: passes.length > 0, hadRecoverySuccess: success, hadRecoveryFailure: failure, recoveryIncomplete: passes.some(item => item.terminal === null), finalRecoveryOutcome, finalRecoveryProvider, providerFacts })
}

function safeString(value) {
  return typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : undefined
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : undefined
}

function safeDiagnosticArray(value) {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, MAX_DIAGNOSTIC_ARRAY_ITEMS).map((item) => {
    if (typeof item === 'number' && Number.isFinite(item)) return item
    if (typeof item === 'string') return item.slice(0, MAX_DIAGNOSTIC_ID_LENGTH)
    return null
  })
}

function sanitizeDiagnostic(messageId, fact = {}) {
  const diagnostic = {
    type: safeString(fact.type) || 'DIAGNOSTIC',
    stage: safeString(fact.stage) || 'unknown',
    messageId,
    timestamp: safeNumber(fact.timestamp) ?? Date.now(),
  }

  for (const key of [
    'batchIndex', 'attempt', 'count', 'expectedCount', 'receivedCount', 'missingCount',
    'requestCount', 'responseCount', 'invalidCount', 'unresolvedCount', 'duplicateCount',
    'invalidTextCount', 'requestIdsTotal', 'responseIdsTotal', 'unresolvedIdsTotal',
    'duplicateResponseIdsTotal', 'invalidTextIndexesTotal', 'expectedMarkerCount',
    'actualMarkerCount', 'recoveryStage', 'primaryFragmentLimit', 'recoveryFragmentLimit',
    'primaryFragmentCount', 'recoveryFragmentCount', 'unitCount', 'originalUnitCount', 'intervalIndex',
    'sourceLength', 'translatedLength', 'sourceIntervalCount', 'translatedIntervalCount',
    'sourceMarkerCount', 'translatedMarkerCount', 'sourceIntervalLength',
    'translatedIntervalLength', 'mappedLeadingIntervalLength', 'providerLeadingIntervalLength',
  ]) {
    const value = safeNumber(fact[key])
    if (value !== undefined) diagnostic[key] = value
  }
  for (const key of [
    'event', 'provider', 'reason', 'code', 'parentId', 'classification', 'callPurpose',
    'outerCallPurpose', 'expectedFormat', 'strategy', 'finalReason', 'originalReason',
    'firstMarkerId', 'markerId',
  ]) {
    const value = safeString(fact[key])
    if (value !== undefined) diagnostic[key] = value
  }

  for (const key of ['repaired', 'fallback', 'cancelled']) {
    if (typeof fact[key] === 'boolean') diagnostic[key] = fact[key]
  }

  for (const key of [
    'arraysTruncated', 'requestIdsTruncated', 'responseIdsTruncated',
    'unresolvedIdsTruncated', 'duplicateResponseIdsTruncated', 'invalidTextIndexesTruncated',
  ]) {
    if (typeof fact[key] === 'boolean') diagnostic[key] = fact[key]
  }

  for (const key of [
    'requestIds', 'responseIds', 'unresolvedIds', 'duplicateResponseIds',
    'invalidTextIndexes', 'invalidUnitIndexes', 'sourceMarkerIds', 'translatedMarkerIds',
  ]) {
    const value = safeDiagnosticArray(fact[key])
    if (value !== undefined) diagnostic[key] = value
  }

  if (fact.mappingFacts && typeof fact.mappingFacts === 'object') {
    diagnostic.mappingFacts = {
      identityReliable: fact.mappingFacts.identityReliable === true,
      complete: fact.mappingFacts.complete === true,
      ambiguous: fact.mappingFacts.ambiguous === true,
    }
  }

  return diagnostic
}

/**
 * Sanitizes a normalized completion record at the operation boundary. Only
 * whitelisted keys survive; unknown keys are stripped for privacy. Termination
 * must be a CompletionTermination value; anything else collapses to UNKNOWN so
 * raw provider termination strings never leak into the stored record.
 */
function sanitizeCompletion(record = {}) {
  const usage = record.usage
  return Object.freeze({
    provider: safeString(record.provider) ?? null,
    model: safeString(record.model) ?? null,
    termination: normalizeCompletionTermination(record.termination),
    responseId: safeString(record.responseId) ?? null,
    usage: usage && typeof usage === 'object'
      ? createUsageRecord({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
      })
      : null,
  })
}

/**
 * Creates the private runtime context for one messageId. It is never serialized
 * or sent through messaging; only its immutable terminal report leaves it.
 */
export function createTranslationOperation(messageId, manifest = null) {
  const diagnostics = []
  const completions = []
  const providerMetadata = []
  const parentCandidates = new Map()
  const manifestUnits = Array.isArray(manifest?.units) ? manifest.units : []
  let unitStates = null
  function getUnitStates() {
    if (unitStates) return unitStates

    unitStates = new Map()
    for (const unit of manifestUnits) {
      if (typeof unit?.unitId === 'string' && !unitStates.has(unit.unitId)) {
        unitStates.set(unit.unitId, SettlementState.UNSETTLED)
      }
    }
    return unitStates
  }
  let droppedDiagnostics = 0
  let report = null
  let cancelledUnitIds = null
  let pendingAcceptedUnitIds = null
  let pendingAcceptedUnitIdSet = null
  let finalized = false

  function getPendingAcceptedStorage() {
    if (pendingAcceptedUnitIds) return { list: pendingAcceptedUnitIds, set: pendingAcceptedUnitIdSet }

    pendingAcceptedUnitIds = []
    pendingAcceptedUnitIdSet = new Set()
    return { list: pendingAcceptedUnitIds, set: pendingAcceptedUnitIdSet }
  }

  return {
    messageId,
    appendDiagnostic(fact) {
      if (finalized) return false
      if (diagnostics.length >= MAX_DIAGNOSTIC_ENTRIES - 1) {
        droppedDiagnostics++
        return false
      }
      diagnostics.push(sanitizeDiagnostic(messageId, fact))
      return true
    },
    recordCompletion(record) {
      if (finalized) return false
      if (completions.length >= MAX_COMPLETION_ENTRIES) return false
      const stored = sanitizeCompletion(record)
      completions.push(stored)
      return stored
    },
    /** Creates one provisional candidate for one logical parent. */
    createParentCandidate(metadata = {}) {
      if (!metadata.conversationParticipates || metadata.parentId === undefined || metadata.parentId === null || parentCandidates.has(metadata.parentId)) return null
      const candidate = createParentCandidate(metadata)
      parentCandidates.set(metadata.parentId, candidate)
      if (metadata.cleanSource !== undefined) candidate.stageSource(metadata.cleanSource)
      return candidate
    },
    registerParentCandidates(metadataList = []) {
      if (!Array.isArray(metadataList)) return 0
      let created = 0
      for (const metadata of metadataList) {
        if (this.createParentCandidate(metadata)) created++
      }
      return created
    },
    /** Returns candidate associated with explicit logical parent identity. */
    getParentCandidate(parentId) {
      return parentCandidates.get(parentId) || null
    },
    snapshotParentCandidates() {
      return Object.freeze([...parentCandidates.values()].map(candidate => candidate.snapshot()))
    },
    discardParentCandidates() {
      for (const candidate of parentCandidates.values()) candidate.discard()
      parentCandidates.clear()
    },
    snapshotCompletions() {
      return Object.freeze([...completions])
    },
    recordProviderExecutionMetadata(metadata, callPurpose) {
      if (finalized || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
      const stored = Object.freeze({
        callPurpose: typeof callPurpose === 'string' ? callPurpose : null,
        metadata: Object.freeze({ ...metadata }),
      })
      providerMetadata.push(stored)
      return stored
    },
    snapshotProviderExecutionMetadata() {
      return Object.freeze([...providerMetadata])
    },
    settleUnits(unitIds) {
      const accepted = []
      const values = typeof unitIds === 'string'
        ? [unitIds]
        : (unitIds && typeof unitIds[Symbol.iterator] === 'function' ? unitIds : [])

      const states = getUnitStates()
      for (const unitId of values) {
        if (states.get(unitId) !== SettlementState.UNSETTLED) continue
        states.set(unitId, SettlementState.SETTLED)
        accepted.push(unitId)
      }
      return Object.freeze(accepted)
    },
    cancelRemaining() {
      if (cancelledUnitIds) return cancelledUnitIds

      const accepted = []
      const states = getUnitStates()
      for (const [unitId, state] of states) {
        if (state !== SettlementState.UNSETTLED) continue
        states.set(unitId, SettlementState.CANCELLED)
        accepted.push(unitId)
      }
      cancelledUnitIds = Object.freeze(accepted)
      return cancelledUnitIds
    },
    snapshotCancelled() {
      return cancelledUnitIds || EMPTY_CANCELLED_UNIT_IDS
    },
    acceptTerminalUnits(unitIds) {
      const values = typeof unitIds === 'string'
        ? [unitIds]
        : (unitIds && typeof unitIds[Symbol.iterator] === 'function' ? unitIds : [])

      const states = getUnitStates()
      const { list, set } = getPendingAcceptedStorage()

      for (const unitId of values) {
        if (typeof unitId !== 'string' || !states.has(unitId) || set.has(unitId)) continue
        set.add(unitId)
        list.push(unitId)
      }
    },
    drainAcceptedUnitIds() {
      if (!pendingAcceptedUnitIds) return EMPTY_CANCELLED_UNIT_IDS

      const snapshot = Object.freeze([...pendingAcceptedUnitIds])
      pendingAcceptedUnitIds = null
      pendingAcceptedUnitIdSet = null
      return snapshot
    },
    finalize() {
      if (report) return report
      finalized = true
      for (const candidate of parentCandidates.values()) candidate.discard()
      parentCandidates.clear()
      if (droppedDiagnostics > 0) {
        diagnostics.push(sanitizeDiagnostic(messageId, {
          type: 'DIAGNOSTICS_TRUNCATED',
          stage: 'operation',
          count: droppedDiagnostics,
        }))
      }
      report = createTranslationDiagnosticReport({ entries: diagnostics })
      return report
    },
    get finalized() {
      return finalized
    },
  }
}

export function appendTranslationDiagnostic(executionContext, fact) {
  return executionContext?.operation?.appendDiagnostic(fact) || false
}

/**
 * Records one normalized provider completion on the execution context. Safe
 * when no execution context exists; preserves response order across multiple
 * physical responses within one operation. Returns the frozen stored record
 * so callers can correlate the response with its completion fact.
 *
 * When the execution context carries a per-call `completionRef` slot
 * (`{ record: null }`), the frozen stored record is also published there.
 * The slot is response-scoped: it must be a fresh object per physical
 * provider call so concurrent calls sharing one operation stay isolated.
 */
export function recordProviderCompletion(executionContext, record) {
  const stored = executionContext?.operation?.recordCompletion(record) || false
  if (stored && executionContext?.completionRef) {
    executionContext.completionRef.record = stored
  }
  return stored
}

/**
 * Creates mutable metadata storage for one semantic provider execution. The
 * ref is detached from the logical operation until execution succeeds.
 */
export function createProviderExecutionMetadataRef() {
  return { metadata: {}, published: false }
}

/**
 * Publishes one successful provider-execution metadata slot into its
 * operation. Internal HTTP retries and failover stay inside this slot.
 * Recovery and primary records remain separate; aggregation is a later phase.
 */
export function publishProviderExecutionMetadata(executionContext, providerMetadataRef, callPurpose) {
  const metadata = providerMetadataRef?.metadata
  if (providerMetadataRef?.published || !metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).length === 0) return false
  const stored = executionContext?.operation?.recordProviderExecutionMetadata(metadata, callPurpose) || false
  if (stored) providerMetadataRef.published = true
  return stored
}

export function finalizeTranslationOperation(executionContext) {
  return executionContext?.operation?.finalize() || null
}
