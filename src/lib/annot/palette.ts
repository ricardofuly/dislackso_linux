import type { AnnotTool } from '@/types/api';

/** As cores da barrinha de rabisco. Legíveis sobre qualquer tela compartilhada. */
export const ANNOT_COLORS = [
  '#ff3b5c', '#ffd166', '#4ade80', '#38bdf8', '#c084fc', '#ffffff',
] as const;

export const ANNOT_TOOLS: { id: AnnotTool; label: string }[] = [
  { id: 'caneta', label: 'Caneta' },
  { id: 'marcador', label: 'Marcador' },
  { id: 'seta', label: 'Seta' },
];
