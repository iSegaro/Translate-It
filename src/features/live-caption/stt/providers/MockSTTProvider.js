import {
  BaseSTTProvider,
  normalizeSTTResult,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES,
  createSTTProviderError
} from '../BaseSTTProvider.js';
import mockData from './mock-transcripts.json';

export const MOCK_STT_PROVIDER_ID = 'mock_stt';

/**
 * Mock STT Provider for development and testing.
 * Provides deterministic sequential transcription samples from mock-transcripts.json.
 * Bypasses network requests and API key requirements.
 */
export class MockSTTProvider extends BaseSTTProvider {
  static id = MOCK_STT_PROVIDER_ID;
  static displayName = 'Mock STT';
  static mode = 'batch';

  constructor(options = {}) {
    super(MOCK_STT_PROVIDER_ID, {
      providerName: 'Mock STT',
      retryLimit: options.retryLimit ?? 0
    });

    this.scenario = options.scenario || 'success'; // success, slow, empty, error
    this.currentIndex = 0;
    this.chunkCount = 0;
    
    // Simulate initial readiness
    this.state = STT_PROVIDER_STATUS.READY;
    this.lastUpdatedAt = Date.now();

    this.logger.info('Initialized mock STT provider', {
      scenario: this.scenario
    });
  }

  /**
   * Simulates transcription of an audio chunk.
   * Ignores actual audio content and returns sequential samples from the configured scenario.
   */
  async transcribeChunk(audioChunk, options = {}) {
    this.chunkCount++;
    const { sessionId, chunkStartMs, chunkEndMs } = options;

    this.logger.debug('Transcribing mock chunk', {
      scenario: this.scenario,
      chunkCount: this.chunkCount,
      sessionId
    });

    return await this.executeWithRetry(async () => {
      // 1. Simulate Latency
      let latency = 400 + Math.random() * 600;
      if (this.scenario === 'slow') {
        latency = 2000 + Math.random() * 1000;
      }
      
      await new Promise(resolve => setTimeout(resolve, latency));

      // 2. Handle Scenario Logic
      if (this.scenario === 'error') {
        throw createSTTProviderError(
          STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
          mockData.error?.message || 'Simulated mock error',
          {
            providerId: this.providerId,
            providerName: this.providerName,
            retryable: false
          }
        );
      }

      const samples = mockData[this.scenario] || mockData.success;
      
      if (this.scenario === 'empty' || !samples.length) {
        return this._buildMockResult('', options);
      }

      // 3. Select sequential sample (looping if necessary)
      const sampleText = samples[this.currentIndex % samples.length];
      this.currentIndex++;

      return this._buildMockResult(sampleText, options);
    }, {
      sessionId,
      videoFingerprint: options.videoFingerprint
    });
  }

  /**
   * Internal helper to build a normalized STT result.
   */
  _buildMockResult(text, options = {}) {
    const { chunkStartMs, chunkEndMs } = options;
    
    return normalizeSTTResult({
      text: text,
      startTime: chunkStartMs ?? null,
      endTime: chunkEndMs ?? null,
      isFinal: true,
      provider: this.providerId
    }, this.providerId);
  }

  async getStatus() {
    return this.createStatus({
      ready: this.state !== STT_PROVIDER_STATUS.ERROR && this.state !== STT_PROVIDER_STATUS.DISPOSED,
      retryCount: 0,
      details: {
        scenario: this.scenario,
        chunkCount: this.chunkCount,
        currentIndex: this.currentIndex
      }
    });
  }

  /**
   * Resets the sequential index and chunk counter.
   */
  reset() {
    this.currentIndex = 0;
    this.chunkCount = 0;
    this.logger.debug('Mock STT counters reset');
  }

  /**
   * Allows dynamic scenario switching for testing different flows.
   */
  setScenario(scenario) {
    if (mockData[scenario]) {
      this.scenario = scenario;
      this.logger.info('Mock STT scenario switched', {
        scenario
      });
    }
  }
}

export default MockSTTProvider;
