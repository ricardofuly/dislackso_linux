import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { settings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

/**
 * Medidor de microfone das configurações.
 *
 * Abre uma captura própria, separada da chamada, de propósito: o teste tem de
 * funcionar fora de qualquer sala, e ligá-lo ao microfone da chamada faria
 * ajustar o volume no meio de uma conversa derrubar a sua voz.
 */
export function MicTest({ onPermissionGranted }: { onPermissionGranted(): void }) {
  const [testing, setTesting] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const cleanup = useRef<() => void>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const stop = () => {
    cleanup.current?.();
    cleanup.current = null;
    setTesting(false);
    if (barRef.current) barRef.current.style.width = '0%';
  };

  const start = async () => {
    const { micId, echoCancellation, noiseSuppression, autoGainControl } = settings();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation,
          noiseSuppression,
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

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);

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
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    };
  };

  return (
    <div className="space-y-2">
      <Button onClick={() => (testing ? stop() : void start())}>
        {testing ? <MicOff size={16} /> : <Mic size={16} />}
        {testing ? 'Parar teste' : 'Testar microfone'}
      </Button>
      <div className="h-2 overflow-hidden rounded-full bg-bg-4">
        <div ref={barRef} className="h-full w-0 rounded-full bg-green transition-[width] duration-75" />
      </div>
    </div>
  );
}
