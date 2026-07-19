import PdfComparisonNotificationBody from './PdfComparisonNotificationBody.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

export function resolvePdfNotificationBody(type) {
  if (type === PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS) {
    return PdfComparisonNotificationBody
  }

  return null
}
