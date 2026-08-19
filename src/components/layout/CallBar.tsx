import { useState } from 'react';
import {
  Activity, Ear, EarOff, LogOut, Mic, MicOff, MonitorOff, MonitorUp, SlidersHorizontal,
} from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { StatsDialog } from '@/components/overlays/StatsDialog';
import { voice } from '@/lib/rtc/engine';
import { cn } from '@/lib/cn';
import { useRoom } from '@/stores/room';
import { toast } from '@/stores/toasts';
import { leaveVoice, toggleScreen } from '@/features/voice/actions';

interface CallBarProps {
  onOpenSettings(section: string): void;
}

/**
 * Os controles da chamada, só em ícone — vivem junto do cartão da própria
 * conta, e não mais flutuando sobre o palco.
 *
 * Ficar aqui (e não em `Stage`) é o que faz mudo, ensurdecer e sair
 * continuarem alcançáveis mesmo com um canal de texto aberto por cima da
 * sala de voz, onde o palco não é a tela visível.
 */
export function CallBar({ onOpenSettings }: CallBarProps) {
  useRoom((s) => s.tick);
  const [stats, setStats] = useState(false);

  const micOpen = voice.mic.isOpen();
  const sharing = voice.screen.active;
  const deafened = voice.deafened;

  return (
    <div className="flex items-center justify-center gap-0.5 border-t border-line px-1 pt-1.5 pb-0.5">
      <IconButton
        label={micOpen ? 'Mutar (M)' : 'Ativar microfone (M)'}
        active={!micOpen}
        onClick={() => voice.toggleMic()}
        className={micOpen ? 'text-green' : 'text-red'}
      >
        {micOpen ? <Mic size={17} /> : <MicOff size={17} />}
      </IconButton>

      <IconButton
        label={deafened ? 'Reativar áudio' : 'Ensurdecer (mutar tudo)'}
        active={deafened}
        onClick={() => {
          const next = voice.toggleDeafen();
          toast(next ? 'Você ensurdeceu — não vai ouvir mais ninguém até desligar.' : 'Você voltou a ouvir.');
        }}
        className={deafened ? 'text-red' : undefined}
      >
        {deafened ? <EarOff size={17} /> : <Ear size={17} />}
      </IconButton>

      <IconButton
        label={sharing ? 'Parar de transmitir (S)' : 'Compartilhar tela (S)'}
        active={sharing}
        onClick={toggleScreen}
      >
        {sharing ? <MonitorOff size={17} /> : <MonitorUp size={17} />}
      </IconButton>

      <IconButton label={`Qualidade: ${voice.quality.preset.label}`} onClick={() => onOpenSettings('transmissao')}>
        <SlidersHorizontal size={17} />
      </IconButton>

      <IconButton label="Status da conexão" onClick={() => setStats(true)}>
        <Activity size={17} />
      </IconButton>

      <IconButton
        label="Sair da sala"
        onClick={() => void leaveVoice()}
        className={cn('text-red', 'hover:bg-red hover:text-white')}
      >
        <LogOut size={17} />
      </IconButton>

      <StatsDialog open={stats} onClose={() => setStats(false)} />
    </div>
  );
}
