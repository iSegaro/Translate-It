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

const queryStatus = async (generation = nextOperationGeneration()) => {
  try {
    const response = await sendMessage({ action: 'GET_LIVE_DUBBING_STATUS' })
    if (generation !== operationGeneration) return
    applyStatus(response, { syncTerminalOutcome: true })
  } catch (error) {
    if (generation !== operationGeneration) return
    state.value = 'unavailable'
    authoritativeStatus.value = null
    errorMessage.value = getErrorMessage(error?.message, 'Live dubbing is unavailable.')
  }
}

const start = async () => {
  const generation = nextOperationGeneration()
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
})

watch(isBusy, (busy) => emit('busy-change', busy), { immediate: true })

// Parent owns target-language control; popup close intentionally sends no dubbing cleanup.
</script>
