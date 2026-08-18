import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Mic, MicOff, MonitorOff, Pen } from 'lucide-react';
import { Glass } from '@/components/ui/Glass';
import { IconButton } from '@/components/ui/Button';
import { annot } from '@/lib/annot/engine';
import { voice } from '@/lib/rtc/engine';
import { useRoom } from '@/stores/room';

/**
 * O painel flutuante de quem está transmitindo.
 *
 * Existe porque, ao compartilhar a tela, a janela do app costuma ficar atrás
 * do que se está mostrando — e sem isto não haveria como mutar o microfone ou
 * parar a transmissão sem procurar o app de volta.
 */
export function ShareHud() {
  useRoom((s) => s.tick);
  const [collapsed, setCollapsed] = useState(false);

  if (!voice.screen.active) return null;

  const micOpen = voice.mic.isOpen();
  const previewHidden = voice.screen.previewHidden;

  return (
    <Glass
      as={motion.div}
      variant="pill"
      live
      refract
      drag
      dragMomentum={false}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute top-4 right-4 z-20 flex cursor-grab items-center gap-1 px-2 py-1.5
                 shadow-(--shadow-lift) active:cursor-grabbing"
    >
      <IconButton
        label={collapsed ? 'Expandir' : 'Minimizar'}
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </IconButton>

      {!collapsed && (
        <>
          <span className="px-1 text-[12px] font-medium text-dim">Você está transmitindo</span>

          <IconButton
            label="Microfone (M)"
            active={micOpen}
            onClick={() => voice.toggleMic()}
            className={micOpen ? 'text-green' : 'text-red'}
          >
            {micOpen ? <Mic size={16} /> : <MicOff size={16} />}
          </IconButton>

          <IconButton
            label="Rabiscar na própria tela (P)"
            active={annot.isActive('local')}
            onClick={() => annot.setActive(annot.isActive('local') ? null : 'local')}
          >
            <Pen size={16} />
          </IconButton>

          <IconButton
            label="Ocultar prévia de quem não está assistindo (economiza recurso)"
            active={previewHidden}
            onClick={() => voice.screen.setPreviewHidden(!previewHidden)}
          >
            {previewHidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>

          <IconButton
            label="Parar de transmitir"
            className="text-red hover:bg-red hover:text-white"
            onClick={() => voice.screen.stop()}
          >
            <MonitorOff size={16} />
          </IconButton>
        </>
      )}
    </Glass>
  );
}
