<template>
  <section
    class="ti-live-dubbing-control"
    aria-labelledby="live-dubbing-label"
  >
    <div class="ti-live-dubbing-control-copy">
      <span
        id="live-dubbing-label"
        class="ti-live-dubbing-control-label"
      >Live dubbing</span>
      <span
        class="ti-live-dubbing-control-status"
        aria-live="polite"
      >{{ statusText }}</span>
    </div>

    <div
      v-if="showVolumeControl"
      class="ti-live-dubbing-control-volumes"
    >
      <div class="ti-live-dubbing-control-volume">
        <label
          class="ti-live-dubbing-control-volume-label"
          for="ti-live-dubbing-volume"
        >Original</label>
        <input
          id="ti-live-dubbing-volume"
          type="range"
          class="ti-live-dubbing-control-volume-slider"
          min="0"
          max="100"
          step="1"
          :value="displayVolume ?? 0"
          :disabled="!isVolumeControllable || !volumeResolved"
          @input="onVolumeInput"
        >
        <span
          class="ti-live-dubbing-control-volume-value"
          aria-live="polite"
        >{{ displayVolume != null ? displayVolume + '%' : '—' }}</span>
      </div>

      <div class="ti-live-dubbing-control-volume">
        <label
          class="ti-live-dubbing-control-volume-label"
          for="ti-live-dubbing-dubbed-volume"
        >Dubbed Volume</label>
        <input
          id="ti-live-dubbing-dubbed-volume"
          type="range"
          class="ti-live-dubbing-control-volume-slider"
          min="0"
          max="100"
          step="1"
          :value="displayDubbedVolume ?? 0"
          :disabled="!isVolumeControllable || !dubbedVolumeResolved"
          @input="onDubbedVolumeInput"
        >
        <span
          class="ti-live-dubbing-control-volume-value"
          aria-live="polite"
        >{{ displayDubbedVolume != null ? displayDubbedVolume + '%' : '—' }}</span>
      </div>
    </div>

    <LoadingSpinner
      v-if="isTransitioning"
      class="ti-live-dubbing-control-spinner"
      size="xs"
      aria-hidden="true"
    />

    <BaseButton
      v-if="!isRunning && !isStopping"
      size="sm"
      :loading="isStarting"
      :disabled="isUnavailable || isLoading || isStopping || isCleanupPending"
      text="Start"
      aria-label="Start live dubbing"
      @click="start"
    />
    <BaseButton
      v-if="isRunning || isStopping"
      size="sm"
      variant="danger"
      :loading="isStopping"
      :disabled="isStopping"
      :text="isCleanupPending ? 'Clean up' : 'Stop'"
      :aria-label="isCleanupPending ? 'Clean up live dubbing' : 'Stop live dubbing'"
      @click="stop"
    />
    <BaseButton
      v-if="isCleanupPending"
      size="sm"
      variant="danger"
      text="Clean up"
      aria-label="Clean up live dubbing"
      @click="stop"
    />

    <p
      v-if="errorMessage || (isIdle && terminalOutcome)"
      class="ti-live-dubbing-control-error"
      role="alert"
    >
      {{ errorMessage || getErrorMessage(terminalOutcome.error, 'Live dubbing failed.', terminalOutcome.providerId) }}
    </p>

    <p
      v-if="volumeError"
      class="ti-live-dubbing-control-volume-error"
      role="status"
    >
      {{ volumeError }}
    </p>

    <p
      v-if="dubbedVolumeError"
      class="ti-live-dubbing-control-volume-error"
      role="status"
    >
      {{ dubbedVolumeError }}
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import './LiveDubbingControl.scss'
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_PROVIDER_IDS,
  LIVE_DUBBING_PROVIDER_ID
} from '@/features/live-dubbing/constants.js'
import { isAuthorizedLiveDubbingOffscreenControlSender } from '@/features/live-dubbing/contracts.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

const { t } = useUnifiedI18n()

const props = defineProps({
  targetLanguage: {
    type: String,
    required: true
  },
  providerId: {
    type: String,
    default: LIVE_DUBBING_PROVIDER_ID,
    validator: (value) => LIVE_DUBBING_PROVIDER_IDS.includes(value)
  }
})

const emit = defineEmits(['busy-change'])
const { sendMessage } = useMessaging(MessageContexts.POPUP)
const extensionBrowser = typeof browser !== 'undefined' ? browser : null
const SAFE_TERMINAL_ERROR = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/
const state = ref('loading')
const authoritativeStatus = ref(null)
const sessionId = ref(null)
const sessionDescriptor = ref(null)
const sessionProviderId = ref(null)
const errorMessage = ref('')
const terminalOutcome = ref(null)
let operationGeneration = 0
let removeRuntimeListener = null

// ── Volume state (local only, no Pinia/storage) ──────────────────────────────
// desiredVolume: optimistic value the UI reflects, 0..1
// confirmedVolume: last backend-confirmed value, 0..1 — rollback target
// volumeResolved: true once the first queryOriginalVolume or sendVolume succeeds
// pendingVolumeShot: immutable {fence, volume, generation} snapshot captured at user-input
//   time for fence-scoped sends — prevents stale-session writes when the fence shifts
//   between scheduling and executing.  generation is bumped at input time so that any
//   older in-flight query/write is immediately invalidated when the user acts.
const desiredVolume = ref(null)
const confirmedVolume = ref(null)
const volumeResolved = ref(false)
const volumeError = ref('')
let volumeRequestGeneration = 0
let volumeThrottleTimer = null
const VOLUME_THROTTLE_MS = 80
let pendingVolumeShot = null
const volumeRecoveryInProgress = ref(false)
const MAX_VOLUME_RECOVERY_DEPTH = 1

// ── Dubbed volume state (local only, no Pinia/storage) ───────────────────────
// Mirrors the Original Volume state exactly, with an independent generation
// counter so a bump in one slider never discards pending ops of the other.
const desiredDubbedVolume = ref(null)
const confirmedDubbedVolume = ref(null)
const dubbedVolumeResolved = ref(false)
const dubbedVolumeError = ref('')
let dubbedVolumeRequestGeneration = 0
let dubbedVolumeThrottleTimer = null
const DUBBED_VOLUME_THROTTLE_MS = 80
let pendingDubbedVolumeShot = null
const dubbedVolumeRecoveryInProgress = ref(false)
const MAX_DUBBED_VOLUME_RECOVERY_DEPTH = 1

const isStarting = computed(() => state.value === 'starting')
const isRunning = computed(() => state.value === 'running')
const isStopping = computed(() => state.value === 'stopping')
const isCleanupPending = computed(() => state.value === 'cleanup')
const isTransitioning = computed(() => isStarting.value || isStopping.value)
const isUnavailable = computed(() => state.value === 'unavailable')
const isLoading = computed(() => state.value === 'loading')
const isIdle = computed(() => state.value === 'idle')
const isBusy = computed(() => isTransitioning.value || isRunning.value || isCleanupPending.value)
const statusText = computed(() => ({
  loading: 'Checking availability…',
  idle: 'Ready',
  PREPARING_CAPTURE: 'Preparing capture…',
  CONNECTING_PROVIDER: 'Connecting to provider…',
  RUNNING: 'Running',
  STOPPING: 'Stopping…',
  ERROR: 'Error',
  unavailable: 'Unavailable'
}[authoritativeStatus.value || state.value] || 'Error'))

const isVolumeControllable = computed(() =>
  ['PREPARING_CAPTURE', 'CONNECTING_PROVIDER', 'RUNNING'].includes(authoritativeStatus.value)
    && !isStopping.value
)
const showVolumeControl = computed(() => isVolumeControllable.value && sessionId.value != null)
const displayVolume = computed(() => {
  if (!volumeResolved.value) return null
  const v = desiredVolume.value ?? confirmedVolume.value
  return Math.round(v * 100)
})
const displayDubbedVolume = computed(() => {
  if (!dubbedVolumeResolved.value) return null
  const v = desiredDubbedVolume.value ?? confirmedDubbedVolume.value
  return Math.round(v * 100)
})
const volumeFence = computed(() => {
  const d = sessionDescriptor.value
  return d ? `${d.sessionId}|${d.providerId}|${d.eventSequence ?? ''}` : null
})

const getErrorMessage = (error, fallback = 'Live dubbing failed.', providerId = sessionProviderId.value || props.providerId) => {
  if (error === 'LIVE_DUBBING_OFFSCREEN_LOST') {
    return t('live_dubbing_offscreen_lost_error')
  }
  if (error === 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE') {
    return providerId === 'openai'
      ? t('live_dubbing_provider_bootstrap_openai_error')
      : t('live_dubbing_provider_bootstrap_gemini_error')
  }
  if (error === 'LIVE_DUBBING_PROVIDER_SETUP_FAILED') {
    return t('live_dubbing_provider_setup_failed_error')
  }
  const hardcoded = {
    LIVE_DUBBING_UNSUPPORTED: 'Live dubbing is not supported in this browser.',
    INVALID_TARGET_LANGUAGE: 'This target language is not supported for live dubbing.'
  }
  return hardcoded[error] || (typeof error === 'string' && error ? error : fallback)
}

const unwrap = (response) => response?.data || response || {}

const normalizeTerminalOutcome = (value) => {
  if (!value || typeof value !== 'object'
    || !LIVE_DUBBING_PROVIDER_IDS.includes(value.providerId)
    || typeof value.error !== 'string' || !value.error.trim()
    || !SAFE_TERMINAL_ERROR.test(value.error.trim())
    || !Number.isFinite(value.occurredAt)) return null

  // The service worker owns sanitization. Keep a bounded scalar copy here and
  // deliberately discard providerDiagnostic before anything reaches the DOM.
  return {
    providerId: value.providerId,
    error: value.error.trim().slice(0, 240),
    occurredAt: value.occurredAt
  }
}

const nextOperationGeneration = () => {
  operationGeneration += 1
  return operationGeneration
}

const applyStatus = (response, { preserveSession = false, syncTerminalOutcome = false } = {}) => {
  const result = unwrap(response)
  const descriptor = result.status && typeof result.status === 'object' ? result.status : result
  const nextTerminalOutcome = normalizeTerminalOutcome(result.terminalOutcome)
  if (syncTerminalOutcome) terminalOutcome.value = nextTerminalOutcome
  const nextSessionId = descriptor.sessionId || result.session?.id || null
  if (nextSessionId) {
    sessionId.value = nextSessionId
    sessionDescriptor.value = descriptor
    if (LIVE_DUBBING_PROVIDER_IDS.includes(descriptor.providerId)) sessionProviderId.value = descriptor.providerId
  } else if (!preserveSession) {
    sessionId.value = null
    sessionDescriptor.value = null
    sessionProviderId.value = null
  }

  if (result.available === false || result.error === 'LIVE_DUBBING_UNSUPPORTED' || descriptor.status === 'unavailable') {
    authoritativeStatus.value = null
    state.value = 'unavailable'
    errorMessage.value = getErrorMessage(result.error, 'Live dubbing is unavailable.')
    return
  }

  const status = descriptor.status
  const statuses = ['PREPARING_CAPTURE', 'CONNECTING_PROVIDER', 'RUNNING', 'STOPPING', 'ERROR']
  authoritativeStatus.value = statuses.includes(status) ? status : null
  const stateMap = {
    PREPARING_CAPTURE: 'starting',
    CONNECTING_PROVIDER: 'starting',
    RUNNING: 'running',
    STOPPING: 'stopping',
    ERROR: sessionId.value ? 'cleanup' : 'error'
  }
  state.value = stateMap[status] || (result.error && result.success === false ? 'error' : 'idle')
  errorMessage.value = status === 'ERROR' || result.error
    ? getErrorMessage(descriptor.lastError || result.error)
    : ''
}

// ── Volume fencing helpers ────────────────────────────────────────────────────

const nextVolumeGeneration = () => {
  volumeRequestGeneration += 1
  return volumeRequestGeneration
}

const resetVolumeState = () => {
  nextVolumeGeneration()
  if (volumeThrottleTimer != null) {
    clearTimeout(volumeThrottleTimer)
    volumeThrottleTimer = null
  }
  pendingVolumeShot = null
  desiredVolume.value = null
  confirmedVolume.value = null
  volumeResolved.value = false
  volumeError.value = ''
}

const nextDubbedVolumeGeneration = () => {
  dubbedVolumeRequestGeneration += 1
  return dubbedVolumeRequestGeneration
}

const resetDubbedVolumeState = () => {
  nextDubbedVolumeGeneration()
  if (dubbedVolumeThrottleTimer != null) {
    clearTimeout(dubbedVolumeThrottleTimer)
    dubbedVolumeThrottleTimer = null
  }
  pendingDubbedVolumeShot = null
  desiredDubbedVolume.value = null
  confirmedDubbedVolume.value = null
  dubbedVolumeResolved.value = false
  dubbedVolumeError.value = ''
}

const isSessionMismatchError = (result) => result?.success === false && (
  result.error === 'LIVE_DUBBING_SESSION_MISMATCH'
  || result.error === 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH'
  || result.error === 'LIVE_DUBBING_SESSION_UNAVAILABLE'
)

/** Snapshot the current session fence so sends scheduled for later can verify
 *  the fence is still valid at execution time. */
const captureCurrentFence = () => {
  const d = sessionDescriptor.value
  if (!d) return null
  return { sessionId: d.sessionId, providerId: d.providerId, eventSequence: d.eventSequence }
}

/**
 * Refresh lifecycle status for volume recovery without bumping the lifecycle
 * generation counter.  Snapshots the current generation, sends a STATUS query,
 * and discards the result if the generation changed during the round-trip.
 * This prevents volume-mismatch recovery from invalidating in-flight
 * START/STOP operations.
 * @returns {boolean} true if the result was accepted (generation unchanged)
 */
const refreshLifecycleForVolume = async () => {
  const generation = operationGeneration
  try {
    const response = await sendMessage({ action: 'GET_LIVE_DUBBING_STATUS' })
    if (generation !== operationGeneration) return false
    applyStatus(response, { syncTerminalOutcome: true })
    return true
  } catch {
    if (generation !== operationGeneration) return false
    return false
  }
}

/**
 * Refresh lifecycle status for dubbed-volume recovery without bumping the
 * lifecycle generation counter.  Independent from refreshLifecycleForVolume —
 * uses the dubbed generation guard so Original Volume work is unaffected.
 * @returns {boolean} true if the result was accepted (generation unchanged)
 */
const refreshLifecycleForDubbedVolume = async () => {
  const generation = operationGeneration
  try {
    const response = await sendMessage({ action: 'GET_LIVE_DUBBING_STATUS' })
    if (generation !== operationGeneration) return false
    applyStatus(response, { syncTerminalOutcome: true })
    return true
  } catch {
    if (generation !== operationGeneration) return false
    return false
  }
}

/**
 * Recover the runtime original-audio volume for the active session.
 * Never assumes 0 — always queries the backend.
 * @param {number} depth - recursion guard; 0 = first attempt, 1 = one retry
 */
const queryOriginalVolume = async (generation = nextVolumeGeneration(), depth = 0) => {
  const descriptor = sessionDescriptor.value
  if (!descriptor?.sessionId || !descriptor?.providerId) return

  try {
    const response = await sendMessage({
      action: LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME,
      data: {
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: descriptor.eventSequence
      }
    })
    if (generation !== volumeRequestGeneration) return

    const result = unwrap(response)

    if (result.success === false) {
      if (isSessionMismatchError(result)) {
        if (volumeRecoveryInProgress.value) return
        if (depth >= MAX_VOLUME_RECOVERY_DEPTH) return
        volumeRecoveryInProgress.value = true
        const recoveryGeneration = volumeRequestGeneration
        const fenceBeforeRefresh = volumeFence.value
        try {
          const accepted = await refreshLifecycleForVolume()
          if (recoveryGeneration !== volumeRequestGeneration) return
          // If the exact fence changed during refresh, the watcher owns the
          // new-fence read — do not retry here to avoid duplicate queries.
          if (volumeFence.value !== fenceBeforeRefresh) return
          if (accepted && isVolumeControllable.value && sessionId.value) {
            void queryOriginalVolume(nextVolumeGeneration(), depth + 1)
          }
        } finally {
          volumeRecoveryInProgress.value = false
        }
        return
      }
      // LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE and other non-mismatch errors:
      // keep last-confirmed, show inline error — never terminal, never stop/cleanup
      volumeError.value = 'Original audio unavailable'
      return
    }

    if (typeof result.originalVolume === 'number'
      && Number.isFinite(result.originalVolume)
      && result.originalVolume >= 0
      && result.originalVolume <= 1) {
      confirmedVolume.value = result.originalVolume
      desiredVolume.value = result.originalVolume
      volumeError.value = ''
      volumeResolved.value = true
    }
  } catch {
    if (generation !== volumeRequestGeneration) return
    // Transport failure: keep last-confirmed, silent — no toast, no terminal
  }
}

/**
 * Recover the runtime dubbed-audio volume for the active session.
 * Mirrors queryOriginalVolume with an independent generation counter.
 * Never assumes 0 — always queries the backend.
 * @param {number} generation - request generation snapshot; stale responses are discarded
 * @param {number} depth - recursion guard; 0 = first attempt, 1 = one retry
 */
const queryDubbedVolume = async (generation = nextDubbedVolumeGeneration(), depth = 0) => {
  const descriptor = sessionDescriptor.value
  if (!descriptor?.sessionId || !descriptor?.providerId) return

  try {
    const response = await sendMessage({
      action: LIVE_DUBBING_ACTIONS.GET_DUBBED_VOLUME,
      data: {
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        eventSequence: descriptor.eventSequence
      }
    })
    if (generation !== dubbedVolumeRequestGeneration) return

    const result = unwrap(response)

    if (result.success === false) {
      if (isSessionMismatchError(result)) {
        desiredDubbedVolume.value = confirmedDubbedVolume.value
        if (dubbedVolumeRecoveryInProgress.value) return
        if (depth >= MAX_DUBBED_VOLUME_RECOVERY_DEPTH) return
        dubbedVolumeRecoveryInProgress.value = true
        const recoveryGeneration = dubbedVolumeRequestGeneration
        const fenceBeforeRefresh = volumeFence.value
        try {
          const accepted = await refreshLifecycleForDubbedVolume()
          if (recoveryGeneration !== dubbedVolumeRequestGeneration) return
          // If the exact fence changed during refresh, the watcher owns the
          // new-fence read — do not retry here to avoid duplicate queries.
          if (volumeFence.value !== fenceBeforeRefresh) return
          if (accepted && isVolumeControllable.value && sessionId.value) {
            void queryDubbedVolume(nextDubbedVolumeGeneration(), depth + 1)
          }
        } finally {
          dubbedVolumeRecoveryInProgress.value = false
        }
        return
      }
      // LIVE_DUBBING_DUBBED_AUDIO_UNAVAILABLE and other non-mismatch errors:
      // keep last-confirmed, show inline error — never terminal, never stop/cleanup
      dubbedVolumeError.value = 'Dubbed audio unavailable'
      return
    }

    if (typeof result.dubbedVolume === 'number'
      && Number.isFinite(result.dubbedVolume)
      && result.dubbedVolume >= 0
      && result.dubbedVolume <= 1) {
      confirmedDubbedVolume.value = result.dubbedVolume
      desiredDubbedVolume.value = result.dubbedVolume
      dubbedVolumeError.value = ''
      dubbedVolumeResolved.value = true
    }
  } catch {
    if (generation !== dubbedVolumeRequestGeneration) return
    // Transport failure: keep last-confirmed, silent — no toast, no terminal
  }
}

/**
 * Send a volume write to the backend with fencing.
 * Success commits confirmedVolume; failure rolls back desiredVolume;
 * superseded = non-error, no rollback, no error display.
 * @param {number} depth - recursion guard; 0 = first attempt, 1 = one retry
 */
const sendVolume = async (depth = 0) => {
  const shot = pendingVolumeShot
  pendingVolumeShot = null
  if (!shot?.fence?.sessionId || !shot.fence?.providerId) return

  const { fence, volume, generation } = shot

  // Pre-send fence check: skip if session shifted since input was captured
  const current = sessionDescriptor.value
  if (!current
    || current.sessionId !== fence.sessionId
    || current.providerId !== fence.providerId
    || current.eventSequence !== fence.eventSequence) return

  try {
    const response = await sendMessage({
      action: LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME,
      data: {
        sessionId: fence.sessionId,
        providerId: fence.providerId,
        eventSequence: fence.eventSequence,
        volume
      }
    })
    if (generation !== volumeRequestGeneration) return

    const result = unwrap(response)

    if (result.success === false) {
      if (isSessionMismatchError(result)) {
        if (volumeRecoveryInProgress.value) return
        if (depth >= MAX_VOLUME_RECOVERY_DEPTH) return
        volumeRecoveryInProgress.value = true
        const recoveryGeneration = volumeRequestGeneration
        const fenceBeforeRefresh = volumeFence.value
        try {
          const accepted = await refreshLifecycleForVolume()
          if (recoveryGeneration !== volumeRequestGeneration) return
          if (volumeFence.value !== fenceBeforeRefresh) return
          if (accepted && isVolumeControllable.value && sessionId.value) {
            void queryOriginalVolume(nextVolumeGeneration(), depth + 1)
          }
        } finally {
          volumeRecoveryInProgress.value = false
        }
        return
      }
      if (result.error === 'LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE') {
        desiredVolume.value = confirmedVolume.value
        volumeError.value = 'Original audio unavailable'
        return
      }
      // Unknown failure: rollback to last-confirmed
      desiredVolume.value = confirmedVolume.value
      return
    }

    // Superseded = latest-wins: non-error, no rollback, no commit, no error
    if (result.ignored && result.superseded) return

    // Success: commit confirmed
    if (typeof result.originalVolume === 'number'
      && Number.isFinite(result.originalVolume)
      && result.originalVolume >= 0
      && result.originalVolume <= 1) {
      confirmedVolume.value = result.originalVolume
      desiredVolume.value = result.originalVolume
      volumeError.value = ''
      volumeResolved.value = true
    }
  } catch {
    if (generation !== volumeRequestGeneration) return
    // Transport failure: rollback to last-confirmed
    desiredVolume.value = confirmedVolume.value
  }
}

/**
 * Trailing throttle for volume input: fires at most once every VOLUME_THROTTLE_MS.
 * Unlike debounce, it does NOT reset the timer on subsequent inputs — the first
 * input starts the cycle, and the next input after the cycle starts a new one.
 * This provides runtime updates during drag while bounding message frequency.
 */
const onVolumeInput = (event) => {
  const raw = Number(event.target.value)
  const clamped = Math.max(0, Math.min(100, raw))
  desiredVolume.value = clamped / 100
  volumeError.value = ''
  const generation = nextVolumeGeneration()
  const fence = captureCurrentFence()
  if (fence) {
    pendingVolumeShot = Object.freeze({ fence, volume: desiredVolume.value, generation })
  }

  // Trailing throttle: skip if a timer is already running
  if (volumeThrottleTimer != null) return
  volumeThrottleTimer = setTimeout(() => {
    volumeThrottleTimer = null
    void sendVolume()
  }, VOLUME_THROTTLE_MS)
}

/**
 * Send a dubbed-volume write to the backend with fencing.
 * Mirrors sendVolume with an independent generation counter.
 * Success commits confirmedDubbedVolume; session-mismatch rolls back and
 * recovers; unavailable rolls back with an inline error; invalid keeps the
 * optimistic value with an inline error; other failures roll back.
 * Superseded = non-error, no rollback, no error display.
 * @param {number} depth - recursion guard; 0 = first attempt, 1 = one retry
 */
const sendDubbedVolume = async (depth = 0) => {
  const shot = pendingDubbedVolumeShot
  pendingDubbedVolumeShot = null
  if (!shot?.fence?.sessionId || !shot.fence?.providerId) return

  const { fence, volume, generation } = shot

  // Pre-send fence check: skip if session shifted since input was captured
  const current = sessionDescriptor.value
  if (!current
    || current.sessionId !== fence.sessionId
    || current.providerId !== fence.providerId
    || current.eventSequence !== fence.eventSequence) return

  try {
    const response = await sendMessage({
      action: LIVE_DUBBING_ACTIONS.SET_DUBBED_VOLUME,
      data: {
        sessionId: fence.sessionId,
        providerId: fence.providerId,
        eventSequence: fence.eventSequence,
        volume
      }
    })
    if (generation !== dubbedVolumeRequestGeneration) return

    const result = unwrap(response)

    if (result.success === false) {
      if (isSessionMismatchError(result)) {
        desiredDubbedVolume.value = confirmedDubbedVolume.value
        if (dubbedVolumeRecoveryInProgress.value) return
        if (depth >= MAX_DUBBED_VOLUME_RECOVERY_DEPTH) return
        dubbedVolumeRecoveryInProgress.value = true
        const recoveryGeneration = dubbedVolumeRequestGeneration
        const fenceBeforeRefresh = volumeFence.value
        try {
          const accepted = await refreshLifecycleForDubbedVolume()
          if (recoveryGeneration !== dubbedVolumeRequestGeneration) return
          if (volumeFence.value !== fenceBeforeRefresh) return
          if (accepted && isVolumeControllable.value && sessionId.value) {
            void queryDubbedVolume(nextDubbedVolumeGeneration(), depth + 1)
          }
        } finally {
          dubbedVolumeRecoveryInProgress.value = false
        }
        return
      }
      if (result.error === 'LIVE_DUBBING_DUBBED_AUDIO_UNAVAILABLE') {
        desiredDubbedVolume.value = confirmedDubbedVolume.value
        dubbedVolumeError.value = 'Dubbed audio unavailable'
        return
      }
      if (result.error === 'LIVE_DUBBING_DUBBED_VOLUME_INVALID') {
        dubbedVolumeError.value = 'Invalid dubbed volume'
        return
      }
      // Unknown failure: rollback to last-confirmed
      desiredDubbedVolume.value = confirmedDubbedVolume.value
      return
    }

    // Superseded = latest-wins: non-error, no rollback, no commit, no error
    if (result.ignored && result.superseded) return

    // Success: commit confirmed
    if (typeof result.dubbedVolume === 'number'
      && Number.isFinite(result.dubbedVolume)
      && result.dubbedVolume >= 0
      && result.dubbedVolume <= 1) {
      confirmedDubbedVolume.value = result.dubbedVolume
      desiredDubbedVolume.value = result.dubbedVolume
      dubbedVolumeError.value = ''
      dubbedVolumeResolved.value = true
    }
  } catch {
    if (generation !== dubbedVolumeRequestGeneration) return
    // Transport failure: rollback to last-confirmed
    desiredDubbedVolume.value = confirmedDubbedVolume.value
  }
}

/**
 * Trailing throttle for dubbed-volume input: fires at most once every
 * DUBBED_VOLUME_THROTTLE_MS.  Unlike debounce, it does NOT reset the timer
 * on subsequent inputs — the first input starts the cycle, and the next
 * input after the cycle starts a new one.  Independent timer from Original.
 */
const onDubbedVolumeInput = (event) => {
  const raw = Number(event.target.value)
  const clamped = Math.max(0, Math.min(100, raw))
  desiredDubbedVolume.value = clamped / 100
  dubbedVolumeError.value = ''
  const generation = nextDubbedVolumeGeneration()
  const fence = captureCurrentFence()
  if (fence) {
    pendingDubbedVolumeShot = Object.freeze({ fence, volume: desiredDubbedVolume.value, generation })
  }

  // Trailing throttle: skip if a timer is already running
  if (dubbedVolumeThrottleTimer != null) return
  dubbedVolumeThrottleTimer = setTimeout(() => {
    dubbedVolumeThrottleTimer = null
    void sendDubbedVolume()
  }, DUBBED_VOLUME_THROTTLE_MS)
}

/**
 * Flush any pending volume send synchronously (called on unmount).
 * Only sends if the captured snapshot is still valid (current descriptor matches).
 */
const flushPendingVolumeSend = () => {
  if (volumeThrottleTimer != null) {
    clearTimeout(volumeThrottleTimer)
    volumeThrottleTimer = null
  }
  if (pendingVolumeShot) {
    const current = sessionDescriptor.value
    const { fence } = pendingVolumeShot
    const stillValid = current
      && current.sessionId === fence.sessionId
      && current.providerId === fence.providerId
      && current.eventSequence === fence.eventSequence
    if (stillValid && isVolumeControllable.value) {
      void sendVolume()
    } else {
      pendingVolumeShot = null
    }
  }
}

/**
 * Flush any pending dubbed-volume send synchronously (called on unmount).
 * Only sends if the captured snapshot is still valid (current descriptor matches).
 */
const flushPendingDubbedVolumeSend = () => {
  if (dubbedVolumeThrottleTimer != null) {
    clearTimeout(dubbedVolumeThrottleTimer)
    dubbedVolumeThrottleTimer = null
  }
  if (pendingDubbedVolumeShot) {
    const current = sessionDescriptor.value
    const { fence } = pendingDubbedVolumeShot
    const stillValid = current
      && current.sessionId === fence.sessionId
      && current.providerId === fence.providerId
      && current.eventSequence === fence.eventSequence
    if (stillValid && isVolumeControllable.value) {
      void sendDubbedVolume()
    } else {
      pendingDubbedVolumeShot = null
    }
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

const queryStatus = async (generation = nextOperationGeneration()) => {
  const prevFence = volumeFence.value
  try {
    const response = await sendMessage({ action: 'GET_LIVE_DUBBING_STATUS' })
    if (generation !== operationGeneration) return
    applyStatus(response, { syncTerminalOutcome: true })
    // After status recovery, recover volume if controllable — independent round trip.
    // The volumeFence watcher handles all fence transitions (active→active).
    // Only the initial mount (null→active) is owned here, since the watcher
    // skips the null→active transition.
    if (isVolumeControllable.value && sessionId.value && prevFence === null) {
      void queryOriginalVolume()
      void queryDubbedVolume()
    } else if (!isVolumeControllable.value || !sessionId.value) {
      resetVolumeState()
      resetDubbedVolumeState()
    }
  } catch (error) {
    if (generation !== operationGeneration) return
    state.value = 'unavailable'
    authoritativeStatus.value = null
    errorMessage.value = getErrorMessage(error?.message, 'Live dubbing is unavailable.')
    resetVolumeState()
    resetDubbedVolumeState()
  }
}

const start = async () => {
  const generation = nextOperationGeneration()
  const prevFence = volumeFence.value
  state.value = 'starting'
  errorMessage.value = ''
  try {
    const response = await sendMessage({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: props.targetLanguage, providerId: props.providerId }
    })
    if (generation !== operationGeneration) return
    applyStatus(response)
    if (state.value === 'idle') state.value = 'running'
    if (state.value === 'running' && !normalizeTerminalOutcome(unwrap(response).terminalOutcome)) {
      terminalOutcome.value = null
    }
    // Recover volume for the newly established controllable session.
    // The volumeFence watcher skips the initial null→active transition, so
    // START must own this recovery path.  For active→active (restart), the
    // watcher handles it.
    if (isVolumeControllable.value && sessionId.value && prevFence === null) {
      void queryOriginalVolume()
      void queryDubbedVolume()
    }
  } catch (error) {
    if (generation !== operationGeneration) return
    // Preserve structured START failure context (session, cleanupPending,
    // retryable, status, safe diagnostics) so a retained session stays
    // stoppable instead of resetting to clean idle.
    const failure = error?.data || error?.response?.data
    if (failure && typeof failure === 'object') {
      applyStatus(failure, { preserveSession: true })
      if (state.value === 'idle') state.value = 'error'
      if (!errorMessage.value) errorMessage.value = getErrorMessage(error?.message, 'Unable to start live dubbing.')
    } else {
      state.value = 'error'
      errorMessage.value = getErrorMessage(error?.message, 'Unable to start live dubbing.')
    }
  }
}

const stop = async () => {
  // Invalidate in-flight volume work immediately: cancel throttle timers,
  // clear pending shots, bump generations so no old SET resolves after STOP.
  resetVolumeState()
  resetDubbedVolumeState()
  const generation = nextOperationGeneration()
  state.value = 'stopping'
  errorMessage.value = ''
  try {
    if (!sessionId.value && !sessionDescriptor.value?.sessionId) await queryStatus(generation)
    if (generation !== operationGeneration) return
    const response = await sendMessage({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: sessionId.value || sessionDescriptor.value?.sessionId }
    })
    if (generation !== operationGeneration) return
    applyStatus(response, { preserveSession: true })
    if (state.value === 'idle') {
      sessionId.value = null
      sessionDescriptor.value = null
      sessionProviderId.value = null
    }
  } catch (error) {
    if (generation !== operationGeneration) return
    // Keep retained session available after transport failure so cleanup can retry.
    applyStatus(error?.data || error?.response?.data || error, { preserveSession: true })
    state.value = sessionId.value ? 'cleanup' : 'error'
    errorMessage.value = getErrorMessage(error?.message, 'Unable to stop live dubbing.')
  }
}

const handleRuntimeMessage = (message, sender) => {
  if (message?.action !== LIVE_DUBBING_ACTIONS.TERMINAL_OUTCOME
    || !isAuthorizedLiveDubbingOffscreenControlSender(sender, extensionBrowser)) return

  // Notifications only invalidate the view. The authoritative response is the
  // sole source used for rendering terminal outcome data.
  void queryStatus()
}

onMounted(() => {
  if (typeof extensionBrowser?.runtime?.onMessage?.addListener === 'function') {
    extensionBrowser.runtime.onMessage.addListener(handleRuntimeMessage)
    removeRuntimeListener = () => extensionBrowser.runtime.onMessage.removeListener(handleRuntimeMessage)
  }
  void queryStatus()
})

onUnmounted(() => {
  removeRuntimeListener?.()
  removeRuntimeListener = null
  flushPendingVolumeSend()
  flushPendingDubbedVolumeSend()
})

watch(isBusy, (busy) => emit('busy-change', busy), { immediate: true })

// Cancel pending volume sends and re-query when the session fence shifts
// externally (e.g. background restart assigns a new sessionId).
// Skip the initial mount transition (oldFence === null) — the first volume
// query is owned by queryStatus (mount) or start() (START-from-idle).
// The watcher always owns new-fence recovery, even when a mismatch recovery
// is in progress.  resetVolumeState() bumps volumeRequestGeneration which
// invalidates the old recovery's generation check, so no duplicate reads.
watch(volumeFence, (newFence, oldFence) => {
  if (oldFence === null) return
  resetVolumeState()
  resetDubbedVolumeState()
  if (isVolumeControllable.value && sessionId.value) {
    void queryOriginalVolume()
    void queryDubbedVolume()
  }
})

// Parent owns target-language control; popup close intentionally sends no dubbing cleanup.
</script>
