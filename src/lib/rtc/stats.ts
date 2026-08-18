import type { Peer } from './peer';
import type { QualityPreset } from './quality';

interface ReportContext {
  quality: QualityPreset;
  contentHint: string;
  sharing: boolean;
  peers: Peer[];
}

/**
 * Relatório de diagnóstico em texto — o que a janela "Status da conexão"
 * mostra. Em português e sem jargão de propósito: quem abre isso está
 * tentando entender por que a chamada está ruim, não lendo um dump de RTP.
 */
export async function buildReport(ctx: ReportContext): Promise<string> {
  const lines: string[] = [
    `Qualidade alvo : ${ctx.quality.label}`,
    `Vídeo até      : ${(ctx.quality.video / 1e6).toFixed(1)} Mbps`,
    `Áudio da tela  : ${(ctx.quality.audio / 1000).toFixed(0)} kbps estéreo`,
    `Modo           : ${ctx.contentHint === 'detail' ? 'Nitidez (texto)' : 'Fluidez (movimento)'}`,
    `Enviando tela  : ${ctx.sharing ? 'sim' : 'não'}`,
    '',
  ];

  if (!ctx.peers.length) lines.push('Ninguém mais na sala.');

  for (const peer of ctx.peers) {
    lines.push(`— ${peer.user.name} [${peer.pc.connectionState}] —`);
    let stats: RTCStatsReport;
    try {
      stats = await peer.pc.getStats();
    } catch {
      continue;
    }
    lines.push(...describeRoute(stats), ...describeFlows(stats), '');
  }

  return lines.join('\n');
}

/** Por onde a mídia está passando: rede local, P2P direto, ou retransmissor. */
function describeRoute(stats: RTCStatsReport): string[] {
  let route: RTCIceCandidatePairStats | null = null;
  stats.forEach((r) => {
    const pair = r as RTCIceCandidatePairStats;
    if (pair.type === 'candidate-pair' && pair.state === 'succeeded' && pair.nominated) route = pair;
  });
  if (!route) return [];

  const pair = route as RTCIceCandidatePairStats;
  let localType = '?';
  stats.forEach((r) => {
    // `RTCIceCandidateStats` não existe na lib do TS; o formato é o do spec.
    const candidate = r as { id?: string; candidateType?: string };
    if (candidate.id === pair.localCandidateId) localType = candidate.candidateType ?? '?';
  });

  const via = localType === 'relay' ? 'via servidor TURN' : localType === 'host' ? 'rede local' : 'P2P (STUN)';
  const out = [`  rota    : ${via}`];
  if (pair.currentRoundTripTime != null) {
    out.push(`  ping    : ${Math.round(pair.currentRoundTripTime * 1000)} ms`);
  }
  return out;
}

const LIMIT_REASON: Record<string, string> = { cpu: 'CPU', bandwidth: 'banda', other: 'outro' };

/** O que está saindo e o que está entrando de vídeo, com o motivo de qualquer limite. */
function describeFlows(stats: RTCStatsReport): string[] {
  const out: string[] = [];
  stats.forEach((report) => {
    const r = report as RTCOutboundRtpStreamStats &
      RTCInboundRtpStreamStats & { qualityLimitationReason?: string; targetBitrate?: number };

    if (r.type === 'outbound-rtp' && r.kind === 'video') {
      const kbps = r.targetBitrate ? Math.round(r.targetBitrate / 1000) : null;
      out.push(
        `  enviando : ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'} @ `
          + `${Math.round(r.framesPerSecond ?? 0)}fps${kbps ? ` (${kbps} kbps)` : ''}`,
      );
      if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') {
        out.push(`  limitado por: ${LIMIT_REASON[r.qualityLimitationReason] ?? r.qualityLimitationReason}`);
      }
    }

    if (r.type === 'inbound-rtp' && r.kind === 'video') {
      out.push(
        `  recebendo: ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'} @ `
          + `${Math.round(r.framesPerSecond ?? 0)}fps`,
      );
      if (r.packetsLost) out.push(`  pacotes perdidos: ${r.packetsLost}`);
    }
  });
  return out;
}
