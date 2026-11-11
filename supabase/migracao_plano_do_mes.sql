-- Lepus: Plano do mês (áreas de gasto com % da receita).
-- Rode uma vez no SQL Editor do Supabase (seguro rodar de novo: não sobrescreve o que você editou).

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
