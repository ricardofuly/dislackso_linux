/**
 * rnnoise.ts — Gerenciador do RNNoise (AudioWorklet + WASM) no cliente
 */

let wasmBinaryCache: ArrayBuffer | null = null;
const workletRegistered = new WeakSet<AudioContext>();

export async function getRNNoiseWasmBinary(): Promise<ArrayBuffer | null> {
  if (wasmBinaryCache) return wasmBinaryCache;
  try {
    const wasmUrl = new URL('rnnoise/rnnoise.wasm', window.location.href).href;
    const res = await fetch(wasmUrl);
    if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status} ao carregar rnnoise.wasm`);
    wasmBinaryCache = await res.arrayBuffer();
    return wasmBinaryCache;
  } catch (err) {
    console.warn('[RNNoise] Falha ao carregar rnnoise.wasm:', err);
    return null;
  }
}

export async function createRNNoiseNode(ctx: AudioContext): Promise<AudioWorkletNode | null> {
  if (!ctx || !ctx.audioWorklet) return null;
  try {
    if (!workletRegistered.has(ctx)) {
      const processorUrl = new URL('rnnoise/rnnoise-processor.js', window.location.href).href;
      await ctx.audioWorklet.addModule(processorUrl);
      workletRegistered.add(ctx);
    }

    const wasmBinary = await getRNNoiseWasmBinary();
    const options: AudioWorkletNodeOptions = {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: wasmBinary ? { wasmBinary } : {},
    };

    return new AudioWorkletNode(ctx, 'rnnoise-processor', options);
  } catch (err) {
    console.warn('[RNNoise] Não foi possível instanciar AudioWorkletNode:', err);
    return null;
  }
}
