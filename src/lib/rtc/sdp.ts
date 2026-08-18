/**
 * Ajustes finos de SDP e de encoder.
 *
 * O padrão do WebRTC é conservador demais para o que este app faz (tela em
 * alta resolução + voz em estéreo). Cada função aqui corrige um padrão que,
 * deixado como está, degrada a experiência de forma visível.
 */

/** Ordem de preferência de codec de vídeo — VP9 lê muito melhor texto e UI parada. */
const CODEC_ORDER = ['video/VP9', 'video/H264', 'video/AV1', 'video/VP8'];

/**
 * Reescreve os `fmtp` do Opus para estéreo real e bitrate alto. Sem isto o
 * navegador negocia mono com DTX, que corta o começo das palavras.
 */
export function tuneOpus(sdp: string, audioBitrate: number): string {
  const wanted: Record<string, string> = {
    stereo: '1',
    'sprop-stereo': '1',
    maxaveragebitrate: String(audioBitrate),
    maxplaybackrate: '48000',
    useinbandfec: '1',
    usedtx: '0',
  };

  let out = sdp;
  for (const match of [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000\/2/g)]) {
    const pt = match[1];
    if (!pt) continue;
    const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
    const existing = out.match(fmtpRe);

    if (existing?.[1]) {
      const params = new Map<string, string | undefined>();
      for (const pair of existing[1].split(';')) {
        const [k, v] = pair.split('=');
        if (k?.trim()) params.set(k.trim(), v);
      }
      for (const [k, v] of Object.entries(wanted)) params.set(k, v);
      const merged = [...params].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(';');
      out = out.replace(fmtpRe, `a=fmtp:${pt} ${merged}`);
    } else {
      const line = Object.entries(wanted).map(([k, v]) => `${k}=${v}`).join(';');
      out = out.replace(match[0], `${match[0]}\r\na=fmtp:${pt} ${line}`);
    }
  }
  return out;
}

export function preferCodecs(transceiver: RTCRtpTransceiver | undefined): void {
  if (typeof transceiver?.setCodecPreferences !== 'function') return;
  if (typeof RTCRtpReceiver?.getCapabilities !== 'function') return;
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps?.codecs) return;

  const rank = (c: RTCRtpCodec) => {
    const i = CODEC_ORDER.indexOf(c.mimeType);
    return i === -1 ? CODEC_ORDER.length : i;
  };
  try {
    transceiver.setCodecPreferences([...caps.codecs].sort((a, b) => rank(a) - rank(b)));
  } catch (err) {
    console.warn('[rtc] setCodecPreferences ignorado:', (err as Error).message);
  }
}

interface SenderTuning {
  bitrate: number;
  fps?: number;
  /**
   * `maintain-resolution` inverte o padrão do navegador: sob perda de banda
   * ele derruba o FPS e mantém a nitidez, em vez de borrar a tela. Para
   * compartilhamento de tela (texto, código, UI) isso é o que importa.
   */
  keepResolution?: boolean;
}

export async function tuneSender(
  sender: RTCRtpSender | null,
  { bitrate, fps, keepResolution }: SenderTuning,
): Promise<void> {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    const enc = params.encodings[0]!;
    enc.maxBitrate = bitrate;
    if (fps) enc.maxFramerate = fps;
    enc.networkPriority = 'high';
    enc.priority = 'high';
    if (keepResolution) params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch (err) {
    console.warn('[rtc] setParameters falhou:', (err as Error).message);
  }
}
