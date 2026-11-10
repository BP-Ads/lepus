#!/usr/bin/env python3
"""
Converte o export JSON do Firebase Realtime Database em um arquivo SQL para o Supabase.

Como usar:
  1. Firebase Console -> Realtime Database -> menu ⋮ -> "Exportar JSON" (salve como firebase.json)
  2. python3 importar_firebase.py firebase.json > importacao.sql
  3. Abra o SQL Editor do Supabase (já com o schema.sql aplicado), cole o conteúdo e execute.

O que o script faz:
  - Converte valores (reais) para centavos, sem erro de ponto flutuante.
  - Contas fixas: agrupa pelo (nome, dia, categoria). Se o grupo ainda está ativo
    (última ocorrência no mês atual ou depois), cria a série para continuar sendo gerada.
  - Contas pagas viram também uma saída ligada à conta (como o app novo faz).
  - Lançamentos viram lançamentos.
  ⚠ No app antigo uma conta paga e uma saída lançada à mão eram contadas as duas vezes.
    Depois de importar, confira a aba Lançamentos e apague saídas que duplicam contas pagas.
"""
import json
import sys
import uuid
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def centavos(v):
    return int((Decimal(str(v)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def dia_no_mes(ano, mes0, dia):
    import calendar
    ult = calendar.monthrange(ano, mes0 + 1)[1]
    return date(ano, mes0 + 1, min(max(int(dia), 1), ult))


def itens(no):
    """Firebase pode exportar listas como arrays; normaliza para (chave, valor)."""
    if isinstance(no, list):
        return [(str(i), v) for i, v in enumerate(no) if v is not None]
    return list((no or {}).items())


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    dados = json.load(open(sys.argv[1], encoding="utf-8"))
    hoje = date.today()
    cats_validas = None  # categorias são texto livre; mantemos como estão
    out = ["begin;"]

    grupos_fixas = {}  # (nome, dia, categoria) -> dict(grupo, ultimo_mes)
    n_contas = n_lanc = 0

    for ano, meses in itens(dados.get("contas")):
        for mes, contas in itens(meses):
            for _, c in itens(contas):
                tipo = {"fixa": "fixa", "parcelada": "parcelada"}.get(c.get("tipo"), "esporadica")
                a, m0 = int(ano), int(mes)
                if tipo == "esporadica" and c.get("dataVenc"):
                    venc = date.fromisoformat(c["dataVenc"])
                else:
                    dia = c.get("dia") or c.get("diaParcela") or 1
                    venc = dia_no_mes(a, m0, dia)
                dia_venc = (c.get("dia") or c.get("diaParcela") or venc.day) if tipo != "esporadica" else None

                grupo = uuid.uuid4()
                if tipo == "fixa":
                    chave = (c.get("nome", ""), int(dia_venc), c.get("categoria", "outros"))
                    g = grupos_fixas.setdefault(chave, {"grupo": grupo, "ultimo": date(a, m0 + 1, 1)})
                    grupo = g["grupo"]
                    g["ultimo"] = max(g["ultimo"], date(a, m0 + 1, 1))

                cid = uuid.uuid4()
                pago = bool(c.get("pago"))
                cols = ["id", "grupo_id", "nome", "valor_centavos", "categoria", "tipo", "vencimento",
                        "dia_venc", "parcela_atual", "total_parcelas", "obs", "pago", "pago_em"]
                vals = [q(cid), q(grupo), q(str(c.get("nome", "Sem nome"))[:120]), centavos(c.get("valor", 0)),
                        q(c.get("categoria", "outros")), q(tipo), q(venc.isoformat()),
                        "null" if dia_venc is None else int(dia_venc),
                        c.get("parcelaAtual") if tipo == "parcelada" and c.get("parcelaAtual") else "null",
                        c.get("totalParcelas") if tipo == "parcelada" and c.get("totalParcelas") else "null",
                        q(str(c.get("obs", ""))[:300]), "true" if pago else "false",
                        q(venc.isoformat()) if pago else "null"]
                out.append(f"insert into public.contas ({','.join(cols)}) values ({','.join(map(str, vals))});")
                if pago:
                    out.append(
                        "insert into public.lancamentos (tipo,descricao,valor_centavos,data,quem,categoria,conta_id) values "
                        f"('saida',{q(str(c.get('nome', 'Sem nome'))[:120])},{centavos(c.get('valor', 0))},"
                        f"{q(venc.isoformat())},'Família',{q(c.get('categoria', 'outros'))},{q(cid)});")
                n_contas += 1

    atuais = date(hoje.year, hoje.month, 1)
    n_series = 0
    for g in grupos_fixas.values():
        if g["ultimo"] >= atuais:  # ainda ativa: continua sendo gerada
            out.append(f"insert into public.series_fixas (grupo_id, gerado_ate) values ({q(g['grupo'])}, {q(g['ultimo'].isoformat())});")
            n_series += 1

    for ano, meses in itens(dados.get("lancamentos")):
        for mes, lancs in itens(meses):
            for _, l in itens(lancs):
                if l.get("tipo") not in ("entrada", "saida"):
                    continue
                data = l.get("data") or dia_no_mes(int(ano), int(mes), 1).isoformat()
                quem = l.get("quem") if l.get("quem") in ("Bruno", "Nanda", "Família") else "Família"
                out.append(
                    "insert into public.lancamentos (tipo,descricao,valor_centavos,data,quem,categoria) values "
                    f"({q(l['tipo'])},{q(str(l.get('desc', 'Sem descrição'))[:120])},{centavos(l.get('valor', 0))},"
                    f"{q(data)},{q(quem)},{q(l.get('categoria', 'outros'))});")
                n_lanc += 1

    out.append("select public.estender_fixas(current_date);")
    out.append("commit;")
    print("\n".join(out))
    print(f"-- {n_contas} contas, {n_lanc} lançamentos, {n_series} séries de fixas ativas", file=sys.stderr)


if __name__ == "__main__":
    main()
