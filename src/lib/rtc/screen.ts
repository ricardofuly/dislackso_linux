import { desktop, isDesktop } from '@/lib/platform';
import type { QualityPreset } from './quality';

export interface CaptureResult {
  stream: MediaStream;
  /** Avisos para mostrar ao usuário — sempre informativos, nunca fatais. */
  notices: string[];
}

function constraintsFor(q: QualityPreset): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: q.w },
      height: { ideal: q.h },
      frameRate: { ideal: q.fps },
    },
    audio: {
      channelCount: 2,
      sampleRate: 48000,
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
      restrictOwnAudio: true,
    },
    // Hints não padronizados; navegadores que não conhecem simplesmente ignoram.
    systemAudio: 'include',
    surfaceSwitching: 'include',
    selfBrowserSurface: 'exclude',
  } as MediaStreamConstraints;
}

/**
 * Pede a tela ao sistema, com três redes de segurança que existem porque cada
 * uma já foi um bug real em produção:
 *
 *  1. algumas versões do Chromium/Electron rejeitam os hints novos — a
 *     segunda tentativa usa o pedido mínimo;
 *  2. no Windows, "Could not start audio source" é o driver recusando o
 *     loopback: repetimos a MESMA fonte já escolhida sem áudio, sem reabrir
 *     o seletor na cara do usuário;
 *  3. captura sem faixa de áudio nenhuma é normal, mas merece explicação —
 *     senão parece que o app quebrou.
 *
 * Devolve `null` quando o usuário cancelou ou não deu para capturar; o motivo
 * vai em `onError`.
 */
export async function captureScreen(
  q: QualityPreset,
  contentHint: string,
  onError: (message: string) => void,
): Promise<CaptureResult | null> {
  const constraints = constraintsFor(q);
  const notices: string[] = [];
  let captured: MediaStream | null = null;
  let error: Error | null = null;
  let audioDropped = false;

  try {
    captured = await navigator.mediaDevices.getDisplayMedia(constraints);
  } catch (err) {
    error = err as Error;

    if (error.name === 'TypeError' || error.name === 'OverconstrainedError') {
      try {
        captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (fallbackErr) {
        error = fallbackErr as Error;
      }
    }

    if (!captured && isDesktop() && /audio source|NotReadableError/i.test(`${error.name} ${error.message}`)) {
      const canRetry = await desktop()?.retryScreenShareWithoutAudio();
      if (canRetry) {
        try {
          captured = await navigator.mediaDevices.getDisplayMedia(constraints);
          audioDropped = true;
        } catch (retryErr) {
          error = retryErr as Error;
        }
      }
    }
  }

  if (!captured) {
    onError(
      error?.name === 'NotAllowedError'
        ? 'Compartilhamento cancelado ou bloqueado. Verifique a permissão de captura de tela do Windows.'
        : `Não foi possível capturar a tela: ${error?.message || error?.name || 'motivo desconhecido'}`,
    );
    return null;
  }

  const video = captured.getVideoTracks()[0];
  if (!video) {
    for (const track of captured.getTracks()) track.stop();
    onError('A fonte escolhida não entregou vídeo. Tente outra tela ou janela.');
    return null;
  }

  video.contentHint = contentHint;
  // No Electron a captura vem do desktopCapturer e ignora parte das
  // constraints iniciais; reforçamos aqui.
  void video
    .applyConstraints({
      width: { ideal: q.w },
      height: { ideal: q.h },
      frameRate: { ideal: q.fps },
    })
    .catch(() => {});

  for (const audio of captured.getAudioTracks()) audio.contentHint = 'music';

  if (audioDropped) {
    notices.push(
      'Compartilhando sem áudio do sistema — a captura com áudio falhou (driver de som). '
        + 'Vídeo funcionando normalmente.',
    );
  } else if (!captured.getAudioTracks().length) {
    notices.push(
      isDesktop()
        ? 'Tela sem áudio — o áudio do sistema só é capturado ao compartilhar uma tela inteira, com a opção marcada.'
        : 'Tela sem áudio. Marque "Compartilhar áudio da guia/sistema" na janela de seleção.',
    );
  }

  return { stream: captured, notices };
}
