import { ref, reactive } from 'vue';
import { MessagingBus } from '@/shared/messaging/core/MessagingBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';

export function useSubtitleTranslation() {
  const jobId = ref(`job-${Date.now()}`);
  const status = ref('idle'); // idle, translating, completed, error
  const progress = reactive({
    percent: 0,
    processed: 0,
    total: 0,
    translated: 0,
    failed: 0,
    etaMs: 0,
    elapsedMs: 0
  });
  
  const translatedContent = ref('');
  const error = ref(null);
  const currentFile = ref(null);

  // Subscribe to background updates
  const unsubscribe = MessagingBus.subscribe(MessageContexts.SUBTITLE_TRANSLATION, (message) => {
    const { action, data } = message;

    if (!data || data.jobId !== jobId.value) return;

    switch (action) {
      case MessageActions.SUBTITLE_TRANSLATE_PROGRESS:
        Object.assign(progress, data.progress);
        status.value = 'translating';
        break;

      case MessageActions.SUBTITLE_TRANSLATE_COMPLETE:
        status.value = 'completed';
        translatedContent.value = data.content;
        Object.assign(progress, data.stats);
        break;

      case MessageActions.SUBTITLE_TRANSLATE_ERROR:
        status.value = 'error';
        error.value = data.error;
        break;
    }
  });

  const startTranslation = async (fileContent, filename, config) => {
    status.value = 'translating';
    error.value = null;
    translatedContent.value = '';
    
    // Reset progress
    Object.assign(progress, {
      percent: 0,
      processed: 0,
      total: 0,
      translated: 0,
      failed: 0,
      etaMs: 0,
      elapsedMs: 0
    });

    try {
      await MessagingBus.sendToBackground({
        context: MessageContexts.SUBTITLE_TRANSLATION,
        action: MessageActions.SUBTITLE_TRANSLATE,
        payload: {
          jobId: jobId.value,
          content: fileContent,
          filename,
          sourceLanguage: config.sourceLanguage,
          targetLanguage: config.targetLanguage,
          providerId: config.providerId,
          options: config.options
        }
      });
    } catch (err) {
      status.value = 'error';
      error.value = err.message;
    }
  };

  const cancelTranslation = () => {
    MessagingBus.sendToBackground({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_CANCEL,
      payload: { jobId: jobId.value }
    });
    status.value = 'idle';
  };

  const downloadResult = (filename) => {
    if (!translatedContent.value) return;

    const blob = new Blob([translatedContent.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Suggest a name: original_translated.srt
    const nameParts = filename.split('.');
    const ext = nameParts.pop();
    const newName = `${nameParts.join('.')}_translated.${ext}`;
    
    a.href = url;
    a.download = newName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    jobId,
    status,
    progress,
    error,
    currentFile,
    translatedContent,
    startTranslation,
    cancelTranslation,
    downloadResult,
    cleanup: unsubscribe
  };
}
