# Contrato congelado — DiSlackso 4.0

Este documento existe por um motivo só: **o refactor 4.0 não pode quebrar nada
que já está gravado**. Servidores em produção (Render + Supabase) e instalações
antigas do app desktop continuam falando o mesmo protocolo e lendo o mesmo
banco. Qualquer mudança aqui é uma migração, não um refactor.

## 1. Formato do banco (`data/db.json` e a linha `app_state` no Supabase)

```jsonc
{
  "users": {
    "<uuid>": {
      "id": "<uuid>",
      "username": "string",       // /^[a-zA-Z0-9_]{3,20}$/, único
      "passwordHash": "salt:hash",// scrypt, 16 bytes de salt, 64 de hash
      "token": "hex(32)",         // sessão atual; trocado a cada login
      "name": "string(32)",
      "color": "#rrggbb",
      "accent": "#rrggbb",
      "avatar": "/uploads/<hex>.png|jpg|gif|webp" | "",
      "banner": "idem" | "",
      "bio": "string(300)",
      "pronouns": "string(20)",
      "friends": ["<uuid>"],
      "createdAt": 1690000000000
    }
  },
  "guilds": {
    "<uuid>": {
      "id": "<uuid>",
      "name": "string(48)",
      "ownerId": "<uuid>",
      "invite": "ABCD2345",       // 8 chars do alfabeto sem I/O/0/1
      "icon": "/uploads/... " | "",
      "createdAt": 1690000000000,
      "members": ["<uuid>"],
      "channels": [
        { "id": "<uuid>", "name": "string(32)", "type": "text|voice",
          "messages": [ { "id": "<uuid>", "userId": "<uuid>",
                          "text": "string(2000)", "createdAt": 1690000000000 } ] }
      ]
    }
  },
  "usernames": { "<username em minúsculas>": "<uuid do usuário>" }
}
```

Regras invioláveis:
- `messages` fica no disco com no máximo 200 itens por canal; a API devolve 100.
- `publicUser`/`publicGuild` nunca podem vazar `passwordHash` nem `token` de terceiros.
- `usernames` guarda a chave em minúsculas — é o índice de unicidade.

## 2. Eventos de socket (o app 3.x instalado ainda usa exatamente estes)

Cliente → servidor (todos com callback `(res)` e erro em `res.error`):

| evento | payload | resposta |
| --- | --- | --- |
| `hello` | `{ userId, token }` | sessão |
| `auth:register` | `{ username, password, name }` | sessão |
| `auth:login` | `{ username, password }` | sessão |
| `auth:claim` | `{ userId, username, password }` | sessão |
| `user:update` | patch de perfil | `{ user }` |
| `friend:add` / `friend:remove` | `{ friendId }` | `{ friends }` |
| `guild:create` | `{ name }` | `{ guild }` |
| `guild:join` | `{ invite }` | `{ guild }` |
| `guild:update` | `{ guildId, name?, icon? }` | `{ guild }` |
| `guild:leave` / `guild:delete` | `{ guildId }` | `{ ok }` |
| `guild:regenInvite` | `{ guildId }` | `{ invite }` |
| `channel:create` | `{ guildId, name, type }` | `{ guild }` |
| `channel:delete` | `{ guildId, channelId }` | `{ guild }` |
| `voice:join` | `{ guildId, channelId }` | `{ peers }` |
| `voice:leave` | — | `{ ok }` |
| `voice:state` | `{ mic, screen, speaking, annot, streams }` | (sem resposta) |
| `rtc:signal` | `{ to, data }` | (sem resposta) |
| `message:history` | `{ guildId, channelId }` | `{ messages }` |
| `message:send` | `{ guildId, channelId, text }` | `{ message }` |
| `screen:preview` | `{ dataUrl }` | (sem resposta) |
| `annot:draw` / `annot:clear` | `{ target, ... }` | (sem resposta) |

Sessão = `{ user, guilds, iceServers, sid, token, friends }`.

Servidor → cliente: `guild:update`, `guild:deleted`, `guild:online`,
`user:update`, `presence:update`, `voice:peerJoined`, `voice:peerLeft`,
`voice:state`, `rtc:signal`, `message:new`, `screen:preview`, `annot:draw`,
`annot:clear`, `admin:message`.

## 3. HTTP

- `GET /api/health` → `{ ok, guilds, users, supabase, supabaseError, supabaseLastOkAt }`
- `POST /api/upload` → `{ userId, dataUrl, kind: 'avatar'|'banner'|'guild' }` → `{ url }`
- `POST /api/admin/broadcast` → `{ key, message, forceFocus }` → `{ ok, delivered }`
- `GET /uploads/<arquivo>` — estático, `immutable`, 7 dias.

## 4. localStorage (prefixo `dsx:`)

`userId`, `authToken`, `name`, `settings`, `guildsCache`, `profileCache`,
`friendsCache`, `membersOpen`, `migrated`.

O prefixo antigo `d2:` continua sendo migrado no primeiro boot. **Não renomear
nenhuma dessas chaves**: quem já está logado seria deslogado.

## 5. Ponte do desktop (`window.desktop`)

`isDesktop`, `getConfig`, `setConfig`, `info`, `restart`, `goHome`,
`openExternal`, `focusWindow`, `onPickScreen`, `retryScreenShareWithoutAudio`,
`update.{state,check,download,install,onChange}`.
