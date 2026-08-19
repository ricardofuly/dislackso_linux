import { useEffect } from 'react';
import { motion } from 'motion/react';
import { GlassFilters } from '@/components/ui/Glass';
import { Toaster } from '@/components/ui/Toaster';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Gate } from '@/components/gate/Gate';
import { Shell } from '@/components/layout/Shell';
import { AnnouncementDialog } from '@/components/overlays/AnnouncementDialog';
import { ScreenPickerDialog } from '@/components/overlays/ScreenPickerDialog';
import { InviteCatcher } from '@/components/overlays/InviteCatcher';
import { UpdateCheckModal } from '@/components/settings/UpdateCheckModal';
import { useSession } from '@/stores/session';
import { useUpdateAnnounce } from '@/stores/updateAnnounce';
import { startConnection } from './connection';
import { useAutoUpdateCheck } from '@/hooks/useUpdater';
import { useEngineBridge } from './useEngineBridge';
import { useDesktopServerOverride } from './useDesktopServerOverride';
import { useScreenPickerBridge } from './useScreenPickerBridge';

/**
 * A raiz do app.
 *
 * Três estados, e só três: carregando (o loading do `index.html` ainda na
 * tela), tela de entrada, ou o app inteiro. Tudo o que é global — avisos,
 * dicas, filtros de vidro — mora aqui e em nenhum outro lugar.
 */
export function App() {
  const phase = useSession((s) => s.phase);
  const ready = useDesktopServerOverride();
  const updateOpen = useUpdateAnnounce((s) => s.open);
  const hideUpdate = useUpdateAnnounce((s) => s.hide);

  useEngineBridge();
  useAutoUpdateCheck();
  useScreenPickerBridge();

  useEffect(() => {
    if (ready) startConnection();
  }, [ready]);

  // Some com o loading do HTML assim que sabemos o que mostrar no lugar.
  useEffect(() => {
    if (phase === 'booting') return;
    const boot = document.getElementById('boot');
    boot?.classList.add('boot-done');
    const timer = setTimeout(() => boot?.remove(), 320);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <TooltipProvider delayDuration={350}>
      <GlassFilters />

      {/*
        A troca entre entrada e app é uma remoção direta, sem AnimatePresence.

        Aqui a falha custa caro demais: se a saída da tela de entrada não se
        completa, ela fica presa por cima — visível, cobrindo o app e engolindo
        todo clique. Trocar direto não tem esse modo de falha, e quem entra
        continua vendo o app surgir pela animação de entrada do próprio Shell.
      */}
      {phase === 'gate' && (
        <div className="fixed inset-0 z-40">
          <Gate />
        </div>
      )}

      {phase === 'ready' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="h-full"
        >
          <Shell />
        </motion.div>
      )}

      <AnnouncementDialog />
      <ScreenPickerDialog />
      <InviteCatcher />
      <UpdateCheckModal open={updateOpen} onClose={hideUpdate} />
      <Toaster />
    </TooltipProvider>
  );
}
