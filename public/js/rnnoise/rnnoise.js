/* ==========================================================================
   rnnoise.js — Gerenciador do RNNoise no cliente
   ========================================================================== */

'use strict';

const RNNoise = {
  wasmBinary: null,
  workletRegistered: new WeakSet(),

  /** Carrega o arquivo rnnoise.wasm se ainda não estiver em cache */
  async getWasmBinary() {
    if (this.wasmBinary) return this.wasmBinary;
    try {
      const res = await fetch('js/rnnoise/rnnoise.wasm');
      if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status} ao carregar rnnoise.wasm`);
      this.wasmBinary = await res.arrayBuffer();
      return this.wasmBinary;
    } catch (err) {
      console.warn('[RNNoise] Não foi possível carregar rnnoise.wasm:', err);
      return null;
    }
  },

  /**
   * Instancia um AudioWorkletNode do RNNoise para o AudioContext fornecido.
   * Retorna o nó criado ou null em caso de falha/desativação.
   */
  async createNode(ctx) {
    if (!ctx || !ctx.audioWorklet) return null;
    try {
      if (!this.workletRegistered.has(ctx)) {
        await ctx.audioWorklet.addModule('js/rnnoise/rnnoise-processor.js');
        this.workletRegistered.add(ctx);
      }

      const wasmBinary = await this.getWasmBinary();
      const options = {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: wasmBinary ? { wasmBinary } : {},
      };

      return new AudioWorkletNode(ctx, 'rnnoise-processor', options);
    } catch (err) {
      console.warn('[RNNoise] Falha ao criar AudioWorkletNode:', err);
      return null;
    }
  },
};
