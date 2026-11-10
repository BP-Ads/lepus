# Lepus — seu copiloto financeiro (PWA + Supabase)

App estático (HTML/JS) hospedado no GitHub Pages, com banco e login no Supabase.

```
index.html · app.js · config.js · sw.js · manifest.json · icons/ · assets/ (logo)
supabase/schema.sql              ← tabelas, regras de segurança (RLS) e funções
supabase/importar_firebase.py    ← (opcional) traz os dados antigos do Firebase
```

## 1. Supabase (uma vez)

1. Crie/escolha o projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole todo o `supabase/schema.sql` → *Run*.
3. Ainda no SQL Editor, autorize os e-mails que podem usar o app (minúsculas):
   ```sql
   insert into public.allowed_users (email) values
     ('seu-email@exemplo.com'), ('email-da-nanda@exemplo.com');
   ```
4. **Authentication → Providers → Email**: desligue *Allow new users to sign up* e crie os dois usuários em *Authentication → Users → Add user* (marque *Auto Confirm*). Assim ninguém consegue criar conta por conta própria. (Mesmo que criasse, as regras RLS só liberam os e-mails da lista acima.)
5. *(Opcional)* Login com Google: **Authentication → Providers → Google** (precisa de um Client ID/Secret do Google Cloud). Em **Authentication → URL Configuration** coloque:
   - *Site URL*: `https://SEU-USUARIO.github.io/NOME-DO-REPO/`
   - *Redirect URLs*: a mesma URL.
6. **Project Settings → API**: copie a *Project URL* e a *publishable (anon) key* para o `config.js`.
   A chave publishable é pública por design e pode ir pro GitHub. **Nunca** coloque a `service_role`/secret key no código.

## 2. GitHub Pages

1. Suba esta pasta para um repositório (a raiz do repo = esta pasta).
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. Abra `https://SEU-USUARIO.github.io/NOME-DO-REPO/` e, no celular, *Adicionar à tela inicial*.

O app usa caminhos relativos, então funciona com qualquer nome de repositório.
Para publicar uma atualização, basta dar push: o HTML/JS são buscados da rede primeiro, o cache só entra offline.

## 3. Trazer os dados do Firebase (opcional)

1. Firebase Console → Realtime Database → ⋮ → *Exportar JSON* → `firebase.json`.
2. `python3 supabase/importar_firebase.py firebase.json > importacao.sql`
3. Cole o `importacao.sql` no SQL Editor e execute (roda numa transação).
4. Confira a aba *Lançamentos*: no app antigo, conta paga **e** saída lançada à mão contavam duas vezes; apague as duplicadas.

> ⚠️ **Depois de exportar, feche o Firebase:** em *Realtime Database → Regras* use
> `{ "rules": { ".read": false, ".write": false } }` — enquanto estava com `LOGIN_ATIVO = false`, o banco antigo pode ter ficado aberto a qualquer pessoa com o link.

## O que mudou em relação à versão anterior

| Problema | Correção |
|---|---|
| Login desligado / banco aberto | Login Supabase obrigatório + RLS com lista de e-mails autorizados |
| Saldo somava contas de meses futuros | **Saldo atual** (só até hoje) × **Previsto no fim do mês** × **A pagar no mês** |
| Pagar conta + lançar saída = desconto duplo | Marcar como paga cria a saída automaticamente (e desfazer remove) |
| Fixas não se repetiam | Geradas 12 meses à frente e renovadas sozinhas ao abrir o app |
| Parcelas não avançavam | Ao criar “3/12”, já nascem 3/12, 4/12 … 12/12, uma por mês |
| Atrasadas só do mês aberto | Atrasadas de qualquer mês aparecem no dashboard e no filtro |
| “Vence hoje” dependia da hora | Datas comparadas como `AAAA-MM-DD`, sem fuso |
| Editar conta paga “despagava” | Edição não mexe no status; saída acompanha valor/nome |
| XSS em `innerHTML` | Todo texto passa por `esc()`; sem `onclick` inline; CSP restritiva |
| Dinheiro em float | Valores em centavos (`bigint`); entrada aceita `1.250,90` |
| Busca de todo o banco a cada ação | Consultas só do mês + totais calculados no banco; atualização em tempo real |
| SW cache-first, cacheava tudo | Rede primeiro para código, cache só para ícones; só mesma origem |
| Manifest/ícones/theme-color | Ícones `any` e `maskable` separados, `apple-touch-icon`, cor única |
| Sem análise por pessoa / orçamento / exportação | Aba Análise: por pessoa, por categoria com orçamento, 6 meses, CSV |

## Observações

- A CSP no `index.html` libera só `*.supabase.co` e `cdn.jsdelivr.net`. Se usar domínio próprio no Supabase, ajuste `connect-src`.
- O ícone é novo (barras + moeda). Para usar o seu, substitua os PNGs de `icons/` mantendo os nomes.
- Para encerrar uma conta fixa (ex.: cancelou a internet), exclua com **“Esta e as próximas”**.
