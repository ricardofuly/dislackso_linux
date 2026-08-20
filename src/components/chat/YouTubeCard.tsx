import { useEffect, useState, memo } from 'react';
import { Play, ExternalLink, Video } from 'lucide-react';
import { desktop, isDesktop } from '@/lib/platform';

// Regex para extrair ID de vídeos do YouTube (watch, youtu.be, shorts, embed)
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const YOUTUBE_CLEAN_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)[^"&?\/\s]{11}(?:[^\s]*)/gi;

export function extractYouTubeVideoId(text: string): string | null {
  if (!text) return null;
  const match = text.match(YOUTUBE_REGEX);
  return match && match[1] ? match[1] : null;
}

/**
 * Remove os links do YouTube do texto para deixar apenas a mensagem escrita pelo usuário quando houver o card.
 */
export function removeYouTubeLinks(text: string): string {
  if (!text) return '';
  return text.replace(YOUTUBE_CLEAN_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

interface YouTubeMeta {
  title: string;
  authorName: string;
  authorUrl?: string;
  thumbnailUrl: string;
}

// Cache local em memória para evitar requisições repetidas aos mesmos vídeos
const metaCache = new Map<string, YouTubeMeta>();

interface YouTubeCardProps {
  videoId: string;
}

export const YouTubeCard = memo(function YouTubeCard({ videoId }: YouTubeCardProps) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const [meta, setMeta] = useState<YouTubeMeta>(() => {
    return (
      metaCache.get(videoId) ?? {
        title: 'Vídeo do YouTube',
        authorName: 'YouTube',
        thumbnailUrl: defaultThumbnail,
      }
    );
  });

  useEffect(() => {
    let active = true;

    if (metaCache.has(videoId)) {
      setMeta(metaCache.get(videoId)!);
      return;
    }

    async function loadMeta() {
      try {
        const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const fetched: YouTubeMeta = {
          title: data.title || 'Vídeo do YouTube',
          authorName: data.author_name || 'YouTube',
          authorUrl: data.author_url,
          thumbnailUrl: data.thumbnail_url || defaultThumbnail,
        };

        metaCache.set(videoId, fetched);
        if (active) {
          setMeta(fetched);
        }
      } catch {
        // Se a requisição falhar (ex: offline ou 404), mantém os fallbacks funcionais
      }
    }

    void loadMeta();

    return () => {
      active = false;
    };
  }, [videoId, defaultThumbnail]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDesktop() && desktop()?.openExternal) {
      void desktop()?.openExternal(watchUrl);
    } else {
      window.open(watchUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => e.key === 'Enter' && handleOpen(e as unknown as React.MouseEvent)}
      className="group mt-2 flex w-full max-w-[460px] cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-bg-1 p-3 text-left shadow-(--shadow-soft) transition-all duration-(--duration-fast) hover:border-line-strong hover:bg-bg-2"
    >
      {/* Cabeçalho com Nome do Canal e Provedor */}
      <div className="flex items-center justify-between gap-2 pb-2 text-[12px] text-dim">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-text">
          <span className="grid size-4 place-items-center rounded-full bg-red/15 text-red">
            <Video size={11} className="text-red" />
          </span>
          <span className="truncate font-semibold text-bright">{meta.authorName}</span>
          <span className="opacity-60">• YouTube</span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] opacity-70 group-hover:opacity-100 group-hover:text-accent transition-opacity">
          <span>Abrir</span>
          <ExternalLink size={12} />
        </span>
      </div>

      {/* Título do Vídeo */}
      <p className="line-clamp-2 pb-2.5 text-[13.5px] font-medium leading-snug text-bright group-hover:text-accent transition-colors">
        {meta.title}
      </p>

      {/* Thumbnail com Botão de Play integrado */}
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-sm)] bg-black/60">
        <img
          src={meta.thumbnailUrl}
          alt={meta.title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {/* Overlay translúcido suave */}
        <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />

        {/* Botão de Play vermelho centralizado */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 grid size-12 place-items-center rounded-full bg-red text-white shadow-xl transition-transform duration-200 group-hover:scale-110 group-hover:bg-red-deep">
          <Play size={20} className="ml-0.5 fill-white" />
        </div>
      </div>
    </div>
  );
});
