import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SettingRow } from '../SettingRow';
import { useSettings, DEFAULT_SETTINGS, type SettingsValues } from '@/stores/settings';
import { formatShortcut, captureShortcut } from '@/lib/format';
import { toast } from '@/stores/toasts';

interface KeybindItem {
  key: keyof Pick<SettingsValues, 'muteKey' | 'screenKey' | 'pttKey' | 'annotKey'>;
  title: string;
  desc: string;
}

const KEYBINDS: KeybindItem[] = [
  {
    key: 'muteKey',
    title: 'Mutar / Desmutar microfone',
    desc: 'Alterna o microfone aberto ou mudo durante uma chamada.',
  },
  {
    key: 'screenKey',
    title: 'Iniciar / Parar transmissão',
    desc: 'Abre o seletor ou encerra o compartilhamento de tela atual.',
  },
  {
    key: 'pttKey',
    title: 'Apertar para falar (PTT)',
    desc: 'Mantém o microfone aberto enquanto a tecla estiver pressionada (no modo PTT).',
  },
  {
    key: 'annotKey',
    title: 'Ativar / Desativar anotações',
    desc: 'Ativa ou recolhe a ferramenta de desenho sobre a transmissão em foco.',
  },
];

export function KeybindsSection() {
  const s = useSettings();
  const set = useSettings((state) => state.set);
  const [listeningKey, setListeningKey] = useState<string | null>(null);

  const startListening = (bindKey: KeybindItem['key']) => {
    setListeningKey(bindKey);

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListeningKey(null);
        window.removeEventListener('keydown', onKeyDown, true);
        return;
      }

      const captured = captureShortcut(e);
      if (!captured) return; // Modificador isolado, aguarda a tecla principal

      set(bindKey, captured);
      setListeningKey(null);
      window.removeEventListener('keydown', onKeyDown, true);
      toast('Atalho atualizado.');
    };

    window.addEventListener('keydown', onKeyDown, true);
  };

  const resetDefaults = () => {
    set('muteKey', DEFAULT_SETTINGS.muteKey);
    set('screenKey', DEFAULT_SETTINGS.screenKey);
    set('pttKey', DEFAULT_SETTINGS.pttKey);
    set('annotKey', DEFAULT_SETTINGS.annotKey);
    toast('Atalhos restaurados para o padrão.');
  };

  return (
    <>
      {KEYBINDS.map(({ key, title, desc }) => {
        const isRecording = listeningKey === key;
        const currentVal = s[key];

        return (
          <SettingRow key={key} title={title} desc={desc}>
            <Button
              variant={isRecording ? 'primary' : 'soft'}
              className={isRecording ? 'animate-pulse' : ''}
              onClick={() => startListening(key)}
            >
              {isRecording ? 'Pressione uma tecla…' : formatShortcut(currentVal)}
            </Button>
          </SettingRow>
        );
      })}

      <SettingRow
        title="Restaurar atalhos padrão"
        desc="Restaura todos os atalhos de teclado para suas configurações originais."
      >
        <Button variant="ghost" onClick={resetDefaults}>
          <RotateCcw size={16} />
          Restaurar padrões
        </Button>
      </SettingRow>
    </>
  );
}
