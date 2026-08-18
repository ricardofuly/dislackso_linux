/* ==========================================================================
   rnnoise-processor.js — AudioWorkletProcessor para supressão de ruído (RNNoise)
   --------------------------------------------------------------------------
   Processa o áudio em tempo real com RNNoise compilado em WebAssembly.
   RNNoise opera em blocos de 480 amostras (10ms @ 48kHz).
   AudioWorklet entrega 128 amostras por vez.
   Utiliza FIFOs circulares contínuos para eliminar artefatos, picotes e distorções.
   ========================================================================== */

const FRAME_SIZE = 480;

class AudioFIFO {
  constructor(capacity = 4096) {
    this.buffer = new Float32Array(capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
    this.capacity = capacity;
  }

  write(data) {
    const len = data.length;
    for (let i = 0; i < len; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.available += len;
  }

  read(out, count) {
    const toRead = Math.min(count, this.available);
    for (let i = 0; i < toRead; i++) {
      out[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }
    for (let i = toRead; i < count; i++) {
      out[i] = 0;
    }
    this.available -= toRead;
    return toRead;
  }

  reset() {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
  }
}

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.enabled = true;
    this.ready = false;
    this.destroyed = false;

    // FIFOs contínuos
    this.inputFIFO = new AudioFIFO(4096);
    this.outputFIFO = new AudioFIFO(4096);

    // Preenche a saída inicial com zeros para cobrir a latência de priming (480 amostras = 10ms)
    this.outputFIFO.write(new Float32Array(FRAME_SIZE));

    this.frameIn = new Float32Array(FRAME_SIZE);
    this.frameOut = new Float32Array(FRAME_SIZE);

    // WASM state
    this.wasmInstance = null;
    this.state = 0;
    this.heapPtr = 0;
    this.heapF32 = null;

    this.port.onmessage = (e) => {
      const data = e.data;
      if (!data) return;
      if (typeof data.enabled === 'boolean') {
        this.enabled = data.enabled;
        if (!this.enabled) {
          this.inputFIFO.reset();
          this.outputFIFO.reset();
          this.outputFIFO.write(new Float32Array(FRAME_SIZE));
        }
      }
      if (data.destroy) {
        this._cleanup();
      }
    };

    this._init(options && options.processorOptions);
  }

  async _init(opts) {
    try {
      const importObject = {
        env: {
          __assert_fail: () => {},
          emscripten_memcpy_big: (dest, src, n) => {
            new Uint8Array(this.wasmInstance.exports.memory.buffer).copyWithin(dest, src, src + n);
          },
          emscripten_resize_heap: () => 0,
        },
        wasi_snapshot_preview1: {
          fd_close: () => 0,
          fd_seek: () => 0,
          fd_write: () => 0,
          proc_exit: () => {},
        },
      };

      if (opts && opts.wasmBinary) {
        const res = await WebAssembly.instantiate(opts.wasmBinary, importObject);
        this.wasmInstance = res.instance || res;
      } else if (opts && opts.wasmModule) {
        this.wasmInstance = await WebAssembly.instantiate(opts.wasmModule, importObject);
      } else {
        const wasmUrl = (opts && opts.wasmUrl)
          ? opts.wasmUrl
          : new URL('rnnoise.wasm', import.meta.url).toString();
        const resp = await fetch(wasmUrl);
        const bytes = await resp.arrayBuffer();
        const res = await WebAssembly.instantiate(bytes, importObject);
        this.wasmInstance = res.instance || res;
      }

      const exports = this.wasmInstance.exports;
      if (exports.__wasm_call_ctors) exports.__wasm_call_ctors();

      this.state = exports.rnnoise_create(0);
      if (!this.state) {
        console.error('[RNNoiseProcessor] Falha ao instanciar DenoiseState');
        return;
      }

      const bytes = FRAME_SIZE * 4;
      this.heapPtr = exports.malloc(bytes);
      if (!this.heapPtr) {
        console.error('[RNNoiseProcessor] Falha ao alocar memória');
        return;
      }

      this.heapF32 = new Float32Array(exports.memory.buffer, this.heapPtr, FRAME_SIZE);
      this.ready = true;
    } catch (err) {
      console.error('[RNNoiseProcessor] Erro na inicialização do WASM:', err);
    }
  }

  _cleanup() {
    this.destroyed = true;
    if (this.wasmInstance && this.wasmInstance.exports) {
      const exp = this.wasmInstance.exports;
      if (this.heapPtr && exp.free) {
        try { exp.free(this.heapPtr); } catch {}
        this.heapPtr = 0;
      }
      if (this.state && exp.rnnoise_destroy) {
        try { exp.rnnoise_destroy(this.state); } catch {}
        this.state = 0;
      }
    }
    this.heapF32 = null;
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inData = input[0];
    const outData = output[0];
    const blockSize = inData.length;

    // Passthrough se desativado ou ainda não carregado
    if (!this.ready || !this.enabled) {
      outData.set(inData);
      return true;
    }

    // 1. Escreve o bloco de entrada no FIFO
    this.inputFIFO.write(inData);

    // 2. Processa todos os quadros completos de 480 amostras disponíveis
    while (this.inputFIFO.available >= FRAME_SIZE) {
      this.inputFIFO.read(this.frameIn, FRAME_SIZE);
      this._processFrame();
      this.outputFIFO.write(this.frameOut);
    }

    // 3. Lê exatamente o bloco necessário para a saída
    this.outputFIFO.read(outData, blockSize);

    return true;
  }

  _processFrame() {
    const exports = this.wasmInstance.exports;

    if (this.heapF32.buffer !== exports.memory.buffer) {
      this.heapF32 = new Float32Array(exports.memory.buffer, this.heapPtr, FRAME_SIZE);
    }

    // RNNoise opera em float PCM 16-bit [-32768, 32767] — aplicamos clamp para evitar clipping
    for (let i = 0; i < FRAME_SIZE; i++) {
      let s = this.frameIn[i] * 32767;
      if (s > 32767) s = 32767;
      else if (s < -32768) s = -32768;
      this.heapF32[i] = s;
    }

    const vad = exports.rnnoise_process_frame(this.state, this.heapPtr, this.heapPtr);

    // Converte de volta para float [-1.0, 1.0] com clamp seguro
    for (let i = 0; i < FRAME_SIZE; i++) {
      let s = this.heapF32[i] / 32767;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      this.frameOut[i] = s;
    }

    this.port.postMessage({ vad });
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
