-- Execute no SQL Editor do projeto Supabase. A service-role key nunca vai
-- para o aplicativo: ela fica somente nas variáveis do serviço Render.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{"users":{},"guilds":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Não criamos políticas públicas: apenas o servidor, usando service_role,
-- pode ler/escrever. Os clientes falam exclusivamente com o servidor.
