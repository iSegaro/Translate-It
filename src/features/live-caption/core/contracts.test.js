import { describe, it, expect } from 'vitest';
import {
  createLiveCaptionNotImplementedError,
  PageLiveCaptionSession,
  VideoCaptionSession,
  LiveCaptionSessionManager
} from './index.js';
import { BaseSTTProvider } from '../stt/BaseSTTProvider.js';
import { LiveCaptionCache } from '../cache/LiveCaptionCache.js';
import { LiveCaptionBackgroundController } from '../background/LiveCaptionBackgroundController.js';
import { LiveCaptionContentController } from '../content/LiveCaptionContentController.js';

describe('live-caption placeholder contracts', () => {
  it('creates a consistent not-implemented error', () => {
    const error = createLiveCaptionNotImplementedError('TestContract');
    expect(error.message).toBe('TestContract is not implemented yet');
    expect(error.code).toBe('LIVE_CAPTION_NOT_IMPLEMENTED');
  });

  it('throws for session placeholders', () => {
    expect(() => new PageLiveCaptionSession()).toThrow('PageLiveCaptionSession is not implemented yet');
    expect(() => new VideoCaptionSession()).toThrow('VideoCaptionSession is not implemented yet');
    expect(() => new LiveCaptionSessionManager()).toThrow('LiveCaptionSessionManager is not implemented yet');
  });

  it('throws for controller and cache placeholders', () => {
    expect(() => new LiveCaptionCache()).toThrow('LiveCaptionCache is not implemented yet');
    expect(() => new LiveCaptionBackgroundController()).toThrow('LiveCaptionBackgroundController is not implemented yet');
    expect(() => new LiveCaptionContentController()).toThrow('LiveCaptionContentController is not implemented yet');
  });

  it('keeps the STT base contract abstract', () => {
    expect(() => new BaseSTTProvider()).toThrow('BaseSTTProvider is not implemented yet');
  });
});
