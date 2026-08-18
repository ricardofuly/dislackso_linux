import { connectSocket } from '@/lib/socket/client';
import { ask } from '@/lib/socket/client';
import { annot } from '@/lib/annot/engine';
import { feedback } from '@/lib/feedback';
import { voice } from '@/lib/rtc/engine';
import { useAnnouncements } from '@/stores/announcements';
import { useGuilds } from '@/stores/guilds';
import { useMessages, messageKey } from '@/stores/messages';
import { useRoom } from '@/stores/room';
import { savedCredentials, useSession } from '@/stores/session';
import { settings } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import type { SessionPayload } from '@/types/api';
import { joinVoice, leaveVoice } from '@/features/voice/actions';

/** Se o servidor não responder nisso, deixamos o usuário entrar na mão. */
const BOOT_TIMEOUT_MS = 8000;

/**
 * Liga o app ao servidor e mantém os stores em dia.
 *
 * Este é o único lugar do app que escuta eventos empurrados pelo servidor.
 * Toda a interface lê dos stores; nenhum componente fala com o socket
 * diretamente — é o que impede o retorno do emaranhado de listeners espalhados
 * que existia no 3.x.
 */
export function startConnection(): void {
  const socket = connectSocket();
  const session = useSession.getState();

  socket.on('connect', () => {
    useSession.getState().setConnected(true);
    const saved = savedCredentials();
    if (!saved) return useSession.getState().setPhase('gate');

    ask('hello', saved)
      .then(adoptSession)
      .catch((err: Error) => {
        useSession.getState().setPhase('gate');
        if (err.message !== 'auth_required') toast(`Falha ao entrar: ${err.message}`);
      });
  });

  socket.on('disconnect', () => {
    useSession.getState().setConnected(false);
    const room = useRoom.getState().room;
    if (room) {
      useSession.getState().setRejoin(room);
      void leaveVoice({ silent: true });
    }
  });

  /* ------------------------------------------------------- servidores --- */

  socket.on('guild:update', (guild) => useGuilds.getState().upsert(guild));

  socket.on('guild:deleted', ({ guildId }) => {
    useGuilds.getState().remove(guildId);
    if (useRoom.getState().room?.guildId === guildId) void leaveVoice({ silent: true });
    toast('Um servidor foi excluído pelo dono.');
  });

  socket.on('guild:online', ({ guildId, online }) => useGuilds.getState().setOnline(guildId, online));

  socket.on('presence:update', ({ guildId, presence }) =>
    useGuilds.getState().setPresence(guildId, presence),
  );

  socket.on('user:update', (user) => {
    useGuilds.getState().refreshMember(user);
    for (const peer of voice.mesh.peers.values()) {
      if (peer.user.id === user.id) peer.user = user;
    }
    if (useSession.getState().me?.id === user.id) useSession.getState().setMe(user);
    useRoom.getState().bump();
  });

  /* ------------------------------------------------------------- voz --- */

  socket.on('voice:peerJoined', (info) => {
    if (!useRoom.getState().room) return;
    voice.mesh.add(info);
    toast(`${info.user.name} entrou na sala.`);
    feedback('join');
  });

  socket.on('voice:peerLeft', ({ sid }) => {
    const peer = voice.mesh.peers.get(sid);
    voice.mesh.remove(sid);
    useRoom.getState().unwatch(sid);
    if (peer) toast(`${peer.user.name} saiu da sala.`);
    feedback('leave');
  });

  socket.on('voice:state', ({ sid, state }) => {
    voice.mesh.setPeerState(sid, state);
    announceSharing(sid, state.screen);
    // Se a pessoa parou de compartilhar, esqueço que eu estava assistindo —
    // senão, quando ela compartilhar de novo, o app acha que já devia estar
    // recebendo o vídeo e nunca manda o pedido de novo.
    if (!state.screen) useRoom.getState().unwatch(sid);
  });

  socket.on('rtc:signal', ({ from, data }) => voice.mesh.handleSignal(from, data));

  socket.on('screen:preview', ({ from, dataUrl }) => useRoom.getState().setPreview(from, dataUrl));

  /* -------------------------------------------------------- mensagens --- */

  socket.on('message:new', ({ guildId, channelId, message }) => {
    useMessages.getState().append(guildId, channelId, message);
    const { activeGuildId, activeTextChannelId } = useGuilds.getState();
    const open = activeGuildId === guildId && activeTextChannelId === channelId;
    if (!open && message.userId !== useSession.getState().me?.id) feedback('message');
  });

  /* ---------------------------------------------------------- avisos --- */

  socket.on('admin:message', (payload) => useAnnouncements.getState().enqueue(payload));

  /* --------------------------------------------------------- anotação --- */

  socket.on('annot:draw', (patch) => annot.applyRemote(patch));
  socket.on('annot:clear', ({ target }) => annot.clear(target, false));

  annot.start();

  // Se a conexão inicial travar (servidor fora do ar, rede lenta), não deixa
  // o usuário preso atrás do loading para sempre.
  setTimeout(() => {
    if (useSession.getState().phase === 'booting') session.setPhase('gate');
  }, BOOT_TIMEOUT_MS);
}

/** Abre a sessão para valer, depois de hello / login / registro / claim. */
export function adoptSession(payload: SessionPayload): void {
  const session = useSession.getState();
  session.adopt(payload);
  useGuilds.getState().setGuilds(payload.guilds);

  voice.configure(payload.sid, payload.iceServers);
  voice.setQuality(settings().quality);
  voice.setContentHint(settings().contentHint);

  const rejoin = session.rejoin;
  if (rejoin) {
    session.setRejoin(null);
    void joinVoice(rejoin.guildId, rejoin.channelId).then(() => toast('Reconectado à sala.'));
  }
}

/** Avisa (uma vez só) quando alguém começa ou para de transmitir. */
function announceSharing(sid: string, sharing: boolean): void {
  const room = useRoom.getState();
  const seen = room.sharingSeen.has(sid);
  if (sharing === seen) return;

  const peer = voice.mesh.peers.get(sid);
  room.markSharing(sid, sharing);

  if (sharing) {
    if (settings().autoFocus && !room.focusId) room.focus(sid);
    if (peer) toast(`${peer.user.name} começou a transmitir.`);
    feedback('screenstart');
  } else {
    if (room.focusId === sid) room.focus(null);
    if (peer) toast(`${peer.user.name} parou de transmitir.`);
    feedback('screenstop');
  }
}

/** Chave de canal reexportada por conveniência de quem escuta mensagens. */
export { messageKey };
