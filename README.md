# DiSlackso

Servidores privados, compartilhamento de tela em alta resolução e anotação ao vivo — como
app de PC ou pelo navegador.

O vídeo e o áudio vão **direto de um computador para o outro** (WebRTC P2P). O servidor só
apresenta as pessoas umas às outras e guarda servidores, convites e perfis — ele nunca vê a
sua tela.

---

## Rodando

### Como app de PC (recomendado)

```bash
npm install
```

```bash
npm run desktop
```

Abre o lançador, onde você escolhe:

- **Hospedar aqui** — seu PC vira o servidor. Um botão cria um link público (HTTPS) para os
  amigos entrarem de qualquer lugar.
- **Conectar** — entrar num servidor que já existe.

O app tem duas vantagens sobre o navegador: **seletor de tela próprio** com miniaturas, e
**áudio do sistema no Windows** sem depender da caixinha do Chrome.

### Empacotando para os amigos

**Versão portátil** — funciona sempre, sem instalador e sem admin:

```bash
npm run portable
```

Sai `dist/DiSlackso-portable/` (~277 MB). Zipe a pasta e mande; eles rodam `DiSlackso.exe`
direto, escolhem "Conectar" e colam o seu link.

**Instalador .exe**:

```bash
npm run build
```

Gera `dist/DiSlackso-Setup-3.0.0.exe` (~79 MB). Instalador comum: escolhe pasta, cria atalho,
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

### Pelo navegador

```bash
npm start
```

Abra <http://localhost:3000>. Use Chrome ou Edge — o Firefox não captura áudio da tela.

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

## Usando

| Ação | Onde | Atalho |
|---|---|---|
| Criar servidor | **+** na barra da esquerda | |
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
server/index.js        Express + Socket.IO: servidores, convites, perfis, signaling
server.js              sobe o servidor sozinho (modo navegador)
desktop/main.js        Electron: janela, servidor embutido, túnel, captura de tela
desktop/preload.js     ponte segura entre a interface e o Electron
desktop/launcher.html  tela de escolher hospedar/conectar
public/css/theme.css   tokens de design e os quatro temas
public/css/app.css     layout e componentes
public/css/motion.css  animações
public/js/icons.js     ícones em SVG inline (sem emoji, sem CDN)
public/js/util.js      DOM, avisos, modais, upload, persistência
public/js/settings.js  preferências e sua aplicação no documento
public/js/rtc.js       motor WebRTC: negociação, codecs, bitrate, microfone
public/js/annotate.js  camada de rabisco
public/js/screens.js   configurações, perfil, seletor de telas
public/js/app.js       interface, salas, destaque
scripts/gen-cert.js    certificado HTTPS local
scripts/gen-icon.js    ícone PNG + ICO, sem dependência de imagem
scripts/prep-build.js  conserta o cache do electron-builder no Windows
scripts/pack-portable.js  monta a versão portátil
data/                  banco (db.json) e imagens enviadas
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

Não há senha: o convite **é** a credencial. Quem tiver o código entra. Se um link vazar, use
*Gerar novo convite* — o antigo morre na hora.

Uploads aceitam só PNG, JPG, GIF e WEBP até 12 MB, e o servidor só grava caminhos que ele
mesmo gerou (não dá para apontar o avatar para uma URL externa).

Os dados ficam em `data/`, em texto puro, na sua máquina. É o modelo certo para um grupo de
amigos; não é o certo para algo público.
