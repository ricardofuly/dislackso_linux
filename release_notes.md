### Versão 3.5.1

* **Novo — configurações do servidor:** o menu do servidor ganhou um botão **Configurações
  do servidor**, que junta troca de nome e de ícone num só lugar, com prévia ao vivo do
  ícone. Antes só dava pra trocar o ícone; renomear exigia mexer direto no banco. Só o dono
  do servidor pode editar — quem não é dono vê os campos desabilitados.
* **Novo — suporte a Linux:** graças a um PR do Ricardo Fuly, o build agora gera pacotes
  nativos para Linux (`.AppImage` e `.rpm`, este último cobrindo instalação via `dnf` no
  Fedora e derivados). Auto-atualização funciona pela versão `.AppImage`; o `.rpm` precisa
  ser reinstalado manualmente a cada versão nova — ver
  [DEPLOY.md](DEPLOY.md#publicar-o-dislackso-para-os-amigos).

### Versão 3.5.0

* **Correção:** o ícone do servidor (e os avatares de quem está numa sala de voz) ficavam
  piscando toda vez que alguém falava. Causa: a lista de servidores e a lista de ocupantes
  eram recriadas do zero a cada atualização de presença — e isso acontece várias vezes por
  minuto numa conversa normal, porque dispara também quando alguém liga/desliga o indicador
  de "falando". Agora essas listas só atualizam o que realmente mudou.
* **Novo — assistir transmissão sob demanda, como no Discord:** quando alguém compartilha a
  tela, os outros veem um card "AO VIVO" com uma prévia e um botão **Assistir transmissão**,
  em vez do vídeo tocando sozinho pra todo mundo. Só quem clicar em assistir recebe o vídeo
  de verdade — dá pra parar de assistir a qualquer momento, e quem está transmitindo pode
  ocultar a prévia (no painel flutuante) pra economizar recurso enquanto ninguém pediu pra
  ver ainda.
* **Novo — comunicados do painel de desenvolvedor:** o painel de dev (`Ctrl+Alt+Shift+D`)
  ganhou uma aba **Comunicados** pra mandar um aviso — com popup animado, som e (opcional)
  forçando a janela de quem tiver o app aberto a vir pra frente — pra todo mundo conectado
  na hora, em qualquer dispositivo. Precisa configurar uma chave (`ADMIN_KEY`) uma única vez
  — ver [DEPLOY.md](DEPLOY.md#avisos-pra-todo-mundo-painel-de-desenvolvedor).

### Versão 3.4.0 — foco em qualidade de transmissão

* **Qualidade adaptativa:** anunciar 1080p60 e entregar 4fps por causa de rede fraca é pior
  do que baixar sozinho pra um nível que a conexão sustenta de verdade. Agora o app
  acompanha as estatísticas reais da transmissão e, depois de alguns segundos consistentes
  de sufoco (FPS bem abaixo do combinado, banda como motivo confirmado), desce um degrau de
  qualidade automaticamente e avisa — em vez de ficar travado numa qualidade que a rede não
  aguenta.
* **Voz da call abaixada ao compartilhar áudio:** enquanto você transmite com áudio do
  sistema, a voz de quem está na chamada agora é abaixada automaticamente (não desligada) —
  reduz bastante o quanto ela vaza na sua transmissão. Dá pra desligar em
  *Configurações › Transmissão*. Importante: o Windows não separa áudio por aplicativo, então
  isso reduz mas não elimina 100% — pra eliminar de vez, configure uma saída de áudio
  separada pra voz (ver DEPLOY.md).
* **Painel flutuante ao compartilhar tela:** como no Slack — enquanto você transmite, aparece
  um painel flutuante com atalho pro microfone, pra caneta na sua própria tela e pra parar de
  transmitir, com botão de minimizar.
* **Menu de contexto nos usuários:** botão direito num membro da sala (na lista de membros ou
  na sala de voz) abre opções de mutar/desmutar só pra você, ajustar o volume individual, e
  adicionar/remover como amigo — amigos ficam salvos na sua conta (aparecem com uma estrela e
  sempre no topo da lista) e valem em qualquer dispositivo.
* **Anotações no próprio compartilhamento:** confirmado que, como no Slack, quando alguém
  rabisca na sua tela compartilhada, o rabisco já aparece na sua própria prévia também — não
  só pra quem está assistindo (precisa da opção "Ver a própria tela" ligada, que já vem
  ligada por padrão).

### Versão 3.3.6

* **Melhoria de conectividade:** amigos atrás de CGNAT ou NAT simétrico (comum em internet
  via rádio, 4G/5G, e algumas operadoras) ficavam presos em "conectando…" pra sempre, sem
  nenhuma pista do motivo. Duas mudanças:
  - O app agora inclui, por padrão, um retransmissor **TURN público e gratuito** (sem
    precisar configurar nada) como reforço quando a conexão direta não é possível — além do
    STUN público que já existia.
  - Depois de ~20s sem conseguir conectar com alguém, o app avisa que a rede provavelmente
    está bloqueando a conexão direta, em vez de ficar tentando de novo em silêncio pra sempre.
  - Pra um grupo que depende de conexão estável o tempo todo, configurar seu próprio TURN
    continua sendo o mais confiável — ver [DEPLOY.md](DEPLOY.md#transmissão-para-redes-difíceis).

### Versão 3.3.5

* **Correção crítica:** o botão "Reiniciar e instalar" da tela de atualização não fazia
  nada ao clicar. Causa: a caixa de confirmação ("Reiniciar agora?") abria por trás da
  própria tela de atualização — um problema de camadas (z-index) que já existia antes
  desta versão. Modais de confirmação agora sempre abrem por cima de qualquer tela.

### Versão 3.3.4

* **Correção:** os botões de minimizar/maximizar/fechar da janela (Windows) ficavam por
  cima de elementos da interface em algumas telas (login, configurações, atualização) —
  o app não reservava espaço pra essa faixa, só a tela principal fazia isso. Corrigido nas
  três telas.
* **Correção:** vários campos de texto dentro de modais (criar servidor, criar canal, entrar
  com convite, link de convite) não tinham o estilo escuro do app nem o foco suave —
  apareciam com a aparência crua do navegador, inclusive aquele contorno azul feio ao
  clicar. Faltava o atributo `type="text"` neles.
* **Correção/novo — compartilhar tela:**
  - Quando a captura com áudio do sistema falha (driver de som que não sustenta loopback —
    "Could not start audio source"), o app agora tenta de novo automaticamente **sem
    áudio**, sem reabrir o seletor. Antes isso travava o compartilhamento por completo.
  - Novo toggle **"Compartilhar áudio do sistema"** no seletor de tela, como no Discord —
    dá pra escolher transmitir com ou sem áudio antes mesmo de tentar.
  - Aviso deixado claro: áudio do sistema captura tudo que sai pelos seus alto-falantes
    agora, inclusive a voz de quem estiver na chamada — é uma limitação do Windows
    (loopback é do dispositivo de saída inteiro, não separa por app). Pra ouvir a chamada
    sem isso vazar pro compartilhamento, configure a saída de voz (Configurações › Voz e
    vídeo) para um dispositivo diferente do padrão do Windows.

### Versão 3.3.3

* **Correção:** o app abria o DevTools do Chromium sozinho toda vez que iniciava — parecia
  que ele "jogava" você numa tela de desenvolvedor sem pedir. Isso não acontece mais; o
  DevTools continua disponível via F12 quando você realmente precisar dele.
* **Correção:** com a tela de login travada (senha errada, por exemplo), não tinha como
  chegar em Configurações pra checar ou baixar uma atualização. Agora tem um ícone de
  engrenagem no canto da tela de login pra isso — com uma bolinha verde quando há versão nova.
* **Correção:** o painel de desenvolvedor não tinha barra de rolagem, escondendo as opções
  de baixo da janela. Corrigido.
* **Novo:** botão "Sair da conta" nas configurações de conta — desloga de propósito, sem
  precisar do painel de desenvolvedor. (O botão "Limpar dados locais" do painel de dev
  continua existindo, mas é pra troubleshooting: ele apaga tudo — sessão, cache e
  preferências — não é um botão de logout do dia a dia.)

### Versão 3.3.2

* **Correção:** compartilhar uma **janela específica** (não a tela inteira) no app desktop
  dava erro "Could not start audio source" e a captura não iniciava. O app tentava sempre
  pegar o áudio do sistema (loopback) junto do vídeo, mas o Windows só permite isso quando a
  captura é de uma tela inteira — pra uma janela isolada, agora o app captura só o vídeo.

### Versão 3.3.1

* **Correção:** quando o navegador/app tinha um `userId` salvo de uma instalação ou teste
  anterior que não existe mais no servidor, a tela de "proteger conta" travava com "Conta
  não encontrada", sem opção de criar uma conta nova. Agora, nesse caso, o app cai
  automaticamente para criar uma conta nova em vez de travar.

### Novidades na versão 3.3.0

* **Login por nickname e senha:** entrar agora exige nickname e senha — sem e-mail. A conta
  fica salva no banco (Supabase), então o mesmo login funciona em qualquer computador ou no
  app desktop. Quem já usava o app sem senha vê, na aba "Criar conta", a opção de proteger a
  conta existente com um nickname e senha novos, sem perder servidores nem avatar.
* **Lista de membros:** nova coluna à direita, como no Discord, mostrando quem do servidor
  está online e quem está offline, separados por seção. Dá pra abrir/fechar pelo ícone no
  topo do palco.
* **Painel de desenvolvedor:** `Ctrl+Alt+Shift+D` no app desktop abre uma janela própria,
  protegida por senha, com diagnóstico do app, checagem manual de atualização, opção de
  sobrescrever o servidor usado (pra testes), toggles de aceleração de hardware/transparência
  e limpeza de dados locais.
* **Convite corrigido no desktop:** o link de convite gerado dentro do app estava quebrado
  desde a migração pra nuvem (apontava para `file://`); agora aponta certo para o servidor.
* **Cache local:** perfil e lista de servidores agora aparecem na hora ao abrir o app,
  mesmo antes da conexão terminar — sincronizam de novo assim que o servidor responde.
* **Deploy automático:** publicar um Release no GitHub agora também redeploya o servidor no
  Render (e por consequência atualiza o que ele espelha no Supabase), além de avisar os apps
  instalados como já acontecia.

### Versão 3.2.0

* **Melhorias na interface:** Correção de problemas visuais e ajustes na exibição dos componentes.
* **Deploy e Persistência na Nuvem:** Melhor suporte para conexão com a aplicação hospedada na nuvem (Render + Supabase), permitindo que o aplicativo desktop mantenha o estado (perfis, servidores, canais e mensagens) persistente.
* **Documentação:** Atualização do README com instruções de como se conectar à versão em nuvem usando o app desktop.
* **Atualização automática:** Correções e melhorias nas mensagens do sistema de atualização nativa do app.
