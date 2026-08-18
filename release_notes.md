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
