import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { settings } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import { createRNNoiseNode } from '@/lib/rtc/rnnoise';

/**
 * Medidor de microfone das configurações.
 *
 * Abre uma captura própria, separada da chamada, de propósito: o teste tem de
 * funcionar fora de qualquer sala, e ligá-lo ao microfone da chamada faria
 * ajustar o volume no meio de uma conversa derrubar a sua voz.
 */
export function MicTest({ onPermissionGranted }: { onPermissionGranted(): void }) {
  const [testing, setTesting] = useState(false);
  const [listen, setListen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const cleanup = useRef<() => void>(null);
  const listenGainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const stop = () => {
    cleanup.current?.();
    cleanup.current = null;
    listenGainRef.current = null;
    ctxRef.current = null;
    setTesting(false);
    if (barRef.current) barRef.current.style.width = '0%';
  };

  const toggleListen = (checked: boolean) => {
    setListen(checked);
    if (listenGainRef.current && ctxRef.current) {
      listenGainRef.current.gain.setValueAtTime(checked ? 1 : 0, ctxRef.current.currentTime);
    }
  };

  const start = async () => {
    const { micId, echoCancellation, noiseSuppression, autoGainControl, rnnoise, speakerId } = settings();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation,
          noiseSuppression: rnnoise ? false : noiseSuppression,
          autoGainControl,
          ...(micId ? { deviceId: { exact: micId } } : {}),
        },
      });
    } catch (err) {
      toast(`Não consegui abrir o microfone: ${(err as Error).message}`);
      return;
    }

    // Agora que houve permissão, os nomes dos aparelhos aparecem.
    onPermissionGranted();
    setTesting(true);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: 48000 });
    } catch {
      ctx = new AudioContext();
    }
    ctxRef.current = ctx;

    if (speakerId && 'setSinkId' in ctx && typeof (ctx as any).setSinkId === 'function') {
      void (ctx as any).setSinkId(speakerId).catch(() => {});
    }

    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = settings().micGain;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    let rnnoiseNode: AudioWorkletNode | null = null;
    if (rnnoise) {
      rnnoiseNode = await createRNNoiseNode(ctx);
    }

    if (rnnoiseNode) {
      source.connect(rnnoiseNode);
      rnnoiseNode.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(analyser);

    // Retorno para escutar a própria voz
    const listenGain = ctx.createGain();
    listenGain.gain.value = listen ? 1 : 0;
    gain.connect(listenGain);
    listenGain.connect(ctx.destination);
    listenGainRef.current = listenGain;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v;
      const level = Math.min(1, sum / buffer.length / 90);
      if (barRef.current) barRef.current.style.width = `${level * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    cleanup.current = () => {
      cancelAnimationFrame(raf);
      if (rnnoiseNode) {
        try { rnnoiseNode.port.postMessage({ destroy: true }); } catch {}
        try { rnnoiseNode.disconnect(); } catch {}
      }
      try { listenGain.disconnect(); } catch {}
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={() => (testing ? stop() : void start())}>
          {testing ? <MicOff size={16} /> : <Mic size={16} />}
          {testing ? 'Parar teste' : 'Testar microfone'}
        </Button>

        <label className="inline-flex items-center gap-2 text-[13px] text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={listen}
            onChange={(e) => toggleListen(e.target.checked)}
            className="cursor-pointer accent-accent"
          />
          <Volume2 size={15} className="text-dim" />
          <span>Ouvir microfone (retorno)</span>
        </label>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-bg-4">
        <div ref={barRef} className="h-full w-0 rounded-full bg-green transition-[width] duration-75" />
      </div>
    </div>
  );
}
