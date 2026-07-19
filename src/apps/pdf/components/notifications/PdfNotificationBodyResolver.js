import PdfBenchmarkNotificationBody from './PdfBenchmarkNotificationBody.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

export function resolvePdfNotificationBody(type) {
  if (type === PDF_NOTIFICATION_BODY_TYPE.BENCHMARK_RESULTS) {
    return PdfBenchmarkNotificationBody
  }

  return null
}
