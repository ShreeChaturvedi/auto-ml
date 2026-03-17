/**
 * AudioWorklet processor that converts Float32 audio samples to PCM16 Int16Array
 * and posts them to the main thread for WebSocket transmission.
 */
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0]; // mono channel
    if (!input) return true;

    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      pcm16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
