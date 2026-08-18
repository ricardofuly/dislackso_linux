/**
 * Tipos do protocolo — espelham `docs/CONTRATO.md` linha por linha.
 * Mudar qualquer coisa aqui significa mudar o servidor e o banco junto.
 */

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  color: string;
  accent: string;
  avatar: string;
  banner: string;
  bio: string;
  pronouns: string;
  createdAt?: number;
}

export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
}

export interface Guild {
  id: string;
  name: string;
  ownerId: string;
  invite: string;
  icon: string;
  channels: Channel[];
  members: PublicUser[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  createdAt: number;
  /** O servidor anexa o autor em `message:new`; no histórico ele pode faltar. */
  user?: PublicUser;
}

/** Estado de voz publicado por cada participante da sala. */
export interface VoiceState {
  mic: boolean;
  screen: boolean;
  speaking: boolean;
  /** Se deixa os outros rabiscarem na tela dele. */
  annot: boolean;
  streams: { mic: string | null; screen: string | null };
}

/** Um participante de sala de voz, como o servidor o apresenta. */
export interface PeerInfo {
  sid: string;
  user: PublicUser;
  state: VoiceState;
}

/** Quem está em cada sala de voz de um servidor. */
export type Presence = Record<string, PeerInfo[]>;

/** Resposta de hello / login / registro / claim. */
export interface SessionPayload {
  user: PublicUser;
  guilds: Guild[];
  iceServers: RTCIceServer[];
  sid: string;
  token: string;
  friends: string[];
}

export interface AdminAnnouncement {
  id: string;
  message: string;
  forceFocus: boolean;
  at: number;
}

/** Patch aceito por `user:update`. Todos os campos são opcionais. */
export interface ProfilePatch {
  name?: string;
  bio?: string;
  pronouns?: string;
  accent?: string;
  avatar?: string;
  banner?: string;
}

/** Um traço de anotação, em coordenadas normalizadas (0..1). */
export interface AnnotStroke {
  id: string;
  target: string;
  tool: 'pen' | 'arrow' | 'rect' | 'highlight';
  color: string;
  size: number;
  points: number[];
  end?: boolean;
}
