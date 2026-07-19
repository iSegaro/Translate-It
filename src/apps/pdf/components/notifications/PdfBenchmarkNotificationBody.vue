<template>
  <div class="pdf-benchmark-notification">
    <div class="pdf-benchmark-notification__analysis">
      <span v-if="analysis?.winner">Winner {{ analysis.winner.candidateId }} ({{ winnerReasonLabel(analysis.winner.reason) }})</span>
      <span v-if="analysis?.confidence?.highest !== null && analysis?.confidence?.highest !== undefined">
        Confidence {{ analysis.confidence.highest }}<template v-if="analysis.confidence.comparable && analysis.confidence.delta !== 0"> (+{{ analysis.confidence.delta }})</template>
      </span>
      <span>OCR Output {{ analysis?.output?.comparable ? (analysis.output.identical ? 'Identical' : 'Different') : 'Not comparable' }}</span>
    </div>
    <ul class="pdf-benchmark-notification__results">
      <li
        v-for="result in results"
        :key="result.candidateId"
      >
        <code>{{ result.candidateId }}</code>
        <span v-if="result.configuration?.scale !== undefined">Scale {{ result.configuration.scale }}</span>
        <span v-if="result.configuration?.language">Language {{ result.configuration.language }}</span>
        <span v-if="Number.isFinite(result.runtime?.latencyMs)">Runtime {{ result.runtime.latencyMs }}ms</span>
        <span>OCR {{ result.output?.status }}</span>
        <span v-if="Number.isFinite(result.output?.data?.confidence)">Confidence {{ result.output.data.confidence }}</span>
        <span v-if="Number.isFinite(result.evaluation?.cer?.characterErrorRate)">CER {{ formatCer(result.evaluation) }} · {{ evaluationStatus(result.evaluation) }}</span>
        <strong v-if="analysis?.winnerCandidateId === result.candidateId">Winner</strong>
      </li>
    </ul>
    <span
      v-if="Number.isFinite(payload?.totalElapsedMs)"
      class="pdf-benchmark-notification__total"
    >
      Total {{ payload.totalElapsedMs }}ms
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import './PdfBenchmarkNotificationBody.scss'

const props = defineProps({
  payload: {
    type: Object,
    default: null
  }
})

const analysis = computed(() => props.payload?.analysis ?? null)
const results = computed(() => Array.isArray(props.payload?.results) ? props.payload.results : [])

function formatCer(evaluation) {
  const errorRate = evaluation?.cer?.characterErrorRate
  return Number.isFinite(errorRate) ? errorRate.toFixed(3) : ''
}

function evaluationStatus(evaluation) {
  return evaluation?.cer?.characterErrorRate === 0 ? 'exact' : 'differences'
}

function winnerReasonLabel(reason) {
  return reason === 'lowest-cer' ? 'Lowest CER' : 'Highest confidence'
}
</script>
