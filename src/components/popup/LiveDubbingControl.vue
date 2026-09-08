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
      :disabled="isUnavailable || isStopping || isCleanupPending"
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
      v-if="errorMessage"
      class="ti-live-dubbing-control-error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import './LiveDubbingControl.scss'

const props = defineProps({
  targetLanguage: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['busy-change'])
const { sendMessage } = useMessaging(MessageContexts.POPUP)
const state = ref('loading')
const sessionId = ref(null)
const sessionDescriptor = ref(null)
const errorMessage = ref('')

const isStarting = computed(() => state.value === 'starting')
const isRunning = computed(() => state.value === 'running')
const isStopping = computed(() => state.value === 'stopping')
const isCleanupPending = computed(() => state.value === 'cleanup')
const isTransitioning = computed(() => isStarting.value || isStopping.value)
const isUnavailable = computed(() => state.value === 'unavailable')
const isBusy = computed(() => isTransitioning.value || isRunning.value || isCleanupPending.value)
const statusText = computed(() => ({
  loading: 'Checking availability…',
  idle: 'Ready',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Stopping…',
  cleanup: 'Cleanup needed',
  unavailable: 'Unavailable',
  error: 'Error'
}[state.value] || 'Error'))

const unwrap = (response) => response?.data || response || {}

const applyStatus = (response, { preserveSession = false } = {}) => {
  const result = unwrap(response)
  const descriptor = result.status && typeof result.status === 'object' ? result.status : result
  const nextSessionId = descriptor.sessionId || result.session?.id || null
  if (nextSessionId) {
    sessionId.value = nextSessionId
    sessionDescriptor.value = descriptor
  } else if (!preserveSession) {
    sessionId.value = null
    sessionDescriptor.value = null
  }

  if (result.available === false || descriptor.status === 'unavailable') {
    state.value = 'unavailable'
    errorMessage.value = result.error || 'Live dubbing is unavailable.'
    return
  }

  if (result.error && result.success === false) {
    state.value = sessionId.value ? 'cleanup' : 'error'
    errorMessage.value = result.error
    return
  }

  const statusMap = {
    CAPTURING: 'running',
    STOPPING: 'stopping',
    ERROR: 'error',
    starting: 'starting',
    running: 'running',
    stopping: 'stopping'
  }
  const status = descriptor.status
  const needsCleanup = sessionId.value && [
    'PREPARING_CAPTURE',
    'preparing_capture',
    'ERROR',
    'error',
    'CLEANUP_PENDING',
    'CLEANUP-PENDING',
    'cleanup-pending',
    'cleanup_pending'
  ].includes(status)
  state.value = needsCleanup ? 'cleanup' : statusMap[status] || 'idle'
  errorMessage.value = state.value === 'error' || state.value === 'cleanup'
    ? descriptor.lastError || result.error || 'Live dubbing failed.'
    : ''
}

const queryStatus = async () => {
  try {
    const response = await sendMessage({ action: 'GET_LIVE_DUBBING_STATUS' })
    applyStatus(response)
  } catch (error) {
    state.value = 'unavailable'
    errorMessage.value = error?.message || 'Live dubbing is unavailable.'
  }
}

const start = async () => {
  state.value = 'starting'
  errorMessage.value = ''
  try {
    const response = await sendMessage({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: props.targetLanguage }
    })
    applyStatus(response)
    if (state.value === 'idle') state.value = 'running'
  } catch (error) {
    state.value = 'error'
    errorMessage.value = error?.message || 'Unable to start live dubbing.'
  }
}

const stop = async () => {
  state.value = 'stopping'
  errorMessage.value = ''
  try {
    if (!sessionId.value && !sessionDescriptor.value?.sessionId) await queryStatus()
    const response = await sendMessage({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: sessionId.value || sessionDescriptor.value?.sessionId }
    })
    applyStatus(response, { preserveSession: true })
    if (state.value === 'idle') {
      sessionId.value = null
      sessionDescriptor.value = null
    }
  } catch (error) {
    // Keep retained session available after transport failure so cleanup can retry.
    applyStatus(error?.data || error?.response?.data || error, { preserveSession: true })
    state.value = sessionId.value ? 'cleanup' : 'error'
    errorMessage.value = error?.message || 'Unable to stop live dubbing.'
  }
}

onMounted(queryStatus)

watch(isBusy, (busy) => emit('busy-change', busy), { immediate: true })

// Parent owns target-language control; popup close intentionally sends no dubbing cleanup.
</script>
