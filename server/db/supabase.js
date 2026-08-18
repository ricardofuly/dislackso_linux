'use strict';

/**
 * Espelho do banco JSON numa única linha do Postgres do Supabase.
 *
 * Existe por um motivo bem concreto: no Render o disco é efêmero, e sem este
 * espelho todo redeploy começaria do zero — contas, servidores e conversas
 * simplesmente sumiriam. Com ele, o servidor continua sendo um arquivo JSON
 * simples, mas sobrevive a reinícios.
 *
 * É opcional: sem as credenciais, tudo funciona só com o disco local.
 */

const TABLE = 'app_state';

/** "fetch failed" do Node não diz o motivo; `err.cause` tem o erro de rede real. */
function describeFetchError(err) {
  const cause = err && err.cause;
  const code = cause && cause.code;
  return code ? `${err.message} (${code}: ${cause.message || code})` : err.message;
}

function createMirror({ url, key, row }) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const enabled = Boolean(baseUrl && key && typeof fetch === 'function');
  const rowId = String(row || 'main');

  const state = { lastError: null, lastOkAt: null };

  if (enabled && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(baseUrl)) {
    console.warn(
      `[db] SUPABASE_URL não parece uma URL de projeto Supabase válida: "${baseUrl}" `
      + '(esperado algo como https://xxxxxxxx.supabase.co, sem barra no final).',
    );
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  /** Devolve o estado guardado, ou `null` se não houver (ou se falhou). */
  async function load() {
    if (!enabled) return null;
    try {
      const query = `${TABLE}?id=eq.${encodeURIComponent(rowId)}&select=data`;
      const res = await fetch(`${baseUrl}/rest/v1/${query}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);

      const rows = await res.json();
      state.lastError = null;
      state.lastOkAt = new Date().toISOString();

      const data = rows[0] && rows[0].data;
      if (data && typeof data === 'object') {
        console.log('[db] estado restaurado do Supabase');
        return data;
      }
      console.log(`[db] Supabase conectado, mas ainda sem linha salva (id=${rowId}) — começando do zero.`);
      return null;
    } catch (err) {
      state.lastError = describeFetchError(err);
      console.error('[db] Supabase indisponível; usando cópia local:', state.lastError);
      return null;
    }
  }

  async function save(db) {
    if (!enabled) return;
    try {
      const res = await fetch(`${baseUrl}/rest/v1/${TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ id: rowId, data: db, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      state.lastError = null;
      state.lastOkAt = new Date().toISOString();
    } catch (err) {
      state.lastError = describeFetchError(err);
      console.error('[db] falha ao espelhar no Supabase:', state.lastError);
    }
  }

  return {
    enabled,
    load,
    save,
    get lastError() {
      return state.lastError;
    },
    get lastOkAt() {
      return state.lastOkAt;
    },
  };
}

module.exports = { createMirror };
