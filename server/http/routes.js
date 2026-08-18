'use strict';

/**
 * As três rotas HTTP do servidor. Tudo o mais acontece pelo socket.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { IMAGE_TYPES, MAX_UPLOAD_BYTES, cleanMultiline, uid } = require('../util');

function registerRoutes(app, ctx) {
  const { store, uploadDir, adminKey, io } = ctx;

  app.get('/api/health', (_req, res) => {
    // "supabase: false" num serviço no Render explica sozinho contas que
    // somem: sem espelhamento remoto os dados vivem só no disco efêmero, e
    // qualquer redeploy começa do zero.
    res.json({ ok: true, ...store.health() });
  });

  /**
   * Aviso para todo mundo conectado agora, disparado pelo painel de
   * desenvolvedor do app desktop. Protegido por chave compartilhada, não por
   * login — o painel de dev não tem sessão de usuário.
   */
  app.post('/api/admin/broadcast', (req, res) => {
    try {
      if (!adminKey) return res.status(503).json({ error: 'ADMIN_KEY não configurado no servidor' });
      const { key, message, forceFocus } = req.body || {};
      if (String(key || '') !== adminKey) return res.status(403).json({ error: 'chave inválida' });

      const text = cleanMultiline(message, 2000);
      if (!text) return res.status(400).json({ error: 'mensagem vazia' });

      io.emit('admin:message', { id: uid(), message: text, forceFocus: !!forceFocus, at: Date.now() });
      res.json({ ok: true, delivered: io.engine.clientsCount });
    } catch (err) {
      console.error('[admin:broadcast]', err);
      res.status(500).json({ error: 'falha ao enviar' });
    }
  });

  /**
   * Upload de avatar, banner ou ícone de servidor.
   *
   * O cliente manda um data URL e gravamos o arquivo como veio, sem
   * reprocessar — é o que preserva GIF animado.
   */
  app.post('/api/upload', (req, res) => {
    try {
      const { userId, dataUrl, kind } = req.body || {};
      if (!userId || !store.data.users[userId]) return res.status(403).json({ error: 'usuario desconhecido' });
      if (!['avatar', 'banner', 'guild'].includes(kind)) return res.status(400).json({ error: 'tipo invalido' });

      const match = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
      if (!match) return res.status(400).json({ error: 'imagem invalida' });

      const ext = IMAGE_TYPES[match[1]];
      if (!ext) return res.status(415).json({ error: 'use PNG, JPG, GIF ou WEBP' });

      const buf = Buffer.from(match[2], 'base64');
      if (buf.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `imagem acima de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` });
      }

      const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, name), buf);
      res.json({ url: `/uploads/${name}` });
    } catch (err) {
      console.error('[upload]', err);
      res.status(500).json({ error: 'falha ao salvar' });
    }
  });
}

module.exports = { registerRoutes };
