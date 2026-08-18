import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GlassFilters } from '@/components/ui/Glass';
import { Toaster } from '@/components/ui/Toaster';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Gate } from '@/components/gate/Gate';
import { Shell } from '@/components/layout/Shell';
import { AnnouncementDialog } from '@/components/overlays/AnnouncementDialog';
import { InviteCatcher } from '@/components/overlays/InviteCatcher';
import { useSession } from '@/stores/session';
import { startConnection } from './connection';
import { useAutoUpdateCheck } from '@/hooks/useUpdater';
import { useEngineBridge } from './useEngineBridge';
import { useDesktopServerOverride } from './useDesktopServerOverride';

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

  useEngineBridge();
  useAutoUpdateCheck();

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
        Um filho só, trocado pela `key`. Com `mode="wait"` o AnimatePresence
        espera o anterior sair antes de montar o próximo — e para isso ele
        precisa enxergar UM elemento, não dois blocos condicionais lado a lado.
      */}
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'gate' ? (
          <motion.div
            key="gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40"
          >
            <Gate />
          </motion.div>
        ) : phase === 'ready' ? (
          <motion.div
            key="shell"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            <Shell />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnnouncementDialog />
      <InviteCatcher />
      <Toaster />
    </TooltipProvider>
  );
}
