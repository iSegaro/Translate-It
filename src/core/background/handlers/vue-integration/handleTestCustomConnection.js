// Handler for Custom Test Connection from Vue apps.
//
// Runs probeCustomConnection in the background service worker so capability
// writes land in the same module instance CustomProvider reads. The Options
// page is a separate JS runtime; probing there would leave the background
// cache untouched. Narrowly scoped: exact caller-supplied values in, semantic
// report out. Never Test Key semantics, never storage reads/writes, never
// settings mutation.
import { probeCustomConnection } from '@/features/translation/providers/CustomConnectionProbe.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

function toProbeString(value) {
  return typeof value === 'string' ? value : '';
}

export async function handleTestCustomConnection(message) {
  const config = message?.data?.config;
  const values = config && typeof config === 'object' ? config : {};

  try {
    const report = await probeCustomConnection({
      apiUrl: toProbeString(values.apiUrl),
      apiModel: toProbeString(values.apiModel),
      apiKey: toProbeString(values.apiKey),
    });
    return { success: true, data: { report } };
  } catch (error) {
    const errorResponse = MessageFormat.createErrorResponse(
      error,
      message?.messageId || null,
      { context: 'custom-connection-test' },
    );
    return { ...errorResponse, data: { success: false } };
  }
}
