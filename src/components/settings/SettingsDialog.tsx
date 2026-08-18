import { motion } from 'motion/react';
import {
  Headphones, Image, Info, Monitor, MonitorUp, Palette, Pen, RefreshCw, Sparkles, User, X,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { IconButton } from '@/components/ui/Button';
import { isDesktop } from '@/lib/platform';
import { cn } from '@/lib/cn';
import { AccountSection } from './sections/AccountSection';
import { ProfileSection } from './sections/ProfileSection';
import { VoiceSection } from './sections/VoiceSection';
import { BroadcastSection } from './sections/BroadcastSection';
import { AnnotationsSection } from './sections/AnnotationsSection';
import { ThemeSection } from './sections/ThemeSection';
import { MotionSection } from './sections/MotionSection';
import { AppSection } from './sections/AppSection';
import { UpdatesSection } from './sections/UpdatesSection';
import { AboutSection } from './sections/AboutSection';

interface SectionDef {
  id: string;
  label: string;
  icon: typeof User;
  render(): React.ReactNode;
  desktopOnly?: boolean;
}

const GROUPS: { label: string; items: SectionDef[] }[] = [
  {
    label: 'Usuário',
    items: [
      { id: 'conta', label: 'Minha conta', icon: User, render: () => <AccountSection /> },
      { id: 'perfil', label: 'Perfil', icon: Image, render: () => <ProfileSection /> },
    ],
  },
  {
    label: 'Aplicativo',
    items: [
      { id: 'voz', label: 'Voz e vídeo', icon: Headphones, render: () => <VoiceSection /> },
      { id: 'transmissao', label: 'Transmissão', icon: MonitorUp, render: () => <BroadcastSection /> },
      { id: 'anotacoes', label: 'Anotações', icon: Pen, render: () => <AnnotationsSection /> },
    ],
  },
  {
    label: 'Aparência',
    items: [
      { id: 'aparencia', label: 'Tema e cores', icon: Palette, render: () => <ThemeSection /> },
      { id: 'animacoes', label: 'Animações', icon: Sparkles, render: () => <MotionSection /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'app', label: 'Aplicativo', icon: Monitor, render: () => <AppSection />, desktopOnly: true },
      { id: 'atualizacoes', label: 'Atualizações', icon: RefreshCw, render: () => <UpdatesSection />, desktopOnly: true },
      { id: 'sobre', label: 'Sobre', icon: Info, render: () => <AboutSection /> },
    ],
  },
];

interface SettingsDialogProps {
  section: string | null;
  onNavigate(section: string): void;
  onClose(): void;
}

/**
 * A tela de configurações, em tela cheia.
 *
 * Cada seção é um componente próprio em `sections/`. O que mora aqui é só a
 * navegação — assim adicionar uma preferência nova nunca significa mexer
 * neste arquivo.
 */
export function SettingsDialog({ section, onNavigate, onClose }: SettingsDialogProps) {
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.desktopOnly || isDesktop()),
  })).filter((group) => group.items.length > 0);

  const current = groups.flatMap((g) => g.items).find((item) => item.id === section);

  return (
    <Dialog.Root open={Boolean(section)} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-veil fixed inset-0 z-50 bg-bg-0/80" />
        <Dialog.Content className="anim-lift fixed inset-0 z-50 flex outline-none">
          <Dialog.Title className="sr-only">Configurações</Dialog.Title>
          <Dialog.Description className="sr-only">
            Preferências de conta, áudio, transmissão e aparência.
          </Dialog.Description>

          <nav className="w-56 shrink-0 space-y-0.5 overflow-y-auto bg-bg-1 p-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-dim uppercase">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    active={item.id === section}
                    onSelect={() => onNavigate(item.id)}
                  />
                ))}
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto bg-bg-2">
            <div className="mx-auto max-w-2xl px-8 py-10">
              {/*
                A `key` remonta o bloco a cada seção, e com isso a animação de
                entrada roda de novo. Sem AnimatePresence de propósito: a seção
                antiga sai na hora, e não há animação de saída que possa
                emperrar e deixar o conteúdo velho na tela.
              */}
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <h2 className="mb-6 text-xl font-semibold text-bright">{current?.label}</h2>
                {current?.render()}
              </motion.div>
            </div>
          </div>

          <Dialog.Close asChild>
            <IconButton label="Fechar (Esc)" className="absolute top-4 right-4 size-10">
              <X size={20} />
            </IconButton>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface NavItemProps {
  item: SectionDef;
  active: boolean;
  onSelect(): void;
}

function NavItem({ item, active, onSelect }: NavItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px]',
        'transition-colors duration-(--duration-fast)',
        active ? 'bg-active text-bright' : 'text-dim hover:bg-hover hover:text-text',
      )}
    >
      <Icon size={16} className="shrink-0" />
      {item.label}
    </button>
  );
}
