### Versão 4.1.0

Foco numa correção crítica de persistência (contas e fotos que sumiam sozinhas), controle de
verdade pro dono do servidor, e três bugs de sala corrigidos na raiz.

**Correção crítica — contas e fotos sumindo sozinhas**

* Causa raiz de "todo mundo perdeu a conta" e das fotos somem a cada atualização do servidor:
  quando a leitura do Supabase falhava num redeploy (projeto hibernado no plano gratuito, rede
  fria no boot do Render), o servidor subia com o banco vazio — e o primeiro salvamento gravava
  esse vazio por cima do estado de todo mundo, sem volta. Agora o espelhamento tem quatro
  defesas em camadas: nunca grava antes de conseguir ler o remoto pelo menos uma vez; nunca
  grava um banco sem usuários por cima de um estado que já teve usuários; insiste várias vezes
  antes de desistir de restaurar (e continua tentando em segundo plano depois); e salva de
  forma síncrona ao fechar o processo, pra nada se perder na janela entre uma mensagem/foto
  chegar e o servidor ser reiniciado no deploy seguinte.

**Administração**

* **Dono do servidor ganha controle de verdade**, tudo pelo botão direito: expulsar um membro
  (derruba as sessões dela, inclusive da sala de voz) e mover alguém de sala de voz. Criar
  canal deixou de ser liberado pra qualquer membro — agora segue a mesma regra de excluir,
  convidar e editar.
* Uma coroa aparece ao lado do nome do dono, na lista de membros e nas salas de voz.

**Sala de voz e transmissão**

* **Áudio sumia ao abrir o chat:** abrir um canal de texto durante uma chamada silenciava todo
  mundo pro seu lado (mas todo mundo continuava te ouvindo). Corrigido.
* **Tela cheia ficava preta:** entrar em tela cheia (ou sair dela) podia deixar o vídeo em
  preto, sem recuperar sozinho — só voltar pra grade "consertava". Corrigido pra sempre
  recuperar o vídeo ao trocar de modo.
* **Fita de participantes amassada:** a fileira de participantes sob o tile destacado ficava
  com vão sobrando e uma barra de rolagem vertical sem motivo. Corrigido.
* **Mudo e ensurdecido agora são preferência de verdade:** ficam salvos e os dois botões são
  fixos no seu cartão de conta, dentro e fora de chamada. Entrar numa sala respeita como você
  estava antes (quem se mutou entra mudo, quem ensurdeceu entra ensurdecido) — sair da sala não
  zera mais isso.

**Perfil**

* **Prévia de avatar/banner em branco** na tela de conta, mesmo com a foto valendo no resto do
  app. Corrigido.
* **Imagens de perfil gigantes no banco:** uma foto de celular de 10 MB virava ~13 MB dentro do
  banco espelhado no Supabase a cada salvamento — um dos fatores por trás da corrupção de dados
  descrita acima. Agora a imagem é reduzida no próprio app pro tamanho em que é exibida antes de
  subir (avatar/ícone 512px, banner 1920px); GIF não é mexido, pra não perder a animação.

### Versão 4.0.3

Foco em administração, tela cheia de verdade na transmissão e uma correção séria de
persistência de imagens.

**Administração**

* **Conta administradora**, configurável no painel de desenvolvedor (`Ctrl+Alt+Shift+D` →
  Administração): essa conta passa por qualquer restrição de "só o dono pode" em qualquer
  servidor — excluir servidor, excluir sala, gerar convite. O ID da própria conta fica
  disponível pra copiar em *Configurações › Minha conta*.
* **Excluir canais de texto e salas de voz**, finalmente com um jeito de fazer isso pela
  interface: botão direito no canal → Excluir.

**Tela cheia, de verdade**

* Clicar em "Tela cheia" agora esconde o resto da interface (sidebar, chat, membros) e
  deixa só a transmissão, tela toda — como no YouTube. Os controles aparecem ao mexer o
  mouse e somem sozinhos depois de alguns segundos parado. Esc sai a qualquer momento, e
  se quem está transmitindo parar no meio, sai sozinho em vez de deixar uma tela preta.
* **Atalho `Shift+R`** reinicia o app instalado — útil pra testar uma atualização recém
  baixada sem fechar e abrir na mão.

**Correção séria — imagens de perfil sumindo**

* Avatar, banner e ícone de servidor tinham dois problemas em cadeia: o servidor salvava
  em disco, que é efêmero no Render (some a cada redeploy) — e a correção inicial disso
  (embutir a imagem direto no registro do usuário) estourava o limite de tamanho de
  mensagem do socket.io, fazendo salvar banner "não dar em nada". Agora a imagem vira um
  registro próprio, persistido/espelhado no Supabase igual o resto do banco, servido sob
  demanda por um link curto — o socket nunca carrega o arquivo inteiro.

**Interface**

* Ícone da bandeja do sistema, que nunca aparecia: o arquivo do ícone não estava sendo
  incluído no app empacotado.
* *Minha conta* e *Perfil* viraram uma seção só — foto e banner ficam editáveis ali dentro.
* Tela de Atualizações reformulada: link pras notas da versão instalada em vez de texto
  colado, e "Procurar atualizações" abre uma janela própria que acompanha checar → achar →
  baixar → reiniciar, tudo automático ao terminar.
* Aviso automático (com som) pra quem estiver com o app aberto quando uma versão nova é
  publicada — clicar já baixa e reinicia sozinho. Builda em CI agora (Windows e Linux, via
  GitHub Actions), então esse aviso só dispara depois que o instalador de cada plataforma
  termina de subir.
* Avatares cortados na fita de participantes e na grade, e um scroll vertical indevido:
  ajustes de tamanho e de onde cortar (ou não) o conteúdo de cada tile.
* O anel verde de "está falando" piscava a cada micropausa entre sílabas — agora tem uma
  margem de meio segundo antes de apagar, então acende uma vez e segura enquanto a
  conversa continua, em vez de piscar sem parar.

### Versão 4.0.2

Correções de interface da 4.0/4.0.1 e alguns pedidos recorrentes na chamada de voz.

**Chamada de voz**

* **Controles só em ícone, junto do seu cartão de conta.** A barra de mudo/tela/qualidade/
  sair deixou de flutuar por cima do palco e agora mora ao lado do seu nome, no rodapé da
  coluna de canais — como no Discord. Consequência boa: ela continua acessível mesmo com um
  canal de texto aberto por cima da sala, o que antes escondia os controles.
* **Ensurdecer (mudo completo).** Novo botão ao lado do microfone que para de ouvir todo
  mundo e muta o próprio microfone junto — pra quando você precisa sumir da conversa sem sair
  da sala. Reativar o microfone enquanto ensurdecido sai do modo sozinho, senão dava pra falar
  sem nunca ouvir a resposta.
* **Ícone de mudo/transmitindo também na lista de membros.** Antes só aparecia na lista de
  ocupantes da sala de voz; agora quem está numa chamada mostra o mesmo indicador na lista de
  membros do servidor, e o botão direito nela ganhou mutar-só-pra-mim/volume pra quem também
  estiver na sua sala.
* **Anti-retorno da call ao compartilhar áudio do sistema** (#13, por Ricardo Fuly): a opção
  de abaixar a voz da chamada enquanto você transmite com áudio agora tem níveis (silenciar,
  10%, 25%, 50% ou não alterar) em vez de só ligado/desligado — ajustável em
  *Configurações › Transmissão*.

**Interface**

* **Avisos foram para o topo da tela.** "Fulano entrou na sala", "começou a transmitir" etc.
  apareciam no rodapé, embaixo da barra de digitação e dos controles da chamada — de olho
  claramente errado. Agora aparecem no topo.
* **Painel de desenvolvedor legível de novo.** A tela de senha (`Ctrl+Alt+Shift+D`) carregava
  um CSS que não existe mais desde a reescrita da 4.0 e caía no estilo cru do navegador —
  texto quase invisível sobre fundo escuro. Painel reescrito com estilo próprio.
* **Botão de fechar das Configurações não fica mais em cima dos botões da janela** (minimizar/
  maximizar/fechar do Windows) no app desktop.
* **Fechar a janela não derruba mais a chamada.** O X da janela agora minimiza o app para a
  bandeja do sistema em vez de encerrar — a chamada de voz continua. Dá pra desligar esse
  comportamento em *Configurações › Aplicativo*, se preferir que o X feche o app de verdade.
* **Avisos duplicados em desenvolvimento:** o app registrava os eventos do servidor duas vezes
  ao carregar em modo de desenvolvimento (mensagem, entrada na sala, avisos — tudo em dobro).
  Não afetava o app instalado, mas atrapalhava testar; corrigido.

### Versão 4.0.1

Correções e melhorias pós-lançamento da Aurora 4.0.

**Transmissão de tela**

* **Seletor de tela no app desktop.** O Electron não abre o seletor nativo do sistema —
  quem decide o que aparece na lista somos nós. Agora existe uma modal própria com
  prévia das telas e janelas, filtro por tipo e toggle de áudio do sistema antes de
  confirmar — como no Discord.
* **Correções nos tiles de transmissão** e no fluxo de captura no desktop.

**Atalhos configuráveis** (#12)

* Mutar/desmutar microfone, iniciar/parar transmissão, apertar-para-falar e
  anotações agora têm atalhos editáveis em *Configurações › Atalhos*.
* Cada atalho pode ser regravado clicando no botão e pressionando a combinação
  desejada; dá pra restaurar o padrão de fábrica.

**Supressão de ruído com IA** (#8)

* Novo toggle **Suprimir ruído de fundo** em *Configurações › Voz e vídeo*, usando
  RNNoise (WebAssembly) em tempo real no microfone — reduz teclado, ventilador e
  barulho ambiente sem precisar de nada externo.
* O teste de microfone na mesma tela mostra o efeito ao vivo.

**Outros**

* CORS do servidor ajustado para o fluxo de captura no desktop.
* Ícones do favicon e da tela de carregamento atualizados.

### Versão 4.0.0

Uma reescrita da base do app. Por fora, o DiSlackso faz exatamente o que fazia — nada de
servidores, conversas, perfis ou preferências se perde. Por dentro, quase tudo mudou de
lugar, e é isso que faz as próximas mudanças serem viáveis.

**Por que existiu**

O 3.5 tinha arquivos de mil e quinhentas linhas em que interface, estado e rede se
misturavam. Mexer numa parte significava ler o resto, e cada correção tinha chance real de
quebrar outra coisa. A 4.0 quebra isso em 99 arquivos, nenhum passando de 200 linhas.

**Interface**

* **Vidro líquido de verdade.** As superfícies agora têm aro (luz em cima, sombra embaixo,
  por dentro) e um brilho especular que acompanha o ponteiro — é o que dá a sensação de
  vidro espesso em vez de fundo translúcido. Onde o navegador permite, entra também uma
  refração real, que curva o que passa por baixo.
* **Movimento que carrega significado.** O marcador do trilho desliza entre servidores em
  vez de piscar de um lado para o outro. Os tiles deslizam entre a grade e o destaque em
  vez de sumir e reaparecer. As linhas de participante entram e saem por altura.
* **Avisos empilham.** Antes, um aviso novo apagava o anterior, e mensagens que importam
  ("fulano começou a transmitir") sumiam antes de serem lidas.
* **Os avatares pararam de piscar.** A presença chega toda vez que alguém abre ou fecha o
  microfone — várias vezes por minuto numa conversa. A lista agora reaproveita as linhas em
  vez de recriá-las, e a foto não recarrega.

**Correções de interface**

Modais, menus e dicas passaram a se apoiar em primitivas acessíveis, e com isso um conjunto
inteiro de defeitos deixou de existir por construção:

* menu de botão direito que abria para fora da tela perto da borda;
* modal que não fechava no Escape, ou que deixava o foco escapar para trás dele;
* dois modais empilhados sem saber qual respondia ao teclado;
* rolagem do fundo continuando enquanto um modal estava aberto.

**Robustez**

* **Rede que bloqueia WebSocket.** Em rede de escola ou empresa o app ficava parado na tela
  de entrada, sem explicação. Agora ele cai para long-polling sozinho.
* **App de PC em contexto seguro.** A interface passou a ser servida por um esquema próprio
  (`app://`) em vez de `file://`. Além de ser o que permite carregar o bundle novo, isso dá
  ao app um contexto seguro de verdade — microfone e captura de tela deixam de depender de
  exceções que o Electron abria para arquivos locais.
* **Sua sessão sobrevive à atualização.** Como o armazenamento é separado por origem, mudar
  para `app://` deslogaria todo mundo e zeraria o tema. O app lê a origem antiga no primeiro
  boot e traz sessão e preferências.
* **Perfis não somem mais depois de um redeploy.** Havia um caminho em que, ao restaurar o
  estado do Supabase, todos os usuários apareceriam como "Desconhecido".

**Por baixo**

TypeScript em modo estrito no app inteiro, com os eventos de socket tipados um a um — o
tipo de erro em que se manda o campo errado para o servidor agora não compila. O motor de
mídia virou dez módulos (negociação, malha de pares, microfone, tela, prévia,
congestionamento, diagnóstico) e o servidor, catorze.

Nada do protocolo mudou: um app 3.x instalado continua conversando com este servidor.

### Versão 3.5.3

* **Correção — voltar da conversa pra transmissão:** depois de abrir um canal de texto enquanto
  estava numa sala de voz, não tinha como ver a transmissão de novo — clicar na própria sala de
  voz (que continuava marcada como ativa) não fazia nada, já que o app entendia que você "já
  estava lá" e ignorava o clique. Agora esse clique sempre volta pro palco.
* **Correção — fluxo de entrada:** o app entrava direto na tela de login e, se a sessão salva
  tivesse expirado, pulava sozinho pra aba "Criar conta" — sem deixar digitar a senha pra tentar
  de novo, obrigando a trocar de aba na mão toda vez. Agora existe uma tela de carregamento
  enquanto o login automático é tentado nos bastidores; se ele falhar por qualquer motivo, a
  tela de entrada sempre abre na aba **Entrar** (a de criar conta continua existindo, só não
  abre mais sozinha).
* **Melhoria — sons de feedback:** mutar e desmutar o microfone agora tocam um som curto, como
  entrar/sair da sala e as outras notificações já tocavam. Todos esses sons também ficaram bem
  mais perceptíveis — o volume estava tão baixo que na prática passava despercebido.
* **Correção — foto de perfil:** o limite de tamanho da foto de perfil era menor que o do banner
  (8 MB contra 12 MB) sem necessidade técnica — fotos de celular passam de 8 MB com facilidade,
  e o envio era recusado. Agora os dois aceitam até 12 MB, o mesmo que o servidor já suportava.
* **Novo — ícone de carregamento:** a nova tela de carregamento inicial usa um ícone (moinho de
  vento) em branco, girando enquanto o app tenta entrar sozinho com a sessão salva.

### Versão 3.5.2

* **Novo — ícone do app:** o DiSlackso ganhou um ícone novo (o "D" em balão de fala, gradiente
  azul/roxo), substituindo o desenho antigo em todo lugar — executável, instalador, atalho,
  favicon da aba do navegador e logo da tela de login.

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
