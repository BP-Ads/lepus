-- =====================================================================
-- Lepus — schema Supabase
-- Cole inteiro no SQL Editor do Supabase e execute (pode rodar de novo: é idempotente).
-- Valores em CENTAVOS (bigint). Datas de vencimento são sempre datas reais (uma linha por mês).
-- =====================================================================

-- ---------- Quem pode usar o app (allowlist) ----------
create table if not exists public.allowed_users (
  email text primary key check (email = lower(email))
);
alter table public.allowed_users enable row level security;
-- Sem policies de propósito: ninguém lê/escreve pela API. Edite pelo SQL Editor.

-- Cadastre os e-mails autorizados (troque pelos reais, em minúsculas):
-- insert into public.allowed_users (email) values
--   ('seu-email@exemplo.com'), ('email-da-nanda@exemplo.com')
-- on conflict do nothing;

create or replace function public.is_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Tabelas ----------
create table if not exists public.contas (
  id              uuid primary key default gen_random_uuid(),
  grupo_id        uuid not null default gen_random_uuid(),   -- liga as ocorrências de uma fixa / parcelas
  nome            text not null check (char_length(btrim(nome)) between 1 and 120),
  valor_centavos  bigint not null check (valor_centavos > 0),
  categoria       text not null default 'outros',
  tipo            text not null check (tipo in ('fixa','parcelada','esporadica')),
  vencimento      date not null,
  dia_venc        smallint check (dia_venc between 1 and 31),
  parcela_atual   smallint,
  total_parcelas  smallint,
  obs             text not null default '' check (char_length(obs) <= 300),
  pago            boolean not null default false,
  pago_em         date,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists contas_vencimento_idx on public.contas (vencimento);
create index if not exists contas_grupo_idx on public.contas (grupo_id);
create index if not exists contas_pendentes_idx on public.contas (vencimento) where not pago;

create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('entrada','saida')),
  descricao       text not null check (char_length(btrim(descricao)) between 1 and 120),
  valor_centavos  bigint not null check (valor_centavos > 0),
  data            date not null,
  quem            text not null default 'Família' check (quem in ('Bruno','Nanda','Família')),
  categoria       text not null default 'outros',
  conta_id        uuid references public.contas(id) on delete cascade,  -- saída gerada ao pagar uma conta
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists lancamentos_data_idx on public.lancamentos (data);
create unique index if not exists lancamentos_conta_uidx on public.lancamentos (conta_id) where conta_id is not null;

create table if not exists public.orcamentos (
  categoria       text primary key,
  limite_centavos bigint not null check (limite_centavos > 0)
);

-- Controle de contas fixas que se repetem todo mês
create table if not exists public.series_fixas (
  grupo_id    uuid primary key,
  gerado_ate  date not null,            -- primeiro dia do último mês já gerado
  ativa       boolean not null default true
);

-- ---------- Entradas: já recebida ou ainda a receber ----------
-- Entradas existentes: as de data futura passam a "a receber"; as demais ficam como recebidas.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'recebido') then
    alter table public.lancamentos add column recebido boolean not null default true;
    update public.lancamentos set recebido = false where tipo = 'entrada' and data > current_date;
  end if;
end $$;

-- ---------- Segurança (RLS): só e-mails da allowlist ----------
alter table public.contas       enable row level security;
alter table public.lancamentos  enable row level security;
alter table public.orcamentos   enable row level security;
alter table public.series_fixas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contas','lancamentos','orcamentos','series_fixas'] loop
    execute format('drop policy if exists "acesso_allowlist" on public.%I', t);
    execute format(
      'create policy "acesso_allowlist" on public.%I for all to authenticated
         using ((select public.is_allowed())) with check ((select public.is_allowed()))', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on public.allowed_users from anon, authenticated, public;

-- ---------- Funções ----------
create or replace function public.dia_no_mes(p_ref date, p_dia int)
returns date
language sql immutable set search_path = ''
as $$
  select (date_trunc('month', p_ref::timestamp)::date
          + (least(p_dia, extract(day from (date_trunc('month', p_ref::timestamp) + interval '1 month - 1 day'))::int) - 1));
$$;

-- Pagar / desfazer pagamento: atualiza a conta e cria/remove a saída, tudo na mesma transação.
create or replace function public.marcar_paga(p_id uuid, p_pago boolean, p_data date default current_date)
returns void
language plpgsql set search_path = ''
as $$
declare c public.contas;
begin
  select * into c from public.contas where id = p_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if p_pago then
    update public.contas set pago = true, pago_em = p_data where id = p_id;
    insert into public.lancamentos (tipo, descricao, valor_centavos, data, quem, categoria, conta_id)
    values ('saida', c.nome, c.valor_centavos, p_data, 'Família', c.categoria, c.id)
    on conflict (conta_id) where conta_id is not null do nothing;
  else
    update public.contas set pago = false, pago_em = null where id = p_id;
    delete from public.lancamentos where conta_id = p_id;
  end if;
end $$;

-- Se o valor/nome/categoria de uma conta paga mudar, a saída acompanha.
create or replace function public.sync_lancamento_conta()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  update public.lancamentos
     set descricao = new.nome, valor_centavos = new.valor_centavos, categoria = new.categoria
   where conta_id = new.id;
  return new;
end $$;
drop trigger if exists trg_sync_lancamento_conta on public.contas;
create trigger trg_sync_lancamento_conta
  after update of nome, valor_centavos, categoria on public.contas
  for each row execute function public.sync_lancamento_conta();

-- Gera as ocorrências mensais de uma fixa até o mês de p_ate
create or replace function public.gerar_fixa(p_grupo uuid, p_ate date)
returns int
language plpgsql set search_path = ''
as $$
declare s public.series_fixas; t public.contas; m date; alvo date; n int := 0;
begin
  select * into s from public.series_fixas where grupo_id = p_grupo and ativa for update;
  if not found then return 0; end if;
  select * into t from public.contas where grupo_id = p_grupo order by vencimento desc limit 1;
  if not found then return 0; end if;
  m := s.gerado_ate;
  alvo := date_trunc('month', p_ate::timestamp)::date;
  while m < alvo loop
    m := (m + interval '1 month')::date;
    insert into public.contas (grupo_id, nome, valor_centavos, categoria, tipo, vencimento, dia_venc, obs)
    values (p_grupo, t.nome, t.valor_centavos, t.categoria, 'fixa', public.dia_no_mes(m, t.dia_venc), t.dia_venc, t.obs);
    n := n + 1;
  end loop;
  update public.series_fixas set gerado_ate = m where grupo_id = p_grupo;
  return n;
end $$;

create or replace function public.criar_fixa(
  p_nome text, p_valor_centavos bigint, p_categoria text, p_dia int, p_obs text, p_inicio date)
returns uuid
language plpgsql set search_path = ''
as $$
declare g uuid := gen_random_uuid(); ini date := date_trunc('month', p_inicio::timestamp)::date;
begin
  if p_dia is null or p_dia not between 1 and 31 then raise exception 'Dia de vencimento inválido'; end if;
  insert into public.contas (grupo_id, nome, valor_centavos, categoria, tipo, vencimento, dia_venc, obs)
  values (g, p_nome, p_valor_centavos, p_categoria, 'fixa', public.dia_no_mes(ini, p_dia), p_dia, coalesce(p_obs, ''));
  insert into public.series_fixas (grupo_id, gerado_ate) values (g, ini);
  perform public.gerar_fixa(g, (ini + interval '11 months')::date);
  return g;
end $$;

-- Mantém as fixas sempre geradas para os próximos 12 meses (o app chama ao abrir)
create or replace function public.estender_fixas(p_hoje date default current_date)
returns int
language plpgsql set search_path = ''
as $$
declare s record; n int := 0;
begin
  for s in select grupo_id from public.series_fixas where ativa loop
    n := n + public.gerar_fixa(s.grupo_id, (p_hoje + interval '12 months')::date);
  end loop;
  return n;
end $$;

-- Parcelada: cria da parcela atual até a última, uma por mês
create or replace function public.criar_parcelada(
  p_nome text, p_valor_centavos bigint, p_categoria text, p_dia int, p_obs text,
  p_inicio date, p_parcela_atual int, p_total int)
returns uuid
language plpgsql set search_path = ''
as $$
declare g uuid := gen_random_uuid(); ini date := date_trunc('month', p_inicio::timestamp)::date;
begin
  if p_dia is null or p_dia not between 1 and 31 then raise exception 'Dia de vencimento inválido'; end if;
  if p_total is null or p_total < 1 or p_total > 360 or p_parcela_atual is null
     or p_parcela_atual < 1 or p_parcela_atual > p_total then
    raise exception 'Parcelas inválidas';
  end if;
  insert into public.contas (grupo_id, nome, valor_centavos, categoria, tipo, vencimento, dia_venc,
                             parcela_atual, total_parcelas, obs)
  select g, p_nome, p_valor_centavos, p_categoria, 'parcelada',
         public.dia_no_mes((ini + make_interval(months => i))::date, p_dia), p_dia,
         p_parcela_atual + i, p_total, coalesce(p_obs, '')
  from generate_series(0, p_total - p_parcela_atual) as i;
  return g;
end $$;

-- Editar (sem mexer no status de pago). p_proximas = aplica também às ocorrências seguintes.
create or replace function public.editar_conta(
  p_id uuid, p_nome text, p_valor_centavos bigint, p_categoria text, p_obs text,
  p_dia int, p_data date, p_proximas boolean default false)
returns void
language plpgsql set search_path = ''
as $$
declare c public.contas;
begin
  select * into c from public.contas where id = p_id;
  if not found then raise exception 'Conta não encontrada'; end if;
  if c.tipo = 'esporadica' then
    update public.contas
       set nome = p_nome, valor_centavos = p_valor_centavos, categoria = p_categoria,
           obs = coalesce(p_obs, ''), vencimento = coalesce(p_data, vencimento)
     where id = p_id;
  else
    if p_dia is null or p_dia not between 1 and 31 then raise exception 'Dia de vencimento inválido'; end if;
    update public.contas
       set nome = p_nome, valor_centavos = p_valor_centavos, categoria = p_categoria,
           obs = coalesce(p_obs, ''), dia_venc = p_dia, vencimento = public.dia_no_mes(vencimento, p_dia)
     where id = p_id
        or (p_proximas and grupo_id = c.grupo_id and vencimento >= c.vencimento);
  end if;
end $$;

-- Excluir uma conta, ou ela e as próximas (encerra a fixa, sem recriar depois)
create or replace function public.excluir_conta(p_id uuid, p_proximas boolean default false)
returns void
language plpgsql set search_path = ''
as $$
declare c public.contas;
begin
  select * into c from public.contas where id = p_id;
  if not found then return; end if;
  if p_proximas and c.tipo <> 'esporadica' then
    delete from public.contas where grupo_id = c.grupo_id and vencimento >= c.vencimento;
    update public.series_fixas set ativa = false where grupo_id = c.grupo_id;
  else
    delete from public.contas where id = p_id;
  end if;
end $$;

-- Totais para o dashboard
-- entradas = só o que já foi recebido; saídas = lançadas até hoje.
create or replace function public.resumo(p_hoje date, p_fim_mes date)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'entradas', coalesce((select sum(valor_centavos) from public.lancamentos where tipo = 'entrada' and recebido), 0),
    'saidas',   coalesce((select sum(valor_centavos) from public.lancamentos where tipo = 'saida'   and data <= p_hoje), 0),
    'a_receber_ate_fim_mes', coalesce((select sum(valor_centavos) from public.lancamentos where tipo = 'entrada' and not recebido and data <= p_fim_mes), 0),
    'pendente_ate_fim_mes', coalesce((select sum(valor_centavos) from public.contas where not pago and vencimento <= p_fim_mes), 0),
    'atrasado', coalesce((select sum(valor_centavos) from public.contas where not pago and vencimento < p_hoje), 0)
  );
$$;

-- Permissões das funções: só usuários logados
do $$
declare f text;
begin
  foreach f in array array[
    'is_allowed()', 'dia_no_mes(date,int)', 'marcar_paga(uuid,boolean,date)', 'gerar_fixa(uuid,date)',
    'criar_fixa(text,bigint,text,int,text,date)', 'estender_fixas(date)',
    'criar_parcelada(text,bigint,text,int,text,date,int,int)',
    'editar_conta(uuid,text,bigint,text,text,int,date,boolean)', 'excluir_conta(uuid,boolean)',
    'resumo(date,date)', 'sync_lancamento_conta()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Tempo real ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.contas;      exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.lancamentos; exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------- Plano do mês: áreas de gasto com % da receita (editáveis) ----------
-- Modelo inicial: 25% liberdade financeira, 30% custos fixos, 15% conforto, 15% metas, 10% prazeres, 5% conhecimento.
create table if not exists public.areas (
  slug       text primary key,
  nome       text not null check (char_length(btrim(nome)) between 1 and 40),
  percentual numeric(5,2) not null check (percentual between 0 and 100),
  ordem      smallint not null default 0,
  minimo     boolean not null default false   -- true: a meta é um mínimo a atingir (ex.: investimentos)
);
create table if not exists public.planejamento (
  id               boolean primary key default true check (id),   -- uma única linha
  dizimo_pct       numeric(5,2) not null default 0 check (dizimo_pct between 0 and 100),
  receita_centavos bigint check (receita_centavos is null or receita_centavos > 0)  -- vazio = usa as entradas do mês
);

insert into public.areas (slug, nome, percentual, ordem, minimo) values
  ('liberdade',    'Liberdade financeira', 25, 1, true),
  ('fixos',        'Custos fixos',         30, 2, false),
  ('conforto',     'Conforto',             15, 3, false),
  ('metas',        'Metas',                15, 4, false),
  ('prazeres',     'Prazeres',             10, 5, false),
  ('conhecimento', 'Conhecimento',          5, 6, false)
on conflict (slug) do nothing;

insert into public.planejamento (id) values (true) on conflict (id) do nothing;

alter table public.areas          enable row level security;
alter table public.planejamento   enable row level security;
do $$
declare t text;
begin
  foreach t in array array['areas','planejamento'] loop
    execute format('drop policy if exists "acesso_allowlist" on public.%I', t);
    execute format(
      'create policy "acesso_allowlist" on public.%I for all to authenticated
         using ((select public.is_allowed())) with check ((select public.is_allowed()))', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Categorias editáveis (ligadas às áreas do plano) ----------
create table if not exists public.categorias (
  slug   text primary key check (slug ~ '^[a-z0-9_-]{1,40}$'),
  nome   text not null check (char_length(btrim(nome)) between 1 and 30),
  icone  text not null default 'package' check (char_length(icone) between 1 and 40),
  tipo   text not null check (tipo in ('gasto','entrada')),
  area   text references public.areas(slug) on delete set null,   -- só categorias de gasto entram no plano
  ordem  smallint not null default 0,
  check (tipo = 'gasto' or area is null)
);

insert into public.categorias (slug, nome, icone, tipo, area, ordem) values
  ('moradia','Moradia','house','gasto','fixos',1), ('alimentacao','Alimentação','utensils','gasto','fixos',2),
  ('saude','Saúde','heart-pulse','gasto','fixos',3), ('transporte','Transporte','car','gasto','fixos',4),
  ('servicos','Serviços','zap','gasto','fixos',5), ('emprestimo','Empréstimo','landmark','gasto','fixos',6),
  ('cartao','Cartão','credit-card','gasto','conforto',7), ('conforto','Conforto','sofa','gasto','conforto',8),
  ('lazer','Lazer','gamepad-2','gasto','prazeres',9), ('educacao','Educação','graduation-cap','gasto','conhecimento',10),
  ('metas','Metas','plane','gasto','metas',11), ('investimentos','Investimentos','trending-up','gasto','liberdade',12),
  ('outros','Outros','package','gasto','conforto',13),
  ('salario','Salário','banknote','entrada',null,20), ('beneficio','Benefício','gift','entrada',null,21), ('extra','Extra','briefcase','entrada',null,22)
on conflict (slug) do nothing;

-- Quem já rodou a versão anterior do plano: leva o vínculo categoria→área para cá e remove a tabela antiga.
do $$
begin
  if to_regclass('public.categoria_area') is not null then
    update public.categorias c set area = ca.area
      from public.categoria_area ca
     where ca.categoria = c.slug and c.tipo = 'gasto' and exists (select 1 from public.areas a where a.slug = ca.area);
    drop table public.categoria_area;
  end if;
end $$;

alter table public.categorias enable row level security;
drop policy if exists "acesso_allowlist" on public.categorias;
create policy "acesso_allowlist" on public.categorias for all to authenticated
  using ((select public.is_allowed())) with check ((select public.is_allowed()));
revoke all on public.categorias from anon, public;
grant select, insert, update, delete on public.categorias to authenticated;

-- Exclui uma categoria movendo tudo o que usa ela para outra (de uma vez só).
create or replace function public.excluir_categoria(p_slug text, p_destino text)
returns void
language plpgsql set search_path = ''
as $$
declare tp text;
begin
  if p_slug = 'outros' then raise exception 'A categoria "Outros" não pode ser excluída'; end if;
  select tipo into tp from public.categorias where slug = p_slug;
  if tp is null then raise exception 'Categoria não encontrada'; end if;
  if exists (select 1 from public.lancamentos where categoria = p_slug)
     or exists (select 1 from public.contas where categoria = p_slug) then
    if p_destino is null or p_destino = p_slug
       or not exists (select 1 from public.categorias where slug = p_destino) then
      raise exception 'Escolha para qual categoria mover os lançamentos';
    end if;
    update public.lancamentos  set categoria = p_destino where categoria = p_slug;
    update public.contas       set categoria = p_destino where categoria = p_slug;
  end if;
  delete from public.orcamentos where categoria = p_slug;
  delete from public.categorias where slug = p_slug;
end $$;
revoke all on function public.excluir_categoria(text,text) from public, anon;
grant execute on function public.excluir_categoria(text,text) to authenticated;
