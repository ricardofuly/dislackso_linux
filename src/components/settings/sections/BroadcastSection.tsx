import { Toggle } from '@/components/ui/Toggle';
import { SettingNote, SettingRow, Select } from '../SettingRow';
import { QUALITY_PRESETS } from '@/lib/rtc/quality';
import { voice } from '@/lib/rtc/engine';
import { useSettings } from '@/stores/settings';

/** Qualidade da transmissão e o que fazer quando alguém começa a compartilhar. */
export function BroadcastSection() {
  const s = useSettings();

  return (
    <>
      <SettingRow title="Qualidade" desc="Acima de 1080p60 exige CPU boa e upload sobrando.">
        <Select
          value={s.quality}
          options={Object.entries(QUALITY_PRESETS).map(([key, preset]) => ({
            value: key,
            label: `${preset.label} — até ${(preset.video / 1e6).toFixed(1)} Mbps`,
          }))}
          onChange={(value) => {
            s.set('quality', value);
            voice.setQuality(value);
          }}
        />
      </SettingRow>

      <SettingRow
        title="Prioridade"
        desc="Fluidez borra um pouco em movimento; nitidez mantém o texto legível e derruba FPS."
      >
        <Select
          value={s.contentHint}
          options={[
            { value: 'motion', label: 'Fluidez — jogos e vídeo' },
            { value: 'detail', label: 'Nitidez — código e texto' },
          ]}
          onChange={(value) => {
            s.set('contentHint', value as 'motion' | 'detail');
            voice.setContentHint(value);
          }}
        />
      </SettingRow>

      <SettingRow
        title="Abrir em destaque"
        desc="Quando alguém começa a transmitir, a tela dele ocupa o palco automaticamente."
      >
        <Toggle label="Abrir em destaque" checked={s.autoFocus} onChange={(v) => s.set('autoFocus', v)} />
      </SettingRow>

      <SettingRow title="Ver a própria tela" desc="Mostra uma prévia do que você está transmitindo.">
        <Toggle label="Ver a própria tela" checked={s.selfPreview} onChange={(v) => s.set('selfPreview', v)} />
      </SettingRow>

      <SettingRow
        title="Anti-retorno da call ao compartilhar áudio"
        desc={
          'O que fazer com a voz dos outros participantes enquanto você transmite com áudio do sistema. '
          + 'O app isola a chamada na captura e permite atenuar ou silenciar a call para isolamento total.'
        }
      >
        <Select
          value={
            typeof s.duckVoiceOnShare === 'boolean'
              ? s.duckVoiceOnShare
                ? 'duck25'
                : 'off'
              : s.duckVoiceOnShare || 'off'
          }
          options={[
            { value: 'off', label: 'Não alterar volume (Recomendado — isolamento automático)' },
            { value: 'duck50', label: 'Abaixar leve (50%)' },
            { value: 'duck25', label: 'Abaixar moderado (25%)' },
            { value: 'duck10', label: 'Abaixar bastante (10%)' },
            { value: 'mute', label: 'Silenciar chamada' },
          ]}
          onChange={(value) => s.set('duckVoiceOnShare', value)}
        />
      </SettingRow>

      <SettingNote>
        A transmissão é ponto a ponto: em 1080p60 para 3 amigos você envia cerca de 24 Mbps no total.
        Se a rede não aguentar, o app baixa a qualidade sozinho depois de alguns segundos — dá pra
        escolher de novo aqui a qualquer momento.
      </SettingNote>
    </>
  );
}
