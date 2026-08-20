import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Highlighter,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Palette,
  Pen,
  PenOff,
  Trash2,
} from 'lucide-react';
import { Glass } from '@/components/ui/Glass';
import { IconButton } from '@/components/ui/Button';
import { annot } from '@/lib/annot/engine';
import { voice } from '@/lib/rtc/engine';
import { useRoom } from '@/stores/room';
import { useSettings } from '@/stores/settings';
import { isDesktop, desktop } from '@/lib/platform';
import { ANNOT_COLORS, ANNOT_TOOLS } from '@/lib/annot/palette';
import { cn } from '@/lib/cn';
import type { AnnotTool } from '@/types/api';

const TOOL_ICONS: Record<AnnotTool, typeof Pen> = {
  caneta: Pen,
  marcador: Highlighter,
  seta: ArrowUpRight,
};

const STROKE_SIZES = [
  { size: 2, label: 'Fino (2px)' },
  { size: 4, label: 'Médio (4px)' },
  { size: 8, label: 'Grosso (8px)' },
];

/**
 * O painel flutuante de quem está transmitindo com menu integrado de ferramentas de desenho.
 */
export function ShareHud() {
  useRoom((s) => s.tick);
  const annotAllow = useSettings((s) => s.annotAllow);
  const overlayToolbarVisible = useSettings((s) => s.overlayToolbarVisible);
  const setSetting = useSettings((s) => s.set);
  const [collapsed, setCollapsed] = useState(false);
  const [showTools, setShowTools] = useState(false);

  if (!voice.screen.active) return null;

  const micOpen = voice.mic.isOpen();
  const previewHidden = voice.screen.previewHidden;
  const isDrawing = annot.isActive('local');

  const toggleAnnotAllow = () => {
    const next = !annotAllow;
    setSetting('annotAllow', next);
    voice.publishState();
    if (!next) {
      annot.clear('local');
    }
  };

  const toggleDrawingMode = () => {
    const next = !isDrawing;
    annot.setActive(next ? 'local' : null);
    if (next) setShowTools(true);
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* Barra principal flutuante */}
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
        className="flex cursor-grab items-center gap-1 px-2 py-1.5 shadow-(--shadow-lift) active:cursor-grabbing"
      >
        <IconButton
          label={collapsed ? 'Expandir painel' : 'Minimizar painel'}
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
              active={isDrawing}
              onClick={toggleDrawingMode}
              className={isDrawing ? 'text-accent' : ''}
            >
              <Pen size={16} />
            </IconButton>

            <IconButton
              label={showTools ? 'Ocultar ferramentas de desenho' : 'Abrir ferramentas de desenho'}
              active={showTools}
              onClick={() => setShowTools((v) => !v)}
              className={showTools ? 'text-accent' : ''}
            >
              <Palette size={16} />
            </IconButton>

            <IconButton
              label={annotAllow ? 'Bloquear desenhos de outros (Anti-Grief)' : 'Permitir desenhos de outros'}
              active={annotAllow}
              onClick={toggleAnnotAllow}
              className={annotAllow ? 'text-green' : 'text-yellow'}
            >
              {annotAllow ? <Pen size={16} /> : <PenOff size={16} />}
            </IconButton>

            <IconButton
              label="Limpar todos os desenhos da tela"
              onClick={() => annot.clear('local')}
              className="hover:text-red"
            >
              <Trash2 size={16} />
            </IconButton>

            {isDesktop() && (
              <IconButton
                label={overlayToolbarVisible ? 'Ocultar barra do desktop' : 'Reativar barra no desktop'}
                active={overlayToolbarVisible}
                onClick={() => {
                  const next = !overlayToolbarVisible;
                  setSetting('overlayToolbarVisible', next);
                  if (next) void desktop()?.overlay.showToolbar();
                  else void desktop()?.overlay.hideToolbar();
                }}
                className={overlayToolbarVisible ? 'text-accent' : 'text-dim'}
              >
                <Monitor size={16} />
              </IconButton>
            )}

            <IconButton
              label="Ocultar prévia de quem não está assistindo"
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

      {/* Menu flutuante de ferramentas de desenho da própria tela (com opção de ocultar) */}
      <AnimatePresence>
        {!collapsed && showTools && (
          <Glass
            as={motion.div}
            variant="panel"
            live
            refract
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-bg-1/90 px-3 py-2 shadow-(--shadow-lift)"
          >
            {/* Seletor de Ferramentas */}
            <div className="flex items-center gap-1">
              {ANNOT_TOOLS.map(({ id, label }) => {
                const Icon = TOOL_ICONS[id];
                return (
                  <IconButton
                    key={id}
                    label={label}
                    active={annot.tool === id}
                    onClick={() => {
                      annot.setTool(id);
                      if (!isDrawing) annot.setActive('local');
                    }}
                  >
                    <Icon size={16} />
                  </IconButton>
                );
              })}
            </div>

            <span className="h-5 w-px bg-line" />

            {/* Seletor de Cores */}
            <div className="flex items-center gap-1.5">
              {ANNOT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Cor ${color}`}
                  onClick={() => {
                    annot.setColor(color);
                    setSetting('annotColor', color);
                    if (!isDrawing) annot.setActive('local');
                  }}
                  style={{ background: color }}
                  className={cn(
                    'size-5 rounded-full transition-transform duration-(--duration-fast) hover:scale-115',
                    annot.color === color && 'ring-2 ring-bright ring-offset-2 ring-offset-bg-2',
                  )}
                />
              ))}
            </div>

            <span className="h-5 w-px bg-line" />

            {/* Espessura do traço */}
            <div className="flex items-center gap-1 text-[11px] font-medium text-dim">
              {STROKE_SIZES.map(({ size, label }) => (
                <button
                  key={size}
                  type="button"
                  title={label}
                  onClick={() => {
                    annot.size = size;
                    setSetting('annotSize', size);
                    if (!isDrawing) annot.setActive('local');
                  }}
                  className={cn(
                    'grid size-6 place-items-center rounded-[var(--radius-xs)] transition-colors',
                    annot.size === size
                      ? 'bg-accent text-accent-fg font-semibold'
                      : 'hover:bg-hover hover:text-text',
                  )}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: size, height: size }}
                  />
                </button>
              ))}
            </div>

            <span className="h-5 w-px bg-line" />

            {/* Botão de ocultar/fechar o menu de desenho */}
            <IconButton
              label="Ocultar ferramentas"
              onClick={() => setShowTools(false)}
              className="text-dim hover:text-bright"
            >
              <ChevronUp size={15} />
            </IconButton>
          </Glass>
        )}
      </AnimatePresence>
    </div>
  );
}
