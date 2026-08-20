import { useMemo } from 'react';
import { desktop, isDesktop } from '@/lib/platform';

interface TextSegment {
  type: 'text' | 'link';
  content: string;
  url?: string;
}

// Regex combinada para e-mails (com ou sem mailto:), URLs http/https/www, e domínios comuns
const COMBINED_REGEX_SRC = '(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})|(?:https?:\\/\\/|www\\.)[^\\s<]+|[a-zA-Z0-9][-a-zA-Z0-9]*\\.(?:com(?:\\.br)?|org|net|gov|edu|io|dev|app|gg|tv|me|co|ai|xyz|tech|link|online|site|space|top|info|live|cloud|store|shop|blog)(?:\\/[^\\s<]*)?';

/**
 * Tokeniza o texto dividindo entre trechos normais, links clicáveis e e-mails.
 * Trata pontuações finais para não incluir pontos/vírgulas/parênteses indevidos no link.
 */
export function tokenizeLinks(text: string): TextSegment[] {
  if (!text) return [];

  const regex = new RegExp(COMBINED_REGEX_SRC, 'gi');
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const emailGroup = match[1];
    const offset = match.index;

    if (offset > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, offset) });
    }

    if (emailGroup) {
      // E-mail identificado
      let email = emailGroup;
      let stripCount = 0;
      for (let i = email.length - 1; i >= 0; i--) {
        const char = email[i];
        if (!char) break;
        if (',.!?:;'.includes(char)) {
          stripCount++;
        } else {
          break;
        }
      }

      let trailing = '';
      if (stripCount > 0) {
        trailing = email.slice(email.length - stripCount);
        email = email.slice(0, email.length - stripCount);
      }

      segments.push({ type: 'link', content: email, url: `mailto:${email}` });
      if (trailing) {
        segments.push({ type: 'text', content: trailing });
      }
    } else {
      // URL tradicional ou domínio
      let rawUrl = raw;
      let stripCount = 0;
      for (let i = rawUrl.length - 1; i >= 0; i--) {
        const char = rawUrl[i];
        if (!char) break;
        if (',.!?:;'.includes(char)) {
          stripCount++;
        } else if (char === ')' && (rawUrl.slice(0, i).split('(').length - 1) < (rawUrl.slice(0, i + 1).split(')').length - 1)) {
          stripCount++;
        } else if (char === ']' && (rawUrl.slice(0, i).split('[').length - 1) < (rawUrl.slice(0, i + 1).split(']').length - 1)) {
          stripCount++;
        } else {
          break;
        }
      }

      let trailing = '';
      if (stripCount > 0) {
        trailing = rawUrl.slice(rawUrl.length - stripCount);
        rawUrl = rawUrl.slice(0, rawUrl.length - stripCount);
      }

      let href = rawUrl;
      if (!/^https?:\/\//i.test(href)) {
        href = 'https://' + href;
      }

      segments.push({ type: 'link', content: rawUrl, url: href });
      if (trailing) {
        segments.push({ type: 'text', content: trailing });
      }
    }

    lastIndex = offset + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

interface FormattedTextProps {
  text: string;
  className?: string;
}

/**
 * Renderiza texto com links e e-mails clicáveis seguros.
 * No Electron, aciona desktop.openExternal para abrir no navegador ou cliente de e-mail padrão.
 */
export function FormattedText({ text, className }: FormattedTextProps) {
  const segments = useMemo(() => tokenizeLinks(text), [text]);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDesktop() && desktop()?.openExternal) {
      void desktop()?.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <p className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'link' && seg.url) {
          const url = seg.url;
          return (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
              className="break-all font-medium cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => handleLinkClick(e, url)}
            >
              {seg.content}
            </a>
          );
        }
        return <span key={idx}>{seg.content}</span>;
      })}
    </p>
  );
}
