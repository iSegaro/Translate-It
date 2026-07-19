<template>
  <div class="pdf-region-comparison-notification">
    <div class="pdf-region-comparison-notification__analysis">
      <span v-if="analysis?.winner">Winner {{ analysis.winner.candidateId }} ({{ winnerReasonLabel(analysis.winner.reason) }})</span>
      <span v-if="analysis?.confidence?.highest !== null && analysis?.confidence?.highest !== undefined">
        Confidence {{ analysis.confidence.highest }}<template v-if="analysis.confidence.comparable && analysis.confidence.delta !== 0"> (+{{ analysis.confidence.delta }})</template>
      </span>
      <span>OCR Output {{ analysis?.output?.comparable ? (analysis.output.identical ? 'Identical' : 'Different') : 'Not comparable' }}</span>
    </div>
    <table class="pdf-region-comparison-notification__results">
      <thead>
        <tr>
          <th scope="col">
            Candidate
          </th>
          <th scope="col">
            Scale
          </th>
          <th scope="col">
            Lang
          </th>
          <th scope="col">
            Runtime
          </th>
          <th scope="col">
            Confidence
          </th>
          <th scope="col">
            CER
          </th>
          <th scope="col">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="result in results"
          :key="result.candidateId"
        >
          <td><code>{{ result.candidateId }}</code></td>
          <td class="pdf-region-comparison-notification__numeric">
            {{ result.configuration?.scale ?? '—' }}
          </td>
          <td>{{ result.configuration?.language || '—' }}</td>
          <td class="pdf-region-comparison-notification__numeric">
            {{ formatRuntime(result.runtime?.latencyMs) }}
          </td>
          <td class="pdf-region-comparison-notification__numeric">
            {{ formatConfidence(result.output?.data?.confidence) }}
          </td>
          <td class="pdf-region-comparison-notification__numeric">
            {{ formatCer(result.evaluation) || '—' }}
          </td>
          <td>{{ resultLabel(result) }}</td>
        </tr>
      </tbody>
    </table>
    <span
      v-if="Number.isFinite(payload?.totalElapsedMs)"
      class="pdf-region-comparison-notification__total"
    >
      Total {{ payload.totalElapsedMs }}ms
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import './PdfRegionComparisonNotificationBody.scss'

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

function formatRuntime(latencyMs) {
  return Number.isFinite(latencyMs) ? `${latencyMs}ms` : '—'
}

function formatConfidence(confidence) {
  return Number.isFinite(confidence) ? confidence : '—'
}

function resultLabel(result) {
  if (analysis.value?.winnerCandidateId === result.candidateId) return 'Winner'
  return result.output?.status === 'recognized' ? '✓' : result.output?.status || '—'
}

function winnerReasonLabel(reason) {
  return reason === 'lowest-cer' ? 'Lowest CER' : 'Highest confidence'
}
</script>
