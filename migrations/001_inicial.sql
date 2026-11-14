-- Esquema inicial do Shaq o Betta.
-- Horários são sempre guardados em UTC (timestamptz); o fuso de exibição fica em configuracao.

create table usuario (
  id smallint primary key default 1 check (id = 1),      -- app de uso único: uma só linha
  login text not null unique,
  senha_hash text not null,
  criado_em timestamptz not null default now()
);

create table sessao (
  id bigserial primary key,
  token_hash bytea not null unique,                      -- só o hash do token; o token fica no cookie
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  expira_em timestamptz not null
);
create index sessao_expira_em_idx on sessao (expira_em);

create table configuracao (
  id smallint primary key default 1 check (id = 1),
  refeicoes_por_dia smallint not null default 2 check (refeicoes_por_dia between 1 and 6),
  bolinhas_por_refeicao smallint not null default 4 check (bolinhas_por_refeicao between 1 and 20),
  horarios text[] not null default array['08:00','20:00'],
  intervalo_troca_dias smallint not null default 7 check (intervalo_troca_dias between 1 and 60),
  luz_acende text not null default '06:00',
  luz_apaga text not null default '20:00',
  luz_ligada boolean not null default true,
  temp_minima numeric(4,1) not null default 22.0,
  temp_maxima numeric(4,1) not null default 27.0,
  fuso_horario text not null default 'America/Sao_Paulo',
  aviso_comer boolean not null default true,
  aviso_agua boolean not null default true,
  aviso_luz boolean not null default true,
  aviso_temp boolean not null default true,
  aviso_humor boolean not null default true,
  check (cardinality(horarios) = refeicoes_por_dia),
  check (temp_minima < temp_maxima)
);
insert into configuracao default values;

create table alimentacao (
  id bigserial primary key,
  quando timestamptz not null,
  bolinhas smallint not null check (bolinhas between 1 and 20)
);
create index alimentacao_quando_idx on alimentacao (quando desc);

create table limpeza (                                    -- troca de água
  id bigserial primary key,
  quando timestamptz not null,
  tipo text not null check (tipo in ('parcial', 'total'))
);
create index limpeza_quando_idx on limpeza (quando desc);

create table temperatura (
  id bigserial primary key,
  quando timestamptz not null,
  valor_celsius numeric(4,1) not null check (valor_celsius between 10 and 40)
);
create index temperatura_quando_idx on temperatura (quando desc);

create table humor (
  id bigserial primary key,
  quando timestamptz not null,
  tipo text not null check (tipo in ('ativo', 'calmo', 'bravo', 'apatico', 'escondendo'))
);
create index humor_quando_idx on humor (quando desc);

create table inscricao_push (                             -- dado sensível: nunca vai em logs nem em respostas
  id bigserial primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create table aviso_enviado (                              -- evita avisar duas vezes a mesma coisa
  chave text primary key,
  enviado_em timestamptz not null default now()
);
