import { SubtitleParserFactory } from '../parsers/SubtitleParserFactory.js';
import { SubtitleBatchPlanner } from './SubtitleBatchPlanner.js';
import { SubtitleProviderLimitsResolver } from './SubtitleProviderLimitsResolver.js';
import { SubtitleValidationService } from './SubtitleValidationService.js';
import { SubtitleProgressTracker } from './SubtitleProgressTracker.js';
import { SubtitleContextBuilder } from './SubtitleContextBuilder.js';
import { subtitleTextProtector } from '../formatting/SubtitleTextProtector.js';
import { SUBTITLE_PROMPT_TEMPLATES } from '../prompts/subtitlePrompt.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessagingBus } from '@/shared/messaging/core/MessagingBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'SubtitleCoordinator');

/**
 * Subtitle Translation Coordinator - Orchestrates the full subtitle translation pipeline.
 */
export class SubtitleTranslationCoordinator {
  constructor() {
    this.activeJobs = new Map();
  }

  /**
   * Starts a new subtitle translation job.
   */
  async startJob(payload) {
    const { 
      jobId, 
      content, 
      filename, 
      sourceLanguage, 
      targetLanguage, 
      providerId,
      options = {} 
    } = payload;

    logger.info(`Starting subtitle job ${jobId} for ${filename} using ${providerId}`);

    try {
      // 1. Parse
      const adapter = SubtitleParserFactory.getAdapter(filename);
      const { cues, metadata, warnings } = adapter.parse(content);
      
      if (cues.length === 0) throw new Error('No valid subtitle cues found in file.');

      const progressTracker = new SubtitleProgressTracker(cues.length);
      this.activeJobs.set(jobId, { cues, progressTracker, adapter, status: 'running' });

      // 2. Resolve Limits
      const limits = SubtitleProviderLimitsResolver.resolve(providerId);
      
      // 3. Plan Batches
      const batches = SubtitleBatchPlanner.plan(cues, limits);
      logger.info(`Planned ${batches.length} batches for ${cues.length} cues.`);

      // 4. Process Batches
      for (let i = 0; i < batches.length; i++) {
        // Check for cancellation
        const job = this.activeJobs.get(jobId);
        if (!job || job.status === 'cancelled') break;

        const batch = batches[i];
        await this._processBatch(jobId, batch, sourceLanguage, targetLanguage, providerId, options);
        
        // Notify progress
        this._notifyProgress(jobId);
      }

      // 5. Complete
      this._notifyComplete(jobId);

    } catch (error) {
      logger.error(`Subtitle job ${jobId} failed:`, error);
      this._notifyError(jobId, error.message);
    }
  }

  /**
   * Processes a single batch of cues.
   * @private
   */
  async _processBatch(jobId, batch, sourceLanguage, targetLanguage, providerId, options) {
    const job = this.activeJobs.get(jobId);
    const tokenRegistry = new Map();
    
    // 1. Protect & Prepare Payload
    const translationItems = batch.map(cue => {
      const { text: protectedText, tokens } = subtitleTextProtector.protect(cue.text);
      tokenRegistry.set(cue.id, tokens);
      
      return {
        id: cue.id,
        text: protectedText,
        // Optional context for AI
        context: options.useContext ? SubtitleContextBuilder.formatContextString(
          SubtitleContextBuilder.buildContext(cue.index - 1, job.cues)
        ) : null
      };
    });

    try {
      // 2. Request Translation via Unified Service
      // If we are in the background context (which we should be), call the service directly
      // to avoid messaging overhead and potential "No response" errors.
      const message = MessageFormat.create(MessageActions.BATCH_TRANSLATE, {
        items: translationItems,
        sourceLanguage,
        targetLanguage,
        providerId,
        mode: TranslationMode.Subtitle,
        promptTemplate: SUBTITLE_PROMPT_TEMPLATES.SYSTEM,
        instruction: SUBTITLE_PROMPT_TEMPLATES.BATCH_INSTRUCTION
      }, MessageContexts.TRANSLATION_SERVICE);

      const response = await unifiedTranslationService.handleTranslationRequest(message, { internal: true });

      if (!response.success) throw new Error(response.error || 'Translation failed');

      // 3. Validate & Restore
      const { validatedCues, errors } = SubtitleValidationService.validateAndRestore(
        batch, 
        response.results, 
        tokenRegistry
      );

      // 4. Update Progress
      job.progressTracker.update(validatedCues);
      
    } catch (error) {
      logger.error(`Batch processing failed for job ${jobId}:`, error);
      batch.forEach(cue => { cue.status = 'failed'; cue.warnings.push(error.message); });
      job.progressTracker.update(batch);
    }
  }

  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = 'cancelled';
      logger.info(`Subtitle job ${jobId} cancelled.`);
    }
  }

  _notifyProgress(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_PROGRESS,
      payload: {
        jobId,
        progress: job.progressTracker.getProgress()
      }
    });
  }

  _notifyComplete(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // Serialize final content
    const translatedContent = job.adapter.serialize(job.cues);

    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_COMPLETE,
      payload: {
        jobId,
        content: translatedContent,
        stats: job.progressTracker.getProgress()
      }
    });

    this.activeJobs.delete(jobId);
  }

  _notifyError(jobId, error) {
    MessagingBus.broadcast({
      context: MessageContexts.SUBTITLE_TRANSLATION,
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      payload: { jobId, error }
    });
    this.activeJobs.delete(jobId);
  }
}

export const subtitleTranslationCoordinator = new SubtitleTranslationCoordinator();
