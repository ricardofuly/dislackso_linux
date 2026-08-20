import { Toggle } from '@/components/ui/Toggle';
import { SettingNote, SettingRow, Select, Swatches } from '../SettingRow';
import { LabeledSlider } from './VoiceSection';
import { ANNOT_COLORS } from '@/lib/annot/palette';
import { annot } from '@/lib/annot/engine';
import { voice } from '@/lib/rtc/engine';
import { useSettings } from '@/stores/settings';
import { desktop } from '@/lib/platform';

const FADE_OPTIONS = [
  { value: 0, label: 'Nunca — só apagando' },
  { value: 4, label: '4 segundos' },
  { value: 8, label: '8 segundos' },
  { value: 15, label: '15 segundos' },
  { value: 30, label: '30 segundos' },
];

const POSITION_OPTIONS = [
  { value: 'top-right', label: 'Topo Direito' },
  { value: 'top-left', label: 'Topo Esquerdo' },
  { value: 'top-center', label: 'Centro Topo' },
  { value: 'bottom-center', label: 'Centro Baixo' },
];

/** Quem pode rabiscar na minha tela, e com que cara a minha caneta começa. */
export function AnnotationsSection() {
  const s = useSettings();

  return (
    <>
      <SettingNote>
        Qualquer pessoa na sala pode rabiscar sobre a tela de quem está transmitindo, como no Slack.
        Os traços aparecem para todos.
      </SettingNote>

      <SettingRow
        title="Deixar rabiscarem na minha tela"
        desc="Se desligar, ninguém consegue desenhar sobre a sua transmissão."
      >
        <Toggle
          label="Deixar rabiscarem na minha tela"
          checked={s.annotAllow}
          onChange={(value) => {
            s.set('annotAllow', value);
            voice.publishState();
          }}
        />
      </SettingRow>

      <SettingRow
        title="Posição da barra no desktop"
        desc="Onde a barra flutuante de ferramentas deve aparecer na tela durante a transmissão."
      >
        <Select
          value={s.overlayPosition}
          options={POSITION_OPTIONS}
          onChange={(value) => {
            s.set('overlayPosition', value as 'top-right' | 'top-left' | 'top-center' | 'bottom-center');
            void desktop()?.overlay.setPosition(value as string);
          }}
        />
      </SettingRow>

      <SettingRow title="Sumir depois de" desc="Tempo até o traço desaparecer sozinho.">
        <Select
          value={s.annotFade}
          options={FADE_OPTIONS}
          onChange={(value) => {
            s.set('annotFade', Number(value));
            void desktop()?.overlay.setFade(Number(value));
          }}
        />
      </SettingRow>

      <SettingRow title="Cor padrão" desc="Com que cor sua caneta começa." stack>
        <Swatches
          colors={ANNOT_COLORS}
          value={s.annotColor}
          onPick={(color) => {
            s.set('annotColor', color);
            annot.setColor(color);
          }}
        />
      </SettingRow>

      <SettingRow title="Espessura" desc="Grossura do traço." stack>
        <LabeledSlider
          value={s.annotSize}
          min={2}
          max={12}
          step={1}
          label="Espessura do traço"
          format={(v) => `${v} px`}
          onChange={(value) => {
            s.set('annotSize', value);
            annot.size = value;
          }}
        />
      </SettingRow>
    </>
  );
}
