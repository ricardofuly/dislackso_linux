import type { AnnotStrokePatch } from '@/types/api';

interface UserQuota {
  pointCount: number;
  lastReset: number;
  activeStrokes: Set<string>;
}

export interface AntiGriefConfig {
  /** Máximo de pontos que um usuário pode enviar por segundo (anti-flood) */
  maxPointsPerSecond: number;
  /** Máximo de traços simultâneos por usuário */
  maxActiveStrokesPerUser: number;
  /** Limite máximo total de traços ativos na tela */
  maxTotalStrokes: number;
  /** Tempo padrão de vida do traço em segundos */
  defaultFadeSeconds: number;
}

const DEFAULT_CONFIG: AntiGriefConfig = {
  maxPointsPerSecond: 120,
  maxActiveStrokesPerUser: 6,
  maxTotalStrokes: 18,
  defaultFadeSeconds: 8,
};

/**
 * Validador e moderador de anotações em tempo real.
 * Protege o usuário que está transmitindo de spam, rabiscos abusivos e poluição visual.
 */
export class AnnotAntiGrief {
  private readonly userQuotas = new Map<string, UserQuota>();
  private readonly mutedUsers = new Set<string>();
  private config: AntiGriefConfig;

  constructor(config: Partial<AntiGriefConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Muta ou desmuta um usuário específico para desenhos */
  setMuted(userId: string, muted: boolean): void {
    if (muted) this.mutedUsers.add(userId);
    else this.mutedUsers.delete(userId);
  }

  isMuted(userId: string): boolean {
    return this.mutedUsers.has(userId);
  }

  /**
   * Avalia um patch de traço recebido.
   * Retorna `true` se o traço é legítimo, ou `false` se deve ser descartado por regra anti-grief.
   */
  validate(patch: AnnotStrokePatch, currentTotalStrokes: number, senderId = 'unknown'): boolean {
    // 1. Se o usuário estiver mutado pelo transmissor
    if (this.mutedUsers.has(senderId)) {
      return false;
    }

    // 2. Proteção contra saturação total da tela (densidade máxima)
    if (currentTotalStrokes >= this.config.maxTotalStrokes && !patch.replace) {
      return false;
    }

    const now = performance.now();
    let quota = this.userQuotas.get(senderId);
    if (!quota) {
      quota = { pointCount: 0, lastReset: now, activeStrokes: new Set() };
      this.userQuotas.set(senderId, quota);
    }

    // Reset de taxa a cada 1 segundo
    if (now - quota.lastReset >= 1000) {
      quota.pointCount = 0;
      quota.lastReset = now;
    }

    const incomingPoints = patch.pts?.length ?? 0;
    quota.pointCount += incomingPoints;

    // 3. Taxa de pontos por segundo ultrapassada (flood)
    if (quota.pointCount > this.config.maxPointsPerSecond) {
      return false;
    }

    // 4. Limite de traços simultâneos por usuário
    quota.activeStrokes.add(patch.id);
    if (quota.activeStrokes.size > this.config.maxActiveStrokesPerUser) {
      // Remove o traço mais antigo da cota deste usuário
      const oldest = quota.activeStrokes.values().next().value;
      if (oldest) quota.activeStrokes.delete(oldest);
    }

    return true;
  }

  /** Limpa o registro de um traço quando ele expira/some */
  onStrokeExpired(strokeId: string): void {
    for (const quota of this.userQuotas.values()) {
      quota.activeStrokes.delete(strokeId);
    }
  }

  /** Limpa todos os estados */
  reset(): void {
    this.userQuotas.clear();
  }
}

export const antiGrief = new AnnotAntiGrief();
