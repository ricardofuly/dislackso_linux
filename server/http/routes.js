'use strict';

/**
 * As rotas HTTP do servidor. Tudo o mais acontece pelo socket.
 */

const { IMAGE_TYPES, MAX_UPLOAD_BYTES, cleanMultiline, uid } = require('../util');

function registerRoutes(app, ctx) {
  const { store, adminKey, io } = ctx;

  app.get('/api/health', (_req, res) => {
    // "supabase: false" num serviço no Render explica sozinho contas que
    // somem: sem espelhamento remoto os dados vivem só no disco efêmero, e
    // qualquer redeploy começa do zero.
    res.json({ ok: true, ...store.health() });
  });

  /** Toda rota de admin exige a mesma chave compartilhada — sem ela, nem tenta. */
  function requireAdminKey(req, res) {
    if (!adminKey) { res.status(503).json({ error: 'ADMIN_KEY não configurado no servidor' }); return false; }
    if (String((req.body || {}).key || '') !== adminKey) { res.status(403).json({ error: 'chave inválida' }); return false; }
    return true;
  }

  /**
   * Aviso para todo mundo conectado agora, disparado pelo painel de
   * desenvolvedor do app desktop. Protegido por chave compartilhada, não por
   * login — o painel de dev não tem sessão de usuário.
   */
  app.post('/api/admin/broadcast', (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const text = cleanMultiline(req.body.message, 2000);
      if (!text) return res.status(400).json({ error: 'mensagem vazia' });

      io.emit('admin:message', { id: uid(), message: text, forceFocus: !!req.body.forceFocus, at: Date.now() });
      res.json({ ok: true, delivered: io.engine.clientsCount });
    } catch (err) {
      console.error('[admin:broadcast]', err);
      res.status(500).json({ error: 'falha ao enviar' });
    }
  });

  /**
   * Lê ou define qual usuário tem passe livre nas ações restritas ao dono
   * (excluir servidor/sala, gerar convite) em qualquer servidor — pensado
   * pra uma conta só, a de quem administra o app. `userId` omitido só lê o
   * valor atual; `userId: ''` remove o admin.
   */
  app.post('/api/admin/admin-user', (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      if (Object.prototype.hasOwnProperty.call(req.body, 'userId')) {
        const userId = String(req.body.userId || '').trim();
        store.data.adminUserId = userId || null;
        store.save();
      }
      res.json({ ok: true, adminUserId: store.data.adminUserId || null });
    } catch (err) {
      console.error('[admin:admin-user]', err);
      res.status(500).json({ error: 'falha ao salvar' });
    }
  });

  /**
   * Upload de avatar, banner ou ícone de servidor.
   *
   * Volta como o mesmo data URL que chegou, sem reprocessar — é o que
   * preserva GIF animado. Guardamos assim (embutido no próprio registro do
   * usuário/servidor) e não em arquivo separado de propósito: o disco de um
   * host como o Render é efêmero e some a cada redeploy, mas o banco é
   * espelhado no Supabase — a imagem sobrevive junto.
   */
  app.post('/api/upload', (req, res) => {
    try {
      const { userId, dataUrl, kind } = req.body || {};
      if (!userId || !store.data.users[userId]) return res.status(403).json({ error: 'usuario desconhecido' });
      if (!['avatar', 'banner', 'guild'].includes(kind)) return res.status(400).json({ error: 'tipo invalido' });

      const match = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
      if (!match) return res.status(400).json({ error: 'imagem invalida' });
      if (!IMAGE_TYPES[match[1]]) return res.status(415).json({ error: 'use PNG, JPG, GIF ou WEBP' });

      const approxBytes = Math.floor((match[2].length * 3) / 4);
      if (approxBytes > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `imagem acima de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` });
      }

      res.json({ url: dataUrl });
    } catch (err) {
      console.error('[upload]', err);
      res.status(500).json({ error: 'falha ao salvar' });
    }
  });
}

module.exports = { registerRoutes };
