import { useState } from 'react';
import { Activity, LogOut, Mic, MicOff, MonitorOff, MonitorUp, SlidersHorizontal } from 'lucide-react';
import { Glass } from '@/components/ui/Glass';
import { StatsDialog } from '@/components/overlays/StatsDialog';
import { voice } from '@/lib/rtc/engine';
import { keyLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useRoom } from '@/stores/room';
import { useSettings } from '@/stores/settings';
import { leaveVoice, toggleScreen } from '@/features/voice/actions';

interface ControlsProps {
  onOpenSettings(section: string): void;
}

/** A barra de controles da chamada: microfone, tela, qualidade, status, sair. */
export function Controls({ onOpenSettings }: ControlsProps) {
  useRoom((s) => s.tick);
  const micMode = useSettings((s) => s.micMode);
  const pttKey = useSettings((s) => s.pttKey);
  const [stats, setStats] = useState(false);

  const micOpen = voice.mic.isOpen();
  const sharing = voice.screen.active;

  const micLabel =
    micMode === 'ptt'
      ? voice.mic.enabled
        ? `Aperte ${keyLabel(pttKey)}`
        : 'Mudo'
      : micOpen
        ? 'Microfone'
        : 'Mudo';

  return (
    <>
      <Glass
        variant="pill"
        live
        refract
        className="mx-auto mb-3 flex w-fit items-center gap-1 px-2 py-1.5 shadow-(--shadow-lift)"
      >
        <ControlButton
          icon={micOpen ? <Mic size={18} /> : <MicOff size={18} />}
          label={micLabel}
          title="Microfone (M)"
          tone={micOpen ? 'on' : 'off'}
          onClick={() => voice.toggleMic()}
        />

        <ControlButton
          icon={sharing ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
          label={sharing ? 'Parar de transmitir' : 'Compartilhar tela'}
          title="Compartilhar tela (S)"
          tone={sharing ? 'live' : undefined}
          onClick={toggleScreen}
        />

        <ControlButton
          icon={<SlidersHorizontal size={18} />}
          label={voice.quality.preset.label}
          title="Qualidade da transmissão"
          onClick={() => onOpenSettings('transmissao')}
        />

        <ControlButton
          icon={<Activity size={18} />}
          label="Status"
          title="Status da conexão"
          onClick={() => setStats(true)}
        />

        <span className="mx-1 h-6 w-px bg-line" />

        <ControlButton
          icon={<LogOut size={18} />}
          label="Sair"
          title="Sair da sala"
          tone="danger"
          onClick={() => void leaveVoice()}
        />
      </Glass>

      <StatsDialog open={stats} onClose={() => setStats(false)} />
    </>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone?: 'on' | 'off' | 'live' | 'danger';
  onClick(): void;
}

const TONES: Record<string, string> = {
  on: 'text-green',
  off: 'text-red',
  live: 'bg-accent text-accent-fg hover:brightness-110',
  danger: 'text-red hover:bg-red hover:text-white',
};

function ControlButton({ icon, label, title, tone, onClick }: ControlButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-pill)] px-3.5 py-2 text-[13px] font-medium',
        'text-text transition-[background-color,color,transform] duration-(--duration-fast)',
        'ease-(--ease-glass) hover:bg-hover active:scale-95',
        tone && TONES[tone],
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
