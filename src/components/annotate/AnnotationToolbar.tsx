import { motion } from 'motion/react';
import { ArrowUpRight, Highlighter, Pen, Trash2, X } from 'lucide-react';
import { Glass } from '@/components/ui/Glass';
import { IconButton } from '@/components/ui/Button';
import { annot } from '@/lib/annot/engine';
import { ANNOT_COLORS, ANNOT_TOOLS } from '@/lib/annot/palette';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';
import type { AnnotTool } from '@/types/api';

const TOOL_ICON: Record<AnnotTool, typeof Pen> = {
  caneta: Pen,
  marcador: Highlighter,
  seta: ArrowUpRight,
};

/** A barrinha de ferramentas que aparece sobre a tela em que estou rabiscando. */
export function AnnotationToolbar({ targetId }: { targetId: string }) {
  const setColor = useSettings((s) => s.set);

  return (
    <Glass
      as={motion.div}
      variant="pill"
      live
      refract
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 px-2 py-1.5"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      {ANNOT_TOOLS.map(({ id, label }) => {
        const Icon = TOOL_ICON[id];
        return (
          <IconButton
            key={id}
            label={label}
            active={annot.tool === id}
            onClick={() => annot.setTool(id)}
          >
            <Icon size={16} />
          </IconButton>
        );
      })}

      <span className="mx-1 h-5 w-px bg-line" />

      {ANNOT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          onClick={() => {
            annot.setColor(color);
            setColor('annotColor', color);
          }}
          style={{ background: color }}
          className={cn(
            'size-5 rounded-full transition-transform duration-(--duration-fast)',
            'hover:scale-115',
            annot.color === color && 'ring-2 ring-bright ring-offset-2 ring-offset-bg-2',
          )}
        />
      ))}

      <span className="mx-1 h-5 w-px bg-line" />

      <IconButton label="Apagar tudo" onClick={() => annot.clear(targetId)}>
        <Trash2 size={16} />
      </IconButton>
      <IconButton label="Sair do modo caneta" onClick={() => annot.setActive(null)}>
        <X size={16} />
      </IconButton>
    </Glass>
  );
}
