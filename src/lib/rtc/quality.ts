/** Presets de transmissão. Os valores vêm do 3.x sem mudança. */

export interface QualityPreset {
  label: string;
  w: number;
  h: number;
  fps: number;
  /** bits por segundo */
  video: number;
  audio: number;
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
  '720p30': { label: '720p 30fps', w: 1280, h: 720, fps: 30, video: 2_500_000, audio: 128_000 },
  '1080p30': { label: '1080p 30fps', w: 1920, h: 1080, fps: 30, video: 4_500_000, audio: 192_000 },
  '1080p60': { label: '1080p 60fps', w: 1920, h: 1080, fps: 60, video: 8_000_000, audio: 256_000 },
  '1440p60': { label: '1440p 60fps', w: 2560, h: 1440, fps: 60, video: 12_000_000, audio: 256_000 },
  '4k30': { label: '4K 30fps', w: 3840, h: 2160, fps: 30, video: 16_000_000, audio: 256_000 },
};

/** Do mais pesado ao mais leve — usada para descer um degrau quando a rede não aguenta. */
export const QUALITY_LADDER = ['4k30', '1440p60', '1080p60', '1080p30', '720p30'] as const;

export const DEFAULT_QUALITY_KEY = '1080p60';

export function presetFor(key: string): QualityPreset {
  return QUALITY_PRESETS[key] ?? QUALITY_PRESETS[DEFAULT_QUALITY_KEY]!;
}

/** O degrau imediatamente mais leve, ou `null` se já estamos no mínimo. */
export function nextLowerQuality(key: string): string | null {
  const i = QUALITY_LADDER.indexOf(key as (typeof QUALITY_LADDER)[number]);
  if (i === -1 || i >= QUALITY_LADDER.length - 1) return null;
  return QUALITY_LADDER[i + 1] ?? null;
}
