-- Lepus: entradas com status "recebida" / "a receber".
-- Rode uma vez no SQL Editor do Supabase (seguro rodar de novo).

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
