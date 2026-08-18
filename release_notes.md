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
