# DiSlackso

Servidores privados, compartilhamento de tela em alta resolução e anotação ao vivo — como
app de PC ou pelo navegador.

O vídeo e o áudio vão **direto de um computador para o outro** (WebRTC P2P). O servidor só
apresenta as pessoas umas às outras e guarda servidores, convites e perfis — ele nunca vê a
sua tela.

---

## Download

[**Baixar DiSlackso para Windows**](https://github.com/spikeleez/dislackso/releases/latest/download/DiSlackso-Setup-3.3.3.exe) | [Versão Portátil (.zip)](https://github.com/spikeleez/dislackso/releases/latest/download/DiSlackso-portable-3.3.3.zip)

Você pode instalar o app no seu computador e se conectar diretamente aos servidores na nuvem com persistência de dados.

---

## Rodando

### Como app de PC (recomendado)

```bash
npm install
```

```bash
npm run desktop
```

O app conecta direto no servidor na nuvem (Render + Supabase, veja
[Nuvem](#nuvem-sem-depender-do-pc-de-alguém) mais abaixo) — todo mundo entra pelo mesmo
endereço, sem precisar deixar o próprio PC ligado. Basta entrar com nickname e senha.

O app tem duas vantagens sobre o navegador: **seletor de tela próprio** com miniaturas, e
**áudio do sistema no Windows** sem depender da caixinha do Chrome.

### Empacotando para os amigos

**Versão portátil** — funciona sempre, sem instalador e sem admin:

```bash
npm run portable
```

Sai `dist/DiSlackso-portable/` (~277 MB). Zipe a pasta e mande; eles rodam `DiSlackso.exe`
direto e entram com nickname e senha — o app já sabe pra qual servidor ir.

**Instalador .exe**:

```bash
npm run build
```

Gera `dist/DiSlackso-Setup-3.3.3.exe` (~79 MB). Instalador comum: escolhe pasta, cria atalho,
desinstala pelo Painel de Controle.

> **Sobre o erro "Cannot create symbolic link"**
>
> O `electron-builder` baixa uma ferramenta de assinatura (`winCodeSign`) empacotada com
> bibliotecas do macOS gravadas como links simbólicos. Criar link simbólico no Windows exige
> um privilégio que conta comum não tem, e o build inteiro morre por causa de dois arquivos
> `.dylib` que um build Windows nunca usa.
>
> O `scripts/prep-build.js` roda antes do empacotamento e resolve sozinho: extrai o pacote
> ignorando esses dois links, direto na pasta final do cache
> (`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`). O
> `electron-builder` encontra tudo pronto e nem tenta baixar.
>
> Não precisa de Modo Desenvolvedor nem de administrador. Se o cache já estiver bom, o script
> não faz nada.
>
> Detalhe que engana: a pasta que aparece na mensagem de erro (`...\winCodeSign\242339159`) é
> temporária e muda a cada tentativa — pré-extrair *nela* não adianta. O que vale é a pasta
> final, com o nome versionado.

### Atualizando

A partir da 3.1.0 o app instalado **se atualiza sozinho**. Ele consulta os releases deste
repositório, avisa quando há versão nova, e em *Configurações › Atualizações* você vê o que
mudou, baixa com barra de progresso e reinicia quando quiser — o app reabre sozinho.

Nada acontece sem você mandar: pergunta antes de baixar e pergunta de novo antes de
reiniciar. Dá para desligar a verificação automática.

O download aproveita o `.blockmap` e traz só os pedaços que mudaram, então costuma ser bem
menor que o instalador inteiro.

> A **versão portátil não se atualiza sozinha** — não existe instalador para rodar. O
> empacotador grava um marcador `resources/PORTABLE` e o app detecta, avisa e leva até a
> página de releases.

**Para publicar uma versão nova:**

```bash
npm version minor && npm run build && npm run portable
```

Depois suba o release com os quatro arquivos que o atualizador precisa:

```bash
gh release create v3.2.0 dist/DiSlackso-Setup-*.exe dist/*.blockmap dist/latest.yml dist/DiSlackso-portable-*.zip --title "..." --notes "..."
```

O `latest.yml` é obrigatório: é o manifesto que o atualizador lê. Sem ele, os apps instalados
não enxergam a versão nova. O `.blockmap` é o que permite o download incremental.

> O repositório precisa ser **público**. O atualizador roda na máquina dos seus amigos, sem
> autenticação, e o GitHub responde 404 em repositório privado — não há configuração no app
> que contorne isso, e embutir um token exporia o código a quem tiver o `.exe`.

Publicar um Release também redeploya sozinho o servidor na nuvem (Render + Supabase, veja
abaixo): um workflow do GitHub Actions dispara o deploy hook do Render assim que o Release
sai. Configuração em [DEPLOY.md](DEPLOY.md#deploy-automático-a-cada-release).

### Pelo navegador

```bash
npm start
```

Abra <http://localhost:3000>. Use Chrome ou Edge — o Firefox não captura áudio da tela.

### Nuvem (sem depender do PC de alguém)

Para um grupo de amigos, o projeto já traz uma publicação pronta com **Render + Supabase**:
o servidor Socket.IO fica no Render e o estado (perfis, servidores, canais e mensagens)
fica no Postgres do Supabase. O passo a passo, a tabela SQL e as variáveis secretas estão em
[DEPLOY.md](DEPLOY.md). Depois de publicado, todos usam a mesma URL HTTPS e o desktop a
guarda como “Continuar no último servidor”.

---

## Colocando os amigos dentro

O navegador só libera captura de tela em **contexto seguro**: `localhost` ou HTTPS. Para
você funciona de cara; para os amigos, o endereço precisa ser HTTPS.

### Link público (funciona de qualquer lugar)

No app: **Hospedar aqui → Criar link público**. Ele usa o
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/):

```bash
winget install --id Cloudflare.cloudflared
```

Sem o app, o mesmo efeito na mão, com o `npm start` rodando em outro terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

> A URL do `trycloudflare` muda toda vez que o túnel reabre. Servidores e membros continuam
> salvos; só o link de convite antigo para de valer — pegue o novo em *⋮ → Convidar amigos*.

### Mesma casa, mesmo Wi-Fi

```bash
npm run cert
```

Gera um certificado próprio; o servidor passa a subir em HTTPS sozinho. Passe o
`https://192.168.x.x:3000` que aparece no terminal. O aviso de "conexão não é particular" é
esperado — *Avançado → Prosseguir*.

### Se alguém ficar sem imagem

Em quase toda rede doméstica o P2P conecta direto. Falha em CGNAT e NAT simétrico (comum em
internet via rádio e 4G/5G). O conserto é um servidor TURN:

```bash
TURN_URL=turn:host:3478 TURN_USER=usuario TURN_PASS=senha npm start
```

Metered, Twilio e Xirsys têm plano gratuito. Em **Status**, dentro da sala, dá para ver qual
rota cada conexão está usando.

---

## Conta

Entrar exige **nickname e senha** — sem e-mail. A conta fica salva no banco (Supabase, na
nuvem), não no navegador: o mesmo login funciona em qualquer computador ou no app desktop.
Quem já usava o app antes dessa versão (sem senha nenhuma) vê, na aba "Criar conta", uma
opção pra proteger a conta que já existia com um nickname e senha novos — os servidores e o
avatar continuam os mesmos.

No app desktop, **Ctrl+Alt+Shift+D** abre uma janela própria de desenvolvedor, protegida por
senha (padrão `dislackso-dev`, troque assim que entrar — a opção fica na própria janela). Lá
dá pra sobrescrever o servidor usado pelo app, ligar/desligar aceleração de hardware e
transparência, forçar checagem de atualização, abrir a pasta de dados e limpar o cache local.

---

## Usando

| Ação | Onde | Atalho |
|---|---|---|
| Criar servidor | **+** na barra da esquerda | |
| Criar canal de texto ou sala de voz | **⋮** ao lado do nome do servidor | |
| Abrir um canal de texto | Clicar em `# nome-do-canal` | |
| Convidar | **⋮** ao lado do nome do servidor | |
| Entrar na sala | Clicar no nome da sala | |
| Compartilhar tela | Botão na barra inferior | `S` |
| Mudo | Botão na barra inferior | `M` |
| Rabiscar na tela | Botão de caneta no canto do vídeo | `P` |
| Destacar / sair do destaque | Botão no canto do vídeo | `Esc` |
| Configurações | Engrenagem embaixo à esquerda | |

### Anotações

Qualquer pessoa na sala pode rabiscar sobre a transmissão, e todos veem — caneta, marcador
e seta, em seis cores. Os traços somem sozinhos depois de alguns segundos (ajustável, ou
nunca). Quem transmite pode desligar isso em *Configurações → Anotações*.

Os pontos são normalizados em relação ao quadro de vídeo, então o rabisco cai no mesmo lugar
mesmo com cada um numa janela de tamanho diferente.

### Qualidade

| Preset | Vídeo | Precisa de |
|---|---|---|
| 720p 30fps | 2,5 Mbps | qualquer coisa |
| 1080p 30fps | 4,5 Mbps | upload de ~6 Mbps |
| **1080p 60fps** (padrão) | 8 Mbps | upload de ~10 Mbps |
| 1440p 60fps | 12 Mbps | upload de ~15 Mbps e CPU boa |
| 4K 30fps | 16 Mbps | upload de ~20 Mbps e CPU muito boa |

E uma escolha de prioridade: **fluidez** (jogos e vídeo) ou **nitidez** (código e texto).

Diferente do Discord grátis, que trava em 720p30, aqui a resolução é mantida sob pressão de
banda: quando a rede aperta, o que cai é o FPS.

A malha é P2P — em 1080p60 para 3 amigos você envia 8 Mbps **para cada um**. Acima de umas 5
pessoas transmitindo ao mesmo tempo, o caminho seria um servidor SFU.

### Configurações

- **Voz e vídeo** — microfone e saída de áudio, volume de entrada com medidor, cancelamento
  de eco, redução de ruído, e modo *apertar para falar* com tecla configurável.
- **Transmissão** — qualidade, prioridade, destaque automático, prévia da própria tela.
- **Anotações** — permitir na sua tela, tempo até sumir, cor e espessura.
- **Tema e cores** — quatro temas, cor de destaque (inclusive personalizada), quanto os
  cantos são arredondados, e nível de transparência.
- **Animações** — ligar/desligar, velocidade, e aceleração de hardware.

Trocar de microfone não derruba a conexão: a faixa é substituída no lugar.

### Interface

Os ícones são SVG inline, na mesma grade 24×24 com traço de 2 e `currentColor` — nada de
emoji. Emoji muda de desenho, de tamanho e de linha-base conforme o sistema e a fonte, e era
a origem dos desalinhamentos em botões.

O layout responde em três pontos de quebra: em 1080px as colunas laterais encolhem; em 880px
os rótulos dos controles somem e sobra o ícone; em 680px a navegação das configurações vira
só ícones e as linhas de opção empilham. Janela baixa (menos de 560px) esconde a tira de
miniaturas para o palco não sumir.

---

## Como está montado

```
server/index.js        Express + Socket.IO: contas, servidores, convites, perfis, signaling
server.js              sobe o servidor sozinho (modo navegador)
desktop/main.js        Electron: janela, captura, atualização, painel de desenvolvedor
desktop/preload.js     ponte segura entre a interface e o Electron
desktop/dev-window.html/js  janela de desenvolvedor (protegida por senha)
desktop/dev-preload.js ponte isolada da janela de desenvolvedor
public/css/theme.css   tokens de design e os quatro temas
public/css/app.css     layout e componentes
public/css/motion.css  animações
public/js/config.js    endereço do servidor na nuvem (Render)
public/js/icons.js     ícones em SVG inline (sem emoji, sem CDN)
public/js/util.js      DOM, avisos, modais, upload, cache local
public/js/settings.js  preferências e sua aplicação no documento
public/js/rtc.js       motor WebRTC: negociação, codecs, bitrate, microfone
public/js/annotate.js  camada de rabisco
public/js/updater.js   tela de atualização do aplicativo
public/js/screens.js   configurações, perfil, seletor de telas
public/js/app.js       login, interface, salas, membros, destaque
scripts/gen-cert.js    certificado HTTPS local
scripts/gen-icon.js    ícone PNG + ICO, sem dependência de imagem
scripts/prep-build.js  conserta o cache do electron-builder no Windows
scripts/pack-portable.js  monta a versão portátil
.github/workflows/render-deploy.yml  redeploya o Render a cada Release
data/                  banco (db.json) e imagens enviadas, quando sem Supabase
```

Os detalhes que fazem a qualidade, em `public/js/rtc.js`:

- **VP9** preferido sobre VP8 — muito melhor em texto e interface parada.
- **`degradationPreference: 'maintain-resolution'`** — o padrão do navegador é derrubar a
  resolução quando a banda cai; aqui é o contrário.
- **`maxBitrate`/`maxFramerate` explícitos** — sem isso o Chrome limita perto de 2,5 Mbps.
- **`contentHint`** — diz ao codificador se é texto parado ou jogo em movimento.
- **Opus em estéreo forçado**, 256 kbps, sem DTX — o padrão do WebRTC é mono e corta
  silêncio, o que estraga música e áudio de jogo.
- **Perfect negotiation** com fila de sinais — dois lados podem começar a transmitir ao
  mesmo tempo, e uma oferta que chega antes do par existir localmente é guardada em vez de
  descartada.
- **Grafo de Web Audio no microfone** — volume de entrada e medidor de voz funcionam, e
  trocar de aparelho vira um `replaceTrack`, sem renegociar.

## Sobre segurança

Entrar no app exige nickname e senha (guardada como hash `scrypt`, nunca em texto puro). Já
entrar num **servidor** continua sendo por convite: o código **é** a credencial daquele
servidor específico, e quem tiver o link entra. Se um link vazar, use *Gerar novo convite* —
o antigo morre na hora.

Uploads aceitam só PNG, JPG, GIF e WEBP até 12 MB, e o servidor só grava caminhos que ele
mesmo gerou (não dá para apontar o avatar para uma URL externa).

Sem Supabase configurado, os dados ficam em `data/`, em texto puro, na sua máquina — modelo
certo para um grupo de amigos rodando localmente, não para algo público. Com Supabase (veja
[DEPLOY.md](DEPLOY.md)), o mesmo estado vive no Postgres deles, sob as políticas de acesso
que só o servidor (via `service_role`) enxerga.
