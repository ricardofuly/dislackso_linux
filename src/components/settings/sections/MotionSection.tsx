import { Toggle } from '@/components/ui/Toggle';
import { SettingNote, SettingRow } from '../SettingRow';
import { LabeledSlider } from './VoiceSection';
import { isDesktop } from '@/lib/platform';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

/** Ligar/desligar animações, ajustar a velocidade e a aceleração de hardware. */
export function MotionSection() {
  const s = useSettings();

  return (
    <>
      <SettingRow
        title="Animações"
        desc="Desligado, tudo continua funcionando — só aparece na hora, sem transição."
      >
        <Toggle
          label="Animações"
          checked={s.motion === 'on'}
          onChange={(value) => s.set('motion', value ? 'on' : 'off')}
        />
      </SettingRow>

      {s.motion === 'on' && (
        <SettingRow
          title="Velocidade"
          desc="Menor é mais rápido e discreto; maior é mais suave."
          stack
        >
          <LabeledSlider
            value={s.motionSpeed}
            min={0.5}
            max={1.8}
            step={0.1}
            label="Velocidade das animações"
            format={(v) => (v < 0.9 ? 'rápida' : v > 1.3 ? 'suave' : 'normal')}
            onChange={(value) => s.set('motionSpeed', value)}
          />
        </SettingRow>
      )}

      <SettingRow
        title="Aceleração de hardware"
        desc="Usa a placa de vídeo para o desfoque do vidro e as transições. Desligue se o app estiver pesado."
      >
        <Toggle
          label="Aceleração de hardware"
          checked={s.gpu === 'on'}
          onChange={(value) => {
            s.set('gpu', value ? 'on' : 'off');
            if (isDesktop()) {
              toast('Para valer também na janela do app, ajuste na tela inicial e reinicie.');
            }
          }}
        />
      </SettingRow>

      <SettingNote>
        Se o seu sistema estiver configurado para “reduzir movimento”, o app respeita isso
        automaticamente — a menos que você ligue as animações aqui de propósito.
      </SettingNote>
    </>
  );
}
