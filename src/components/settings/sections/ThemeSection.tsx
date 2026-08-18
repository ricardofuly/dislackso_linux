import { Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SettingRow, Swatches } from '../SettingRow';
import { LabeledSlider } from './VoiceSection';
import { ACCENTS, THEMES, useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';

/** Tema, cor de destaque, arredondamento e transparência do vidro. */
export function ThemeSection() {
  const s = useSettings();

  return (
    <>
      <SettingRow title="Tema" desc="A base de cores do app." stack>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => s.set('theme', theme.id)}
              className={cn(
                'overflow-hidden rounded-[var(--radius-md)] ring-1 transition-all',
                'duration-(--duration-fast) hover:scale-[1.02]',
                s.theme === theme.id ? 'ring-2 ring-accent' : 'ring-line',
              )}
            >
              <span className="flex h-12">
                {theme.colors.map((color) => (
                  <i key={color} className="flex-1" style={{ background: color }} />
                ))}
              </span>
              <span className="flex items-center justify-center gap-1 bg-bg-3 py-1.5 text-[12px] text-text">
                {s.theme === theme.id && <Check size={13} className="text-accent" />}
                {theme.name}
              </span>
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow title="Cor de destaque" desc="Botões, seleção e realces." stack>
        <div className="flex items-center gap-3">
          <Swatches colors={ACCENTS} value={s.accent} onPick={(color) => s.set('accent', color)} />
          <input
            type="color"
            title="Cor personalizada"
            value={s.accent}
            onChange={(e) => s.set('accent', e.target.value)}
            className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
        </div>
      </SettingRow>

      <SettingRow title="Cantos arredondados" desc="De quadrado a bem redondo." stack>
        <LabeledSlider
          value={s.radius}
          min={0}
          max={2}
          step={0.1}
          label="Cantos arredondados"
          format={(v) => (v === 0 ? 'reto' : `${Math.round(v * 100)}%`)}
          onChange={(value) => s.set('radius', value)}
        />
      </SettingRow>

      <SettingRow
        title="Transparência"
        desc="Quanto as superfícies de vidro deixam passar. Precisa de aceleração de hardware."
        stack
      >
        <LabeledSlider
          value={s.glass}
          min={0.35}
          max={1}
          step={0.01}
          label="Transparência do vidro"
          format={(v) => `${Math.round((1 - v) * 100)}% transparente`}
          onChange={(value) => s.set('glass', value)}
        />
      </SettingRow>

      <SettingRow title="Recomeçar" desc="Volta tema, cor e cantos ao original.">
        <Button
          onClick={() => s.patch({ theme: 'escuro', accent: '#5865f2', radius: 1, glass: 0.74 })}
        >
          <RefreshCw size={16} /> Restaurar aparência padrão
        </Button>
      </SettingRow>
    </>
  );
}
