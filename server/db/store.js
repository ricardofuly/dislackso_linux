'use strict';

/**
 * O banco: um objeto em memória, gravado em disco e (opcionalmente) espelhado
 * no Supabase.
 *
 * A gravação é agrupada em 250 ms e feita em arquivo temporário + rename. O
 * rename é atômico no sistema de arquivos — sem ele, uma queda no meio da
 * escrita deixaria um JSON truncado, ou seja, todos os dados perdidos.
 *
 * O formato está congelado em docs/CONTRATO.md.
 */

const fs = require('fs');
const path = require('path');
const { normalizeChannel } = require('./shapes');
const { createMirror } = require('./supabase');

/** Agrupa rajadas de alteração numa gravação só. */
const SAVE_DEBOUNCE_MS = 250;

const emptyDb = () => ({ users: {}, guilds: {}, usernames: {}, adminUserId: null });

/** Garante as raízes e normaliza os canais de todos os servidores. */
function normalize(db) {
  const out = { ...emptyDb(), ...db };
  out.users = out.users || {};
  out.guilds = out.guilds || {};
  out.usernames = out.usernames || {};
  out.adminUserId = out.adminUserId || null;
  for (const guild of Object.values(out.guilds)) {
    guild.channels = (guild.channels || []).map(normalizeChannel);
  }
  return out;
}

function createStore({ dataDir, supabase }) {
  const file = path.join(dataDir, 'db.json');
  const mirror = createMirror(supabase);

  let db = emptyDb();
  try {
    if (fs.existsSync(file)) db = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.error('[db] arquivo corrompido, comecando do zero:', err.message);
    db = emptyDb();
  }

  let timer = null;

  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tmp = `${file}.tmp`;
      fs.writeFile(tmp, JSON.stringify(db, null, 2), (err) => {
        if (err) return console.error('[db] falha ao gravar:', err.message);
        fs.rename(tmp, file, (e) => e && console.error('[db] falha ao trocar:', e.message));
      });
      void mirror.save(db);
    }, SAVE_DEBOUNCE_MS);
  }

  /** Puxa o estado remoto por cima do local. Roda uma vez, antes de escutar. */
  async function restore() {
    const remote = await mirror.load();
    if (remote) db = normalize(remote);
  }

  return {
    get data() {
      return db;
    },
    save,
    restore,
    /** Para o /api/health explicar sozinho por que contas somem num redeploy. */
    health() {
      return {
        guilds: Object.keys(db.guilds).length,
        users: Object.keys(db.users).length,
        supabase: mirror.enabled,
        supabaseError: mirror.lastError,
        supabaseLastOkAt: mirror.lastOkAt,
      };
    },
  };
}

module.exports = { createStore };
