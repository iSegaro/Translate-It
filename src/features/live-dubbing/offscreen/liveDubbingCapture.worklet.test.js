import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('live dubbing capture worklet input controls', () => {
  it('drops a partial frame on pause, acknowledges generation, and resumes cleanly', () => {
    let Processor;
    const messages = [];
    class AudioWorkletProcessor {
      constructor() {
        this.port = { postMessage: message => messages.push(message) };
      }
    }
    runInNewContext(readFileSync(`${process.cwd()}/src/features/live-dubbing/offscreen/liveDubbingCapture.worklet.js`, 'utf8'), {
      AudioWorkletProcessor,
      registerProcessor: (_name, processor) => { Processor = processor; },
      currentFrame: 10,
      currentTime: 1,
    });
    const processor = new Processor({ processorOptions: { sampleRate: 16_000, frameSamples: 4 } });
    processor.process([[new Float32Array([0.1, 0.2])]], [[]]);
    processor.port.onmessage({ data: { type: 'pause', generation: 5 } });
    expect(messages).toEqual([{ type: 'paused', generation: 5 }]);
    processor.process([[new Float32Array([0.3, 0.4, 0.5, 0.6])]], [[]]);
    expect(messages).toHaveLength(1);
    processor.port.onmessage({ data: { type: 'resume', generation: 6 } });
    expect(messages[1]).toEqual({ type: 'resumed', generation: 6 });
    processor.process([[new Float32Array([0.3, 0.4, 0.5, 0.6])]], [[]]);
    expect(messages[2]).toMatchObject({ type: 'pcm', generation: 6, sampleCount: 4, sourceSampleStart: 10 });
  });
});
