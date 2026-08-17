# Publicar o DiSlackso para os amigos

Esta configuração usa **Supabase** para guardar o estado (usuários, servidores,
canais e as últimas 200 mensagens de cada canal) e **Render** para rodar o
servidor Node/Socket.IO. Assim ninguém precisa manter o próprio computador
ligado para preservar os dados.

## 1. Criar o banco gratuito

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. Em **SQL Editor**, execute [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Project Settings > API**, copie a `Project URL` e a chave
   `service_role` (não a chave anônima). A chave `service_role` é segredo:
   nunca a coloque no app ou no GitHub.

## 2. Publicar o servidor

1. Envie este repositório para o GitHub e, no [Render](https://render.com),
   crie um Blueprint a partir dele. O arquivo `render.yaml` configura o
   serviço automaticamente.
2. Preencha as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` com os
   valores do passo anterior. Deixe `SUPABASE_DB_ROW_ID=main`.
3. Depois do deploy, abra a URL `https://…onrender.com` e mande-a aos amigos.
   No desktop, escolha **Conectar** uma vez; o endereço fica salvo e aparece
   como “Continuar no último servidor” ao reabrir.

## Transmissão para redes difíceis

O app já usa STUN público. Algumas operadoras e CGNAT exigem TURN, caso em que
a chamada pode conectar mas a tela não chega a uma pessoa específica. Configure
um serviço TURN e preencha `TURN_URL`, `TURN_USER` e `TURN_PASS` no Render;
o servidor entrega essas credenciais aos clientes ao entrar na sala.

## Deploy automático a cada Release

Quando você publica um Release no GitHub (o mesmo que os apps desktop usam
pra se auto-atualizar), o workflow `.github/workflows/render-deploy.yml`
dispara um redeploy no Render — assim o servidor (e o estado que ele
espelha no Supabase) fica sempre na mesma versão que os clientes acabaram
de baixar. Passo único, manual, pra ligar isso:

1. No Render, abra o serviço → **Settings → Deploy Hook** e copie a URL.
2. No GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, nome `RENDER_DEPLOY_HOOK_URL`, valor a URL copiada.

Sem esse secret o workflow roda e não faz nada (não fica com erro). O
Render também já redeploya sozinho a cada `git push` na branch conectada
(comportamento padrão dele) — esse hook cobre especificamente o momento do
Release, inclusive quando ele é criado sem um push novo.

## Limites importantes

O plano gratuito do Supabase inclui 500 MB de banco, 50 mil usuários ativos
mensais e pausa projetos depois de uma semana sem uso. O Render gratuito é
adequado para amigos/testes, mas adormece após 15 minutos sem tráfego e a
primeira conexão pode levar cerca de um minuto. Para uma sala que precisa
estar sempre pronta, o próximo passo é trocar apenas o plano do servidor;
nenhum dado precisa migrar porque continua no Supabase.
