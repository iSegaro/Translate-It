const PROCESSOR_NAME = 'pcm16-mono-streaming-processor';

function downmixFrameToMono(inputChannels) {
  if (!Array.isArray(inputChannels) || inputChannels.length === 0) {
    return new Float32Array(0);
  }

  const firstChannel = inputChannels[0];
  const frameCount = firstChannel?.length ?? 0;
  if (!frameCount) {
    return new Float32Array(0);
  }

  const mono = new Float32Array(frameCount);
  const channelCount = inputChannels.length;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let sum = 0;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      sum += inputChannels[channelIndex]?.[frameIndex] ?? 0;
    }

    mono[frameIndex] = sum / channelCount;
  }

  return mono;
}

const AudioWorkletProcessorBase = typeof AudioWorkletProcessor === 'function'
  ? AudioWorkletProcessor
  : class {
      constructor() {
        this.port = {
          postMessage() {}
        };
      }

      process() {
        return true;
      }
    };

class Pcm16MonoStreamingProcessor extends AudioWorkletProcessorBase {
  process(inputs) {
    const inputChannels = inputs?.[0] ?? [];
    const mono = downmixFrameToMono(inputChannels);

    if (mono.length > 0) {
      this.port.postMessage(
        {
          type: 'frame',
          samples: mono,
          sampleRate,
          channelCount: 1
        },
        [mono.buffer]
      );
    }

    return true;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(PROCESSOR_NAME, Pcm16MonoStreamingProcessor);
}

export { PROCESSOR_NAME, downmixFrameToMono, Pcm16MonoStreamingProcessor };
