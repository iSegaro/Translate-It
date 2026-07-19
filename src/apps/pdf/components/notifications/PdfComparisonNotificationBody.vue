<template>
  <div class="pdf-region-comparison-notification">
    <div class="pdf-region-comparison-notification__analysis">
      <span v-if="viewModel.title">{{ viewModel.title }}</span>
      <span v-for="item in viewModel.summary" :key="item.label">
        {{ item.label }} {{ item.value }}
      </span>
    </div>
    <table
      v-if="viewModel.rows.length"
      class="pdf-region-comparison-notification__results"
    >
      <thead>
        <tr>
          <th
            v-for="col in viewModel.columns"
            :key="col.id"
            scope="col"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in viewModel.rows"
          :key="rowIndex"
        >
          <td
            v-for="cell in row.cells"
            :key="cell.id"
            :class="{ 'pdf-region-comparison-notification__numeric': cell.numeric }"
          >
            <code v-if="cell.code">{{ cell.value }}</code>
            <template v-else>{{ cell.value }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <span
      v-if="viewModel.footer"
      class="pdf-region-comparison-notification__total"
    >
      {{ viewModel.footer }}
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import './PdfComparisonNotificationBody.scss'

const props = defineProps({
  payload: {
    type: Object,
    default: null
  }
})

const viewModel = computed(() => props.payload || { title: null, summary: [], columns: [], rows: [], footer: null })
</script>
