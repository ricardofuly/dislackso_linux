import { assetUrl } from '@/lib/env';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PublicUser } from '@/types/api';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-20 text-2xl',
};

interface AvatarProps {
  user: Pick<PublicUser, 'name' | 'avatar' | 'color'> | null | undefined;
  size?: Size;
  className?: string;
  /** Anel de "está falando" ao redor. */
  speaking?: boolean;
}

/**
 * A foto de alguém, ou as iniciais sobre a cor determinística dele.
 *
 * A cor vem do servidor (derivada do id), então a mesma pessoa tem sempre o
 * mesmo tom para todo mundo — é o que faz reconhecer quem é sem ler o nome.
 */
export function Avatar({ user, size = 'md', className, speaking }: AvatarProps) {
  const src = user?.avatar ? assetUrl(user.avatar) : '';

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full',
        'font-semibold text-white select-none',
        SIZES[size],
        speaking && 'ring-2 ring-green ring-offset-2 ring-offset-bg-2',
        'transition-shadow duration-(--duration-fast)',
        className,
      )}
      style={src ? undefined : { background: user?.color ?? 'var(--color-accent)' }}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        initials(user?.name)
      )}
    </span>
  );
}
