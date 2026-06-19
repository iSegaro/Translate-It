import { describe, expect, it } from 'vitest';
import {
  selectFinalizedCaptionLines,
  selectProjectedCaptionLines
} from './LiveCaptionCaptionTrackProjection.js';

describe('LiveCaptionCaptionTrackProjection', () => {
  const createCaptionLine = (overrides = {}) => ({
    sessionId: 'session-1',
    videoFingerprint: 'video-1',
    segmentStartMs: 100,
    segmentEndMs: 200,
    originalText: 'Hello',
    translatedText: 'سلام',
    isFinal: true,
    ...overrides
  });

  it('preserves current finalized fallback behavior when projected rendering is disabled', () => {
    const captionLines = [
      createCaptionLine({ segmentStartMs: 100, segmentEndMs: 200, translatedText: 'یک' }),
      createCaptionLine({ segmentStartMs: 300, segmentEndMs: 400, translatedText: 'دو' }),
      createCaptionLine({ segmentStartMs: 500, segmentEndMs: 600, translatedText: 'سه' })
    ];

    expect(selectFinalizedCaptionLines(captionLines, {
      currentTimeMs: 1000,
      mediaTimelineMappingStatus: 'invalid'
    })).toHaveLength(2);

    const staleMediaCaptionLines = [
      createCaptionLine({ segmentStartMs: 100, segmentEndMs: 200, mediaStartMs: 1000, mediaEndMs: 1200, translatedText: 'یک' }),
      createCaptionLine({ segmentStartMs: 300, segmentEndMs: 400, mediaStartMs: 4000, mediaEndMs: 4200, translatedText: 'دو' }),
      createCaptionLine({ segmentStartMs: 500, segmentEndMs: 600, mediaStartMs: 7000, mediaEndMs: 7200, translatedText: 'سه' })
    ];

    expect(selectFinalizedCaptionLines(staleMediaCaptionLines, {
      currentTimeMs: 3500,
      mediaTimelineMappingStatus: 'valid'
    })).toHaveLength(2);
    expect(selectFinalizedCaptionLines(staleMediaCaptionLines, {
      currentTimeMs: 3500,
      mediaTimelineMappingStatus: 'valid'
    }).map((line) => line.translatedText)).toEqual(['دو', 'سه']);
  });

  it('renders mapped projected captions when enabled', () => {
    const captionLines = [
      createCaptionLine({
        projectedMediaStartMs: 1000,
        projectedMediaEndMs: 2000,
        timelineProjectionStatus: 'mapped',
        timelineProjectionAnchorId: 'anchor-1'
      }),
      createCaptionLine({
        translatedText: 'دو',
        projectedMediaStartMs: 3000,
        projectedMediaEndMs: 4000,
        timelineProjectionStatus: 'mapped',
        timelineProjectionAnchorId: 'anchor-1'
      })
    ];

    expect(selectProjectedCaptionLines(captionLines, {
      enableProjectedTimelineRendering: true,
      videoElement: { currentTime: 1.5 },
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'valid'
    })).toHaveLength(1);
  });

  it.each([
    ['boundary_crossing', 'boundary_crossing'],
    ['unmapped', 'unmapped'],
    ['invalid', 'invalid']
  ])('ignores %s projected captions', (timelineProjectionStatus) => {
    const captionLines = [
      createCaptionLine({
        projectedMediaStartMs: 1000,
        projectedMediaEndMs: 2000,
        timelineProjectionStatus,
        timelineProjectionAnchorId: timelineProjectionStatus === 'mapped' ? 'anchor-1' : null
      })
    ];

    expect(selectProjectedCaptionLines(captionLines, {
      enableProjectedTimelineRendering: true,
      videoElement: { currentTime: 1.5 },
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'valid'
    })).toHaveLength(0);
  });

  it('ignores invalid projected timestamps', () => {
    const captionLines = [
      createCaptionLine({
        projectedMediaStartMs: 'NaN',
        projectedMediaEndMs: 2000,
        timelineProjectionStatus: 'mapped',
        timelineProjectionAnchorId: 'anchor-1'
      })
    ];

    expect(selectProjectedCaptionLines(captionLines, {
      enableProjectedTimelineRendering: true,
      videoElement: { currentTime: 1.5 },
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'valid'
    })).toHaveLength(0);
  });

  it('falls back to last 2 finalized captions when projected rendering has no visible captions', () => {
    const captionLines = [
      createCaptionLine({
        segmentStartMs: 100,
        segmentEndMs: 200,
        translatedText: 'یک'
      }),
      createCaptionLine({
        segmentStartMs: 300,
        segmentEndMs: 400,
        translatedText: 'دو'
      }),
      createCaptionLine({
        segmentStartMs: 500,
        segmentEndMs: 600,
        translatedText: 'سه'
      })
    ];

    const projectedLines = selectProjectedCaptionLines(captionLines, {
      enableProjectedTimelineRendering: true,
      videoElement: { currentTime: 1.5 },
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'valid'
    });

    expect(projectedLines).toHaveLength(0);
    expect(selectFinalizedCaptionLines(captionLines, {
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'invalid'
    })).toHaveLength(2);
  });

  it('excludes projected captions when session or video fingerprint mismatches context', () => {
    const captionLines = [
      createCaptionLine({
        sessionId: 'session-2',
        videoFingerprint: 'video-2',
        projectedMediaStartMs: 1000,
        projectedMediaEndMs: 2000,
        timelineProjectionStatus: 'mapped',
        timelineProjectionAnchorId: 'anchor-1'
      })
    ];

    expect(selectProjectedCaptionLines(captionLines, {
      enableProjectedTimelineRendering: true,
      videoElement: { currentTime: 1.5 },
      currentTimeMs: 1500,
      mediaTimelineMappingStatus: 'valid',
      timelineProjectionContext: {
        sessionId: 'session-1',
        videoFingerprint: 'video-1'
      }
    })).toHaveLength(0);
  });

  it('falls back instead of blanking captions when mapping is invalid', () => {
    const captionLines = [
      createCaptionLine({ translatedText: 'یک' }),
      createCaptionLine({ translatedText: 'دو', segmentStartMs: 300, segmentEndMs: 400 }),
      createCaptionLine({ translatedText: 'سه', segmentStartMs: 500, segmentEndMs: 600 })
    ];

    expect(selectFinalizedCaptionLines(captionLines, {
      currentTimeMs: 1000,
      mediaTimelineMappingStatus: 'invalid'
    })).toHaveLength(2);
  });
});
