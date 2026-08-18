import { useState } from 'react';
import { Toggle, Slider } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { SettingNote, SettingRow, Select } from '../SettingRow';
import { MicTest } from '../MicTest';
import { useAudioDevices } from '../useAudioDevices';
import { voice } from '@/lib/rtc/engine';
import { formatShortcut, captureShortcut } from '@/lib/format';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

const CAN_PICK_OUTPUT =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Microfone, saída de áudio, apertar-para-falar e os filtros de captura. */
export function VoiceSection() {
  const s = useSettings();
  const { inputs, outputs, refresh, labelsHidden } = useAudioDevices();

  return (
    <>
      {labelsHidden && (
        <SettingNote>
          O navegador esconde o nome dos aparelhos até você permitir o microfone uma vez.
          Clique em “Testar microfone” abaixo.
        </SettingNote>
      )}

      <SettingRow title="Microfone" desc="De onde vem a sua voz.">
        <Select
          value={s.micId}
          options={[
            { value: '', label: 'Padrão do sistema' },
            ...inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Microfone ${i + 1}` })),
          ]}
          onChange={(value) => {
            s.set('micId', value);
            void voice.setMicDevice();
          }}
        />
      </SettingRow>

      <SettingRow
        title="Saída de áudio"
        desc={
          CAN_PICK_OUTPUT
            ? 'Onde você ouve os outros.'
            : 'Seu navegador não permite escolher a saída — use o padrão do sistema.'
        }
      >
        <Select
          value={s.speakerId}
          disabled={!CAN_PICK_OUTPUT}
          options={[
            { value: '', label: 'Padrão do sistema' },
            ...outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Saída ${i + 1}` })),
          ]}
          onChange={(value) => s.set('speakerId', value)}
        />
      </SettingRow>

      <SettingRow title="Nível de entrada" desc="Fale e veja a barra mexer." stack>
        <MicTest onPermissionGranted={refresh} />
      </SettingRow>

      <SettingRow title="Volume de entrada" desc="Se sua voz sai baixa, aumente aqui." stack>
        <LabeledSlider
          value={s.micGain}
          min={0}
          max={3}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(value) => {
            s.set('micGain', value);
            voice.mic.setGain(value);
          }}
          label="Volume de entrada"
        />
      </SettingRow>

      <SettingRow
        title="Modo do microfone"
        desc="Apertar para falar só funciona com a janela do app em foco."
      >
        <Select
          value={s.micMode}
          options={[
            { value: 'voz', label: 'Voz aberta' },
            { value: 'ptt', label: 'Apertar para falar' },
          ]}
          onChange={(value) => {
            s.set('micMode', value as 'voz' | 'ptt');
            voice.mic.sync();
          }}
        />
      </SettingRow>

      {s.micMode === 'ptt' && <PttKeyRow />}

      {(
        [
          ['rnnoise', 'Supressão de ruído RNNoise (IA)', 'Reduz ruídos de fundo (teclado, cliques, ventilador) com rede neural em tempo real.'],
          ['echoCancellation', 'Cancelamento de eco', 'Evita que o som da caixa volte pelo microfone.'],
          ['noiseSuppression', 'Redução de ruído padrão', 'Corta ventilador, teclado e chiado básico do navegador.'],
          ['autoGainControl', 'Volume automático', 'O navegador equaliza o volume da sua voz.'],
        ] as const
      ).map(([key, title, desc]) => (
        <SettingRow key={key} title={title} desc={desc}>
          <Toggle
            label={title}
            checked={s[key]}
            onChange={(value) => {
              s.set(key, value);
              void voice.setMicDevice();
              toast('Aplicado ao microfone.');
            }}
          />
        </SettingRow>
      ))}

      <SettingRow
        title="Sons de feedback"
        desc="Um toque curto ao entrar ou sair de sala e ao iniciar ou parar uma transmissão."
      >
        <Toggle
          label="Sons de feedback"
          checked={s.feedbackSounds}
          onChange={(value) => s.set('feedbackSounds', value)}
        />
      </SettingRow>
    </>
  );
}

/** Captura a próxima tecla pressionada e a grava como atalho de falar. */
function PttKeyRow() {
  const pttKey = useSettings((s) => s.pttKey);
  const set = useSettings((s) => s.set);
  const [listening, setListening] = useState(false);

  const capture = () => {
    setListening(true);
    const grab = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListening(false);
        window.removeEventListener('keydown', grab, true);
        return;
      }
      const captured = captureShortcut(e);
      if (!captured) return;

      set('pttKey', captured);
      setListening(false);
      window.removeEventListener('keydown', grab, true);
    };
    window.addEventListener('keydown', grab, true);
  };

  return (
    <SettingRow title="Tecla de falar" desc="Clique e aperte a tecla desejada.">
      <Button
        variant={listening ? 'primary' : 'soft'}
        className={listening ? 'animate-pulse' : ''}
        onClick={capture}
      >
        {listening ? 'Pressione uma tecla…' : formatShortcut(pttKey)}
      </Button>
    </SettingRow>
  );
}

interface LabeledSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  format(value: number): string;
  onChange(value: number): void;
}

/** Deslizante com o valor legível ao lado — usado em várias seções. */
export function LabeledSlider({ value, format, label, ...rest }: LabeledSliderProps) {
  return (
    <div className="flex items-center gap-4">
      <Slider value={value} label={label} {...rest} />
      <span className="w-24 shrink-0 text-right text-[12px] text-dim">{format(value)}</span>
    </div>
  );
}
