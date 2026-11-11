-- Lepus: categorias editáveis (criar, renomear, trocar ícone e escolher a área do plano).
-- Rode uma vez no SQL Editor do Supabase (seguro rodar de novo). Exige que o Plano do mês já exista
-- (rode antes o migracao_plano_do_mes.sql se ainda não rodou).

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
