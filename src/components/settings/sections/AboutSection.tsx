import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SettingRow } from '../SettingRow';
import { APP_VERSION } from '@/lib/env';
import { desktop, isDesktop, type DesktopInfo } from '@/lib/platform';
import { voice } from '@/lib/rtc/engine';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

const BLURB = [
  'DiSlackso — servidores privados, tela compartilhada e anotação ao vivo.',
  '',
  'A mídia vai direto entre os participantes (WebRTC). O servidor só',
  'apresenta as pessoas e guarda servidores, convites e perfis.',
  '',
];

/** O que é o app, em que versão está, e o botão de restaurar tudo. */
export function AboutSection() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const reset = useSettings((s) => s.reset);

  useEffect(() => {
    if (isDesktop()) void desktop()?.info().then(setInfo);
  }, []);

  const footer = info
    ? `versão ${info.version} · Electron ${info.electron} · Chromium ${info.chrome}`
    : `versão ${APP_VERSION} · rodando no navegador`;

  return (
    <>
      <pre className="selectable rounded-[var(--radius-sm)] bg-field p-4 font-mono text-[12px]
                      leading-relaxed whitespace-pre-wrap text-text">
        {[...BLURB, footer].join('\n')}
      </pre>

      <SettingRow title="Recomeçar" desc="Volta tudo desta tela ao padrão de fábrica.">
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
          <RefreshCw size={16} /> Restaurar todas as configurações
        </Button>
      </SettingRow>

      <Modal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restaurar configurações"
        description="Tema, atalhos, dispositivos e qualidade voltam ao padrão. Seus servidores e perfil não são afetados."
        confirmLabel="Restaurar"
        danger
        onConfirm={() => {
          reset();
          voice.setQuality(useSettings.getState().quality);
          toast('Configurações restauradas.');
        }}
      />
    </>
  );
}
