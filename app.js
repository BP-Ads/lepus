(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ===== Constantes =====
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const MESES_CURTOS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const SEMANA = ['dom','seg','ter','qua','qui','sex','sáb'];
  // categoria -> [ícone, nome]
  const CATS = {
    moradia: ['house','Moradia'], alimentacao: ['utensils','Alimentação'], saude: ['heart-pulse','Saúde'],
    transporte: ['car','Transporte'], educacao: ['graduation-cap','Educação'], lazer: ['gamepad-2','Lazer'],
    servicos: ['zap','Serviços'], emprestimo: ['landmark','Empréstimo'], cartao: ['credit-card','Cartão'],
    investimentos: ['trending-up','Investimentos'], conforto: ['sofa','Conforto'], metas: ['plane','Metas'],
    salario: ['banknote','Salário'], beneficio: ['gift','Benefício'], extra: ['briefcase','Extra'], outros: ['package','Outros']
  };
  const catIconName = (c) => (CATS[c] || CATS.outros)[0];
  const catNome = (c) => (CATS[c] ? CATS[c][1] : (c || 'Outros'));
  const PESSOAS = ['Bruno', 'Nanda', 'Família'];
  // Plano do mês: categorias de gasto (as de entrada ficam de fora) e modelo padrão
  const CATS_GASTO = Object.keys(CATS).filter((k) => !['salario', 'beneficio', 'extra'].includes(k));
  const AREA_ICONE = { liberdade: 'trending-up', fixos: 'house', conforto: 'sofa', metas: 'plane', prazeres: 'gamepad-2', conhecimento: 'graduation-cap' };
  const PLANO_PADRAO = { liberdade: 25, fixos: 30, conforto: 15, metas: 15, prazeres: 10, conhecimento: 5 };
  const MAPA_PADRAO = { investimentos: 'liberdade', moradia: 'fixos', alimentacao: 'fixos', saude: 'fixos', transporte: 'fixos', servicos: 'fixos',
    emprestimo: 'fixos', conforto: 'conforto', cartao: 'conforto', outros: 'conforto', metas: 'metas', lazer: 'prazeres', educacao: 'conhecimento' };

  // ===== Ícones (Lucide, embutidos em icons.js) =====
  const ICONS = window.LEPUS_ICONS || {};
  const ico = (nome, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[nome] || ''}</svg>`;
  const chip = (nome, tom = '', sm = false) => `<span class="chip ${tom} ${sm ? 'sm' : ''}">${ico(nome)}</span>`;
  function hidratarIcones(raiz = document) {
    raiz.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = ico(el.dataset.i); });
  }

  // ===== Helpers =====
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt = (centavos) => brl.format((centavos || 0) / 100).replace(/ /g, ' ');
  const soma = (arr) => arr.reduce((s, x) => s + Number(x.valor_centavos || 0), 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // "1.250,90" | "1250,9" | "1250.90" | "R$ 12" -> centavos (inteiro) ou NaN
  function parseValor(txt) {
    let s = String(txt ?? '').trim().replace(/[R$\s]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(Number(s) * 100);
  }
  const valorParaInput = (c) => (c / 100).toFixed(2).replace('.', ',');

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const diasNoMes = (y, m) => new Date(y, m + 1, 0).getDate();
  const hojeStr = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
  const maisDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
  const fmtDataCurta = (s) => { const [, m, d] = s.split('-').map(Number); return `${d} ${MESES_CURTOS[m - 1]}`; };
  // dias de a até b (b - a), ambos 'YYYY-MM-DD', sem efeito de fuso/horário
  const diffDias = (a, b) => {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  };
  const statusConta = (c) => {
    if (c.pago) return 'pago';
    const d = diffDias(hojeStr(), c.vencimento);
    if (d < 0) return 'atrasado';
    if (d <= 7) return 'proximo';
    return 'pendente';
  };
  const recorrente = (c) => c.tipo === 'fixa' || (c.tipo === 'parcelada' && c.parcela_atual < c.total_parcelas);

  function quandoTexto(c) {
    if (c.pago) return `Paga em ${fmtDataCurta(c.pago_em || c.vencimento)}`;
    const d = diffDias(hojeStr(), c.vencimento);
    if (d < 0) return `Venceu há ${plural(-d, 'dia', 'dias')}`;
    if (d === 0) return 'Vence hoje';
    if (d === 1) return 'Vence amanhã';
    if (d <= 7) return `Vence em ${d} dias`;
    return `Vence em ${fmtDataCurta(c.vencimento)}`;
  }
  function rotuloDia(s) {
    const d = diffDias(hojeStr(), s);
    if (d === 0) return 'Hoje';
    if (d === -1) return 'Ontem';
    if (d === 1) return 'Amanhã';
    const [y, m, dd] = s.split('-').map(Number);
    return `${SEMANA[new Date(y, m - 1, dd).getDay()]}, ${dd} de ${MESES_CURTOS[m - 1]}`;
  }

  let toastTimer;
  function toast(msg, erro = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (erro ? ' erro' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, erro ? 5000 : 2400);
  }

  const must = (res) => { if (res.error) throw res.error; return res.data; };
  const erroMsg = (e) => {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Tente de novo.';
    return m;
  };

  // ===== Estado =====
  const hoje0 = new Date();
  const S = {
    userId: null, email: '', ano: hoje0.getFullYear(), mes: hoje0.getMonth(), page: 'home',
    contas: [], lancs: [], atrasadas: [], proximas: [], resumo: {}, orc: {}, plano: null,
    filtroContas: 'todas', filtroLanc: 'todos', filtroQuem: 'todos',
    tipoConta: 'fixa', tipoLanc: 'entrada', excluindo: null, orcCat: null, token: 0
  };
  let sb = null;
  let canal = null;

  const acharConta = (id) => [...S.contas, ...S.atrasadas, ...S.proximas].find((c) => c.id === id);

  // ===== Boot / autenticação =====
  function mostrarLogin(msg) {
    $('tela-login').classList.add('open');
    $('app-root').style.display = 'none';
    const el = $('login-erro');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function boot() {
    hidratarIcones();
    marcarTema();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /COLE_AQUI/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY)) {
      mostrarLogin('Configure o config.js com a URL e a chave do Supabase (veja o README).');
      return;
    }
    if (!window.supabase) { mostrarLogin('Não foi possível carregar a biblioteca do Supabase. Verifique a conexão.'); return; }

    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    sb.auth.onAuthStateChange((evento, session) => {
      // setTimeout evita travar o cliente do Supabase ao chamar a API dentro do callback
      setTimeout(() => { if (session && session.user) entrar(session.user); else sair(); }, 0);
    });
  }

  async function entrar(user) {
    if (S.userId === user.id) return;
    S.userId = user.id;
    S.email = user.email || '';
    try {
      const permitido = must(await sb.rpc('is_allowed'));
      if (!permitido) {
        S.userId = null;
        await sb.auth.signOut();
        mostrarLogin('Este e-mail não tem permissão para usar o Lepus.');
        return;
      }
    } catch (e) {
      S.userId = null;
      mostrarLogin(erroMsg(e));
      return;
    }
    $('tela-login').classList.remove('open');
    $('app-root').style.display = 'block';
    $('login-senha').value = '';
    atualizarLabel();
    showPage('home');
    try { must(await sb.rpc('estender_fixas', { p_hoje: hojeStr() })); } catch (e) { console.warn('estender_fixas:', e); }
    await carregar();
    assinarMudancas();
  }

  function sair() {
    S.userId = null;
    if (canal && sb) { sb.removeChannel(canal); canal = null; }
    S.contas = []; S.lancs = []; S.atrasadas = []; S.proximas = []; S.resumo = {}; S.orc = {}; S.plano = null;
    fecharTodos();
    mostrarLogin('');
  }

  function assinarMudancas() {
    if (canal) return;
    let t;
    const recarregar = () => { clearTimeout(t); t = setTimeout(() => { if (S.userId) carregar(); }, 300); };
    canal = sb.channel('mudancas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, recarregar)
      .subscribe();
  }

  // ===== Dados =====
  async function carregar() {
    const tk = ++S.token;
    const hoje = hojeStr();
    const ini = ymd(S.ano, S.mes, 1);
    const fim = ymd(S.ano, S.mes, diasNoMes(S.ano, S.mes));
    try {
      const [c, l, atr, prox, res, orc, pa, pm, pp] = await Promise.all([
        sb.from('contas').select('*').gte('vencimento', ini).lte('vencimento', fim).order('vencimento'),
        sb.from('lancamentos').select('*').gte('data', ini).lte('data', fim).order('data', { ascending: false }),
        sb.from('contas').select('*').eq('pago', false).lt('vencimento', hoje).order('vencimento'),
        sb.from('contas').select('*').eq('pago', false).gte('vencimento', hoje).lte('vencimento', maisDias(7)).order('vencimento'),
        sb.rpc('resumo', { p_hoje: hoje, p_fim_mes: fim }),
        sb.from('orcamentos').select('*'),
        sb.from('areas').select('*').order('ordem'),
        sb.from('categoria_area').select('*'),
        sb.from('planejamento').select('*').limit(1)
      ]);
      if (tk !== S.token) return; // chegou resposta de uma navegação mais antiga
      S.contas = must(c); S.lancs = must(l); S.atrasadas = must(atr); S.proximas = must(prox);
      S.resumo = must(res) || {};
      S.orc = Object.fromEntries(must(orc).map((o) => [o.categoria, Number(o.limite_centavos)]));
      // O plano é opcional: se o SQL novo ainda não foi rodado, o resto do app segue normal.
      if (pa.error || pm.error || pp.error || !(pa.data || []).length) S.plano = null;
      else {
        const cfg = (pp.data || [])[0] || {};
        S.plano = {
          areas: pa.data.map((a) => ({ slug: a.slug, nome: a.nome, percentual: Number(a.percentual), ordem: a.ordem, minimo: !!a.minimo })),
          mapa: Object.fromEntries((pm.data || []).map((m) => [m.categoria, m.area])),
          dizimo: Number(cfg.dizimo_pct || 0),
          receita: cfg.receita_centavos != null ? Number(cfg.receita_centavos) : null
        };
      }
      renderizarTudo();
    } catch (e) {
      if (tk !== S.token) return;
      toast(erroMsg(e), true);
      const falha = `<div class="empty">${chip('triangle-alert', 'neg')}<p class="lead">Não foi possível carregar os dados</p>
        <p>${esc(erroMsg(e))}</p><button class="btn ghost" data-act="recarregar">Tentar de novo</button></div>`;
      ['home-content', 'contas-content', 'lancamentos-content'].forEach((id) => { $(id).innerHTML = falha; });
    }
  }

  function atualizarLabel() {
    const el = $('monthLabel');
    el.setAttribute('aria-label', `${MESES[S.mes]} de ${S.ano}`);
    el.innerHTML = `<span class="full" aria-hidden="true">${MESES[S.mes]} ${S.ano}</span><span class="short" aria-hidden="true">${MESES_CURTOS[S.mes][0].toUpperCase()}${MESES_CURTOS[S.mes].slice(1)} ${S.ano}</span>`;
  }

  // ===== Renderização =====
  function renderizarTudo() {
    if (S.page === 'home') renderHome();
    else if (S.page === 'contas') renderContas();
    else if (S.page === 'lancamentos') renderLancamentos();
    else if (S.page === 'analise') renderAnalise();
  }

  function rowConta(c) {
    const st = statusConta(c);
    const tom = st === 'atrasado' ? 'neg' : st === 'proximo' ? 'warn' : st === 'pago' ? '' : '';
    const parcela = c.tipo === 'parcelada' ? `, parcela ${c.parcela_atual}/${c.total_parcelas}` : '';
    const nota = c.obs ? `<div class="row-sub">${esc(c.obs)}</div>` : '';
    return `<li class="row">
      <button class="check" data-act="toggle-pago" data-id="${esc(c.id)}" aria-pressed="${c.pago}"
        aria-label="${c.pago ? 'Desfazer pagamento de' : 'Marcar como paga:'} ${esc(c.nome)}"><span>${ico('check')}</span></button>
      <button class="row-main" data-act="edit-conta" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nome)}">
        <div class="row-title ${c.pago ? 'done' : ''}"><span>${esc(c.nome)}</span>${c.tipo === 'fixa' ? `<span class="mini" title="Conta fixa">${ico('repeat')}<span class="sr-only">Fixa</span></span>` : ''}</div>
        <div class="row-sub ${tom}">${esc(quandoTexto(c) + parcela)}</div>${nota}
      </button>
      <div class="row-trail"><div class="amount ${c.pago ? 'done' : ''}">${fmt(c.valor_centavos)}</div><div class="row-note">${esc(catNome(c.categoria))}</div></div>
    </li>`;
  }

  function vazio(icone, titulo, texto, botao) {
    return `<div class="empty">${chip(icone)}<p class="lead">${esc(titulo)}</p>${texto ? `<p>${esc(texto)}</p>` : ''}${botao || ''}</div>`;
  }

  function renderHome() {
    const r = S.resumo || {};
    const saldoAtual = Number(r.entradas || 0) - Number(r.saidas || 0);
    const pendFim = Number(r.pendente_ate_fim_mes || 0);
    const recFim = Number(r.a_receber_ate_fim_mes || 0);
    const previsto = saldoAtual + recFim - pendFim;
    const mesNome = MESES[S.mes].toLowerCase();
    const fimLabel = `${pad(diasNoMes(S.ano, S.mes))}/${pad(S.mes + 1)}`;
    const entM = soma(S.lancs.filter((l) => l.tipo === 'entrada' && l.recebido));
    const recM = soma(S.lancs.filter((l) => l.tipo === 'entrada' && !l.recebido));
    const saiM = soma(S.lancs.filter((l) => l.tipo === 'saida'));
    const pagoM = soma(S.contas.filter((c) => c.pago));
    const totM = soma(S.contas);
    const pct = totM > 0 ? Math.round((pagoM / totM) * 100) : 0;

    let linha;
    const cond = recFim > 0 && pendFim > 0 ? 'Recebendo o que falta e pagando o que está em aberto'
      : recFim > 0 ? 'Recebendo o que falta' : 'Pagando o que está em aberto';
    if (pendFim === 0 && recFim === 0) linha = `Nenhuma conta em aberto nem entrada a receber até <strong>${fimLabel}</strong>.`;
    else if (previsto >= 0) linha = `${cond} até <strong>${fimLabel}</strong>, você termina ${esc(mesNome)} com <strong>${fmt(previsto)}</strong>.`;
    else linha = `${cond} até <strong>${fimLabel}</strong>, faltam <strong>${fmt(-previsto)}</strong> para fechar ${esc(mesNome)}.`;

    let html = `<div class="stack">
      <section class="hero" aria-label="Saldo">
        <img class="hero-symbol" src="./assets/symbol-hero.png" alt="" />
        <div class="hero-label">Saldo hoje</div>
        <div class="hero-value ${saldoAtual < 0 ? 'neg' : ''}">${fmt(saldoAtual)}</div>
        <p class="hero-line">${linha}</p>
      </section>`;

    const atencao = [...S.atrasadas, ...S.proximas];
    if (atencao.length) {
      html += `<section><div class="sec-head"><h2>Precisa de atenção${S.atrasadas.length ? `<span class="count">${plural(S.atrasadas.length, 'atrasada', 'atrasadas')}</span>` : ''}</h2></div>
        <ul class="ledger">${atencao.map(rowConta).join('')}</ul></section>`;
    }

    if (!S.contas.length && !S.lancs.length && !atencao.length) {
      html += vazio('wallet', `Nada registrado em ${mesNome}`, 'Lance uma entrada ou uma saída para ver o mês tomar forma.',
        '<button class="btn" data-act="novo-lanc">Novo lançamento</button>');
    } else {
      html += `<section><div class="sec-head"><h2>${esc(MESES[S.mes])} em números</h2></div>
        <ul class="ledger facts">
          <li class="row">${chip('arrow-down-left', 'pos')}<div class="fact-name">Entradas recebidas</div><div class="amount pos">${fmt(entM)}</div></li>
          ${recM ? `<li class="row">${chip('clock')}<div class="fact-name">A receber</div><div class="amount">${fmt(recM)}</div></li>` : ''}
          <li class="row">${chip('arrow-up-right', 'neg')}<div class="fact-name">Saídas</div><div class="amount neg">${fmt(saiM)}</div></li>
          <li class="row">${chip('circle-check')}<div class="fact-name">Contas pagas<div class="fact-sub">${totM ? `${pct}% de ${fmt(totM)}` : 'Nenhuma conta no mês'}</div></div><div class="amount">${fmt(pagoM)}</div></li>
          ${totM ? `<li class="meter-row"><div class="meter" role="progressbar" aria-label="Contas pagas no mês" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div></li>` : ''}
        </ul></section>`;
    }
    html += '</div>';
    $('home-content').innerHTML = html;
  }

  const GRUPOS = [
    ['atrasado', 'Atrasadas', 'neg'],
    ['proximo', 'Nos próximos 7 dias', 'warn'],
    ['pendente', 'Em aberto', ''],
    ['pago', 'Pagas', 'pos']
  ];

  function renderContas() {
    const f = S.filtroContas;
    document.querySelectorAll('#page-contas .tab').forEach((t) => t.setAttribute('aria-pressed', t.dataset.filtro === f));

    let lista = f === 'atrasado' ? S.atrasadas : S.contas;
    if (f === 'pendente') lista = lista.filter((c) => ['pendente', 'proximo'].includes(statusConta(c)));
    else if (f === 'pago') lista = lista.filter((c) => c.pago);

    if (!lista.length) {
      const msgs = {
        todas: ['Nenhuma conta neste mês', 'Cadastre as contas para acompanhar vencimentos e pagamentos.'],
        pendente: ['Nada em aberto', 'Todas as contas deste mês estão pagas.'],
        pago: ['Nenhuma conta paga ainda', 'Quando você marcar uma conta como paga, ela aparece aqui.'],
        atrasado: ['Nenhuma conta atrasada', 'Tudo em dia.']
      }[f];
      $('contas-content').innerHTML = vazio('inbox', msgs[0], msgs[1],
        f === 'todas' ? '<button class="btn" data-act="novo-conta">Adicionar conta</button>' : '');
      return;
    }

    let html = '';
    if (f !== 'atrasado') {
      const total = soma(S.contas), pago = soma(S.contas.filter((c) => c.pago));
      html += `<div class="stats3"><div><div class="s-label">Total</div><div class="s-val">${fmt(total)}</div></div>
        <div><div class="s-label">Pago</div><div class="s-val tone-pos">${fmt(pago)}</div></div>
        <div><div class="s-label">Falta</div><div class="s-val">${fmt(total - pago)}</div></div></div>`;
    }
    if (f === 'atrasado') {
      html += `<ul class="ledger">${lista.map(rowConta).join('')}</ul>`;
    } else {
      GRUPOS.forEach(([chave, titulo, tom]) => {
        const itens = lista.filter((c) => statusConta(c) === chave);
        if (!itens.length) return;
        html += `<div class="grp"><h3 class="grp-title ${tom}">${esc(titulo)}</h3><ul class="ledger">${itens.map(rowConta).join('')}</ul></div>`;
      });
    }
    $('contas-content').innerHTML = html;
  }

  function renderLancamentos() {
    document.querySelectorAll('#page-lancamentos .tab[data-filtro]').forEach((t) => t.setAttribute('aria-pressed', t.dataset.filtro === S.filtroLanc));
    document.querySelectorAll('#page-lancamentos .tab[data-quem]').forEach((t) => t.setAttribute('aria-pressed', t.dataset.quem === S.filtroQuem));

    let lista = S.lancs;
    if (S.filtroLanc !== 'todos') lista = lista.filter((l) => l.tipo === S.filtroLanc);
    if (S.filtroQuem !== 'todos') lista = lista.filter((l) => l.quem === S.filtroQuem);

    if (!lista.length) {
      const filtrado = S.filtroLanc !== 'todos' || S.filtroQuem !== 'todos';
      $('lancamentos-content').innerHTML = vazio('arrow-left-right',
        filtrado ? 'Nada com esses filtros' : `Nenhum lançamento em ${MESES[S.mes].toLowerCase()}`,
        filtrado ? 'Troque o tipo ou a pessoa para ver outros lançamentos.' : 'Registre entradas e saídas para acompanhar o mês.',
        filtrado ? '' : '<button class="btn" data-act="novo-lanc">Novo lançamento</button>');
      return;
    }

    const dias = [];
    lista.forEach((l) => {
      const ult = dias[dias.length - 1];
      if (ult && ult.data === l.data) ult.itens.push(l); else dias.push({ data: l.data, itens: [l] });
    });

    $('lancamentos-content').innerHTML = dias.map((d) => `<div class="grp"><h3 class="grp-title">${esc(rotuloDia(d.data))}</h3>
      <ul class="ledger">${d.itens.map((l) => {
        const ent = l.tipo === 'entrada';
        const pend = ent && !l.recebido;
        const sub = `${l.quem}, ${catNome(l.categoria)}${l.conta_id ? ' (conta paga)' : ''}${pend ? ', a receber' : ''}`;
        const lead = ent
          ? `<button class="check" data-act="toggle-recebido" data-id="${esc(l.id)}" aria-pressed="${!pend}" aria-label="${pend ? 'Marcar como recebida:' : 'Desfazer recebimento de'} ${esc(l.descricao)}"><span>${ico('check')}</span></button>`
          : chip(catIconName(l.categoria), 'neg');
        return `<li class="row${ent ? '' : ' lead-chip'}">${lead}
          <button class="row-main" data-act="edit-lanc" data-id="${esc(l.id)}" aria-label="Editar ${esc(l.descricao)}">
            <div class="row-title"><span>${esc(l.descricao)}</span>${l.conta_id ? `<span class="mini" title="Saída gerada por uma conta paga">${ico('link')}</span>` : ''}</div>
            <div class="row-sub">${esc(sub)}</div>
          </button>
          <div class="row-trail"><div class="amount ${pend ? '' : ent ? 'pos' : 'neg'}">${ent ? '+' : '−'}${fmt(l.valor_centavos)}</div></div>
        </li>`;
      }).join('')}</ul></div>`).join('');
  }

  function calcPlano() {
    const P = S.plano;
    if (!P) return null;
    const entradas = soma(S.lancs.filter((l) => l.tipo === 'entrada'));
    const base = P.receita != null ? P.receita : entradas;
    const dizimo = Math.round((base * P.dizimo) / 100);
    const dist = base - dizimo;
    const areaDe = (cat) => P.mapa[cat] || null;
    const saidas = S.lancs.filter((l) => l.tipo === 'saida');
    const abertas = S.contas.filter((c) => !c.pago);
    const linhas = P.areas.map((a) => {
      const meta = Math.round((dist * a.percentual) / 100);
      const gasto = soma(saidas.filter((l) => areaDe(l.categoria) === a.slug));
      const aPagar = soma(abertas.filter((c) => areaDe(c.categoria) === a.slug));
      const comp = gasto + aPagar;
      let tom, texto;
      if (a.minimo) {
        if (gasto === 0) { tom = 'falta'; texto = `Falta: nada lançado em ${a.nome.toLowerCase()} neste mês.`; }
        else if (gasto < meta) { tom = 'parcial'; texto = `Faltam ${fmt(meta - gasto)} para a meta.`; }
        else { tom = 'ok'; texto = gasto > meta ? `Meta batida, ${fmt(gasto - meta)} a mais.` : 'Meta batida.'; }
      } else if (comp === 0) { tom = 'neutro'; texto = 'Nada lançado ainda.'; }
      else if (comp > meta) { tom = 'over'; texto = `Passou ${fmt(comp - meta)} da meta.`; }
      else if (comp >= meta * 0.9) { tom = 'warn'; texto = `Perto do limite: restam ${fmt(meta - comp)}.`; }
      else { tom = 'ok'; texto = `Dentro da meta: restam ${fmt(meta - comp)}.`; }
      return { ...a, meta, gasto, aPagar, tom, texto };
    });
    const mapeadas = new Set(Object.keys(P.mapa));
    const semArea = soma(saidas.filter((l) => !mapeadas.has(l.categoria))) + soma(abertas.filter((c) => !mapeadas.has(c.categoria)));
    return { base, dizimo, dist, linhas, semArea, somaPct: P.areas.reduce((t, a) => t + a.percentual, 0), fonte: P.receita != null ? 'valor que você definiu' : 'entradas do mês' };
  }

  function planoHtml() {
    const titulo = `<div class="sec-head"><h2>Plano de ${esc(MESES[S.mes].toLowerCase())}</h2>${S.plano ? '<button class="btn ghost small" data-act="plano">Ajustar %</button>' : ''}</div>`;
    const R = calcPlano();
    if (!R) return `<section>${titulo}<div class="ledger">${vazio('target', 'Plano do mês ainda não ativado', 'No Supabase, rode o arquivo migracao_plano_do_mes.sql (SQL Editor) e recarregue o app.')}</div></section>`;
    if (R.base <= 0) {
      return `<section>${titulo}<div class="ledger">${vazio('target', 'Falta a receita do mês',
        'Lance as entradas do mês ou defina uma receita mensal estimada para ver quanto vai para cada área.',
        '<button class="btn" data-act="plano">Definir plano</button>')}</div></section>`;
    }
    const linhas = R.linhas.map((a) => {
      const pa = a.meta > 0 ? Math.min(100, (a.gasto / a.meta) * 100) : 0;
      const pb = a.meta > 0 && !a.minimo ? Math.min(100 - pa, (a.aPagar / a.meta) * 100) : 0;
      const cls = a.tom === 'over' ? 'over' : a.minimo ? 'pos' : '';
      const pct = Number.isInteger(a.percentual) ? a.percentual : String(a.percentual).replace('.', ',');
      return `<div class="cat-row plan-row">
        <div class="cat-top">${chip(AREA_ICONE[a.slug] || 'target', '', true)}<span class="cat-name">${esc(a.nome)}<small class="plan-pct">${pct}% da receita</small></span>
          <span class="cat-val">${fmt(a.gasto)}<small>de ${fmt(a.meta)}</small></span></div>
        <div class="meter plan ${cls}" role="progressbar" aria-label="${esc(a.nome)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pa)}"><i class="a" style="width:${pa.toFixed(1)}%"></i><i class="b" style="width:${pb.toFixed(1)}%"></i></div>
        <div class="plan-status ${a.tom}">${esc(a.texto)}${!a.minimo && a.aPagar ? ` Inclui ${esc(fmt(a.aPagar))} ainda a pagar.` : ''}</div>
      </div>`;
    }).join('');
    const notas = [];
    notas.push(`Base de ${fmt(R.base)} (${R.fonte})${R.dizimo ? `, já sem ${fmt(R.dizimo)} de dízimo ou doação` : ''}.`);
    if (Math.abs(R.somaPct - 100) > 0.001) notas.push(`Os percentuais somam ${String(R.somaPct).replace('.', ',')}%, o ideal é 100%.`);
    if (R.semArea) notas.push(`${fmt(R.semArea)} em categorias sem área. Ligue-as em Ajustar %.`);
    return `<section>${titulo}
      <p class="hint" style="margin:-4px 4px 12px">${esc(notas.join(' '))}</p>
      <div class="ledger">${linhas}</div>
      <div class="plan-legend"><span><i></i>Já gasto</span><span><i class="b"></i>Ainda a pagar</span></div></section>`;
  }

  async function renderAnalise() {
    const entM = soma(S.lancs.filter((l) => l.tipo === 'entrada' && l.recebido));
    const saiM = soma(S.lancs.filter((l) => l.tipo === 'saida'));
    const pendM = soma(S.contas.filter((c) => !c.pago));

    const pessoas = PESSOAS.map((p) => ({
      p, e: soma(S.lancs.filter((l) => l.quem === p && l.tipo === 'entrada' && l.recebido)),
      s: soma(S.lancs.filter((l) => l.quem === p && l.tipo === 'saida'))
    })).filter((x) => x.e || x.s);
    const pessoasHtml = pessoas.length ? pessoas.map((x) => `<div class="person">
        <span class="avatar" aria-hidden="true">${esc(x.p[0])}</span>
        <div><b>${esc(x.p)}</b>
          <div class="person-nums">
            <div><small>Entrou</small><b class="tone-pos">${fmt(x.e)}</b></div>
            <div><small>Saiu</small><b class="tone-neg">${fmt(x.s)}</b></div>
            <div><small>Resultado</small><b>${fmt(x.e - x.s)}</b></div>
          </div></div></div>`).join('')
      : vazio('arrow-left-right', 'Sem lançamentos no mês', '');

    const cat = {};
    S.lancs.filter((l) => l.tipo === 'saida').forEach((l) => { cat[l.categoria] = (cat[l.categoria] || 0) + Number(l.valor_centavos); });
    S.contas.filter((c) => !c.pago).forEach((c) => { cat[c.categoria] = (cat[c.categoria] || 0) + Number(c.valor_centavos); });
    Object.keys(S.orc).forEach((k) => { if (!(k in cat)) cat[k] = 0; });
    const cats = Object.entries(cat).sort(([, a], [, b]) => b - a);
    const totCat = cats.reduce((s, [, v]) => s + v, 0);
    const catHtml = cats.length ? cats.map(([k, v]) => {
      const lim = S.orc[k];
      const pctBar = lim ? Math.min(100, (v / lim) * 100) : (totCat ? (v / totCat) * 100 : 0);
      const estourou = lim && v > lim;
      return `<button class="cat-row" data-act="orc" data-cat="${esc(k)}" aria-label="Definir orçamento de ${esc(catNome(k))}">
        <div class="cat-top">${chip(catIconName(k), '', true)}<span class="cat-name">${esc(catNome(k))}</span>
          <span class="cat-val">${fmt(v)}<small>${lim ? `de ${fmt(lim)}` : `${totCat ? Math.round((v / totCat) * 100) : 0}% dos gastos`}</small></span></div>
        <div class="meter ${estourou ? 'over' : ''}"><i style="width:${pctBar.toFixed(1)}%"></i></div>
        ${estourou ? `<div class="cat-alert">Passou ${fmt(v - lim)} do orçamento</div>` : ''}
      </button>`;
    }).join('') : vazio('chart-pie', 'Sem gastos no mês', '');

    $('analise-content').innerHTML = `<div class="stack">
      ${planoHtml()}
      <section><div class="sec-head"><h2>Resumo de ${esc(MESES[S.mes].toLowerCase())}</h2></div>
        <div class="grid2x2">
          <div><div class="s-label">Entradas</div><div class="s-val tone-pos">${fmt(entM)}</div></div>
          <div><div class="s-label">Saídas</div><div class="s-val tone-neg">${fmt(saiM)}</div></div>
          <div><div class="s-label">Resultado</div><div class="s-val ${entM - saiM < 0 ? 'tone-neg' : ''}">${fmt(entM - saiM)}</div></div>
          <div><div class="s-label">Ainda a pagar</div><div class="s-val">${fmt(pendM)}</div></div>
        </div></section>
      <section><div class="sec-head"><h2>Por pessoa</h2></div><div class="ledger">${pessoasHtml}</div></section>
      <section><div class="sec-head"><h2>Gastos por categoria</h2></div>
        <p class="hint" style="margin:-4px 4px 12px">Pago mais o que falta pagar no mês. Toque em uma categoria para definir um orçamento.</p>
        <div class="ledger">${catHtml}</div></section>
      <section id="hist-box"><div class="sec-head"><h2>Últimos 6 meses</h2></div>
        <div class="ledger pad"><div class="sk" style="height:140px"></div></div></section>
      <button class="btn ghost block" data-act="csv">${ico('download')}Exportar ${esc(MESES[S.mes].toLowerCase())} em CSV</button>
    </div>`;

    try {
      let y = S.ano, m = S.mes;
      const meses = [];
      for (let i = 0; i < 6; i++) { meses.unshift({ y, m }); m--; if (m < 0) { m = 11; y--; } }
      const ini = ymd(meses[0].y, meses[0].m, 1);
      const fim = ymd(S.ano, S.mes, diasNoMes(S.ano, S.mes));
      const dados = must(await sb.from('lancamentos').select('tipo,valor_centavos,data,recebido').gte('data', ini).lte('data', fim));
      if (S.page !== 'analise') return;
      const por = Object.fromEntries(meses.map(({ y, m }) => [`${y}-${pad(m + 1)}`, { e: 0, s: 0 }]));
      dados.filter((d) => d.tipo === 'saida' || d.recebido).forEach((d) => { const k = d.data.slice(0, 7); if (por[k]) por[k][d.tipo === 'entrada' ? 'e' : 's'] += Number(d.valor_centavos); });
      const max = Math.max(1, ...Object.values(por).flatMap((v) => [v.e, v.s]));
      const cols = meses.map(({ y, m }) => {
        const v = por[`${y}-${pad(m + 1)}`];
        return `<div class="hist-col" title="${esc(MESES[m])}: entradas ${fmt(v.e)}, saídas ${fmt(v.s)}">
          <div class="hist-bars"><div class="hist-bar e" style="height:${(v.e / max) * 100}%"></div><div class="hist-bar s" style="height:${(v.s / max) * 100}%"></div></div>
          <div class="hist-lbl">${esc(MESES_CURTOS[m])}</div></div>`;
      }).join('');
      const box = $('hist-box');
      if (box) box.querySelector('.ledger').innerHTML =
        `<div class="hist">${cols}</div><div class="hist-key"><span><i style="background:var(--pos)"></i>Entradas</span><span><i style="background:var(--neg)"></i>Saídas</span></div>`;
    } catch (e) {
      const box = $('hist-box');
      if (box) box.querySelector('.ledger').innerHTML = `<p class="hint">${esc(erroMsg(e))}</p>`;
    }
  }

  // ===== Navegação =====
  function showPage(page) {
    S.page = page;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
    document.querySelectorAll('.nav-item').forEach((n) => {
      if (n.dataset.page === page) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    renderizarTudo();
  }

  // ===== Modais (foco preso, fundo inerte, ESC) =====
  let abertoPor = null;
  const setInerte = (on) => ['app-header', 'app-main', 'app-nav'].forEach((id) => { const e = $(id); if (e) e.inert = on; });
  const modalAberto = () => document.querySelector('#app-root .modal-overlay.open');

  function abrir(id) {
    if (!modalAberto()) abertoPor = document.activeElement;
    $(id).classList.add('open');
    setInerte(true);
    requestAnimationFrame(() => {
      const alvo = $(id).querySelector('input:not([type=hidden]):not(:disabled), select, button.btn');
      if (alvo) alvo.focus({ preventScroll: true });
    });
  }
  function fechar(id, restaurar = true) {
    $(id).classList.remove('open');
    if (!modalAberto()) {
      setInerte(false);
      if (restaurar && abertoPor && abertoPor.focus && document.contains(abertoPor)) abertoPor.focus({ preventScroll: true });
      if (restaurar) abertoPor = null;
    }
  }
  // troca de um modal para outro mantendo o foco de origem
  function trocar(deId, abrirOutro) {
    const origem = abertoPor;
    fechar(deId, false);
    abrirOutro();
    abertoPor = origem;
  }
  function fecharTodos() {
    document.querySelectorAll('#app-root .modal-overlay.open').forEach((m) => m.classList.remove('open'));
    setInerte(false);
  }

  function setTipoConta(tipo) {
    S.tipoConta = tipo;
    document.querySelectorAll('#modal-conta [data-act=tipo-conta]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tipo === tipo));
    $('cond-dia').classList.toggle('show', tipo === 'fixa' || tipo === 'parcelada');
    $('cond-parcelas').classList.toggle('show', tipo === 'parcelada');
    $('cond-data').classList.toggle('show', tipo === 'esporadica');
  }
  function setTipoLanc(tipo) {
    S.tipoLanc = tipo;
    document.querySelectorAll('#modal-lancamento [data-act=tipo-lanc]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tipo === tipo));
    $('row-recebido').style.display = tipo === 'entrada' ? '' : 'none';
  }

  function abrirConta(id) {
    const c = id ? acharConta(id) : null;
    $('modal-conta-title').textContent = c ? 'Editar conta' : 'Nova conta';
    $('conta-id').value = c ? c.id : '';
    $('conta-nome').value = c ? c.nome : '';
    $('conta-valor').value = c ? valorParaInput(c.valor_centavos) : '';
    $('conta-categoria').value = c ? c.categoria : 'outros';
    $('conta-obs').value = c ? c.obs : '';
    $('conta-dia').value = c && c.dia_venc ? c.dia_venc : '';
    $('conta-parcela-atual').value = c && c.parcela_atual ? c.parcela_atual : '';
    $('conta-total-parcelas').value = c && c.total_parcelas ? c.total_parcelas : '';
    $('conta-data').value = c && c.tipo === 'esporadica' ? c.vencimento : '';
    document.querySelectorAll('#modal-conta [data-act=tipo-conta]').forEach((b) => { b.disabled = !!c; });
    $('conta-parcela-atual').disabled = !!c;
    $('conta-total-parcelas').disabled = !!c;
    $('hint-tipo').style.display = c ? 'none' : '';
    setTipoConta(c ? c.tipo : 'fixa');
    $('row-proximas').style.display = c && recorrente(c) ? 'flex' : 'none';
    $('conta-proximas').checked = false;
    const del = $('btn-del-conta');
    del.style.display = c ? '' : 'none';
    del.dataset.id = c ? c.id : '';
    abrir('modal-conta');
  }

  function abrirLanc(id, tipoInicial) {
    const l = id ? S.lancs.find((x) => x.id === id) : null;
    if (l && l.conta_id) {
      toast('Esta saída veio de uma conta paga. Edite a conta ou desfaça o pagamento na aba Contas.', true);
      return;
    }
    $('modal-lanc-title').textContent = l ? 'Editar lançamento' : 'Novo lançamento';
    $('lanc-id').value = l ? l.id : '';
    $('lanc-desc').value = l ? l.descricao : '';
    $('lanc-valor').value = l ? valorParaInput(l.valor_centavos) : '';
    $('lanc-data').value = l ? l.data : hojeStr();
    $('lanc-quem').value = l ? l.quem : 'Bruno';
    S.recebidoTocado = !!l;
    $('lanc-recebido').checked = l ? l.recebido !== false : $('lanc-data').value <= hojeStr();
    const tipoNovo = tipoInicial === 'saida' ? 'saida' : 'entrada';
    $('lanc-categoria').value = l ? l.categoria : (tipoNovo === 'saida' ? 'alimentacao' : 'salario');
    setTipoLanc(l ? l.tipo : tipoNovo);
    const del = $('btn-del-lanc');
    del.style.display = l ? '' : 'none';
    del.dataset.id = l ? l.id : '';
    abrir('modal-lancamento');
  }

  function abrirOrc(cat) {
    S.orcCat = cat;
    $('orc-titulo').textContent = `Orçamento de ${catNome(cat).toLowerCase()}`;
    $('orc-valor').value = S.orc[cat] ? valorParaInput(S.orc[cat]) : '';
    $('orc-remover').style.display = S.orc[cat] ? '' : 'none';
    abrir('modal-orc');
  }

  function abrirConfig() {
    $('cfg-email').textContent = S.email || '—';
    $('cfg-avatar').textContent = (S.email || 'L')[0].toUpperCase();
    marcarTema();
    abrir('modal-config');
  }
  function marcarTema() {
    const modo = window.LepusTheme ? window.LepusTheme.modo() : 'auto';
    document.querySelectorAll('[data-act=tema]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tema === modo));
  }

  function pedirExclusao(alvo) {
    S.excluindo = alvo; // { id, tipo: 'conta'|'lanc', recorrente, nome }
    $('excluir-titulo').textContent = alvo.tipo === 'conta' ? 'Excluir conta?' : 'Excluir lançamento?';
    $('excluir-texto').textContent = alvo.recorrente
      ? `“${alvo.nome}” se repete nos meses seguintes. O que você quer excluir?`
      : `“${alvo.nome}” será excluído. Essa ação não pode ser desfeita.`;
    $('ex-uma').textContent = alvo.recorrente ? 'Excluir só esta' : (alvo.tipo === 'conta' ? 'Excluir conta' : 'Excluir lançamento');
    $('ex-prox').style.display = alvo.recorrente ? '' : 'none';
    fechar('modal-conta'); fechar('modal-lancamento');
    abrir('modal-excluir');
  }

  // ===== Ações de dados =====
  async function salvarConta() {
    const id = $('conta-id').value;
    const nome = $('conta-nome').value.trim();
    const valor = parseValor($('conta-valor').value);
    if (!nome || nome.length > 120) throw new Error('Informe um nome de até 120 caracteres.');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido, por exemplo 1.250,90.');
    const categoria = $('conta-categoria').value;
    const obs = $('conta-obs').value.trim().slice(0, 300);
    const tipo = S.tipoConta;
    const dia = parseInt($('conta-dia').value, 10);
    const data = $('conta-data').value;
    if (tipo !== 'esporadica' && !(dia >= 1 && dia <= 31)) throw new Error('Informe o dia do vencimento, de 1 a 31.');
    if (tipo === 'esporadica' && !data) throw new Error('Informe a data de vencimento.');

    if (id) {
      must(await sb.rpc('editar_conta', {
        p_id: id, p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_obs: obs,
        p_dia: tipo === 'esporadica' ? null : dia, p_data: tipo === 'esporadica' ? data : null,
        p_proximas: $('conta-proximas').checked
      }));
    } else if (tipo === 'fixa') {
      must(await sb.rpc('criar_fixa', {
        p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_dia: dia, p_obs: obs, p_inicio: ymd(S.ano, S.mes, 1)
      }));
    } else if (tipo === 'parcelada') {
      const atual = parseInt($('conta-parcela-atual').value, 10);
      const total = parseInt($('conta-total-parcelas').value, 10);
      if (!(atual >= 1) || !(total >= 1) || atual > total || total > 360) throw new Error('Parcelas inválidas: a parcela atual não pode passar do total.');
      must(await sb.rpc('criar_parcelada', {
        p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_dia: dia, p_obs: obs,
        p_inicio: ymd(S.ano, S.mes, 1), p_parcela_atual: atual, p_total: total
      }));
    } else {
      must(await sb.from('contas').insert({ nome, valor_centavos: valor, categoria, tipo: 'esporadica', vencimento: data, obs }));
    }
    fechar('modal-conta');
    toast('Conta salva');
    await carregar();
  }

  async function salvarLanc() {
    const id = $('lanc-id').value;
    const descricao = $('lanc-desc').value.trim();
    const valor = parseValor($('lanc-valor').value);
    const data = $('lanc-data').value;
    if (!descricao || descricao.length > 120) throw new Error('Informe uma descrição de até 120 caracteres.');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido, por exemplo 350,00.');
    if (!data) throw new Error('Informe a data.');
    const row = { tipo: S.tipoLanc, descricao, valor_centavos: valor, data, quem: $('lanc-quem').value, categoria: $('lanc-categoria').value,
      recebido: S.tipoLanc === 'entrada' ? $('lanc-recebido').checked : true };
    if (id) must(await sb.from('lancamentos').update(row).eq('id', id));
    else must(await sb.from('lancamentos').insert(row));
    fechar('modal-lancamento');
    toast('Lançamento salvo');
    await carregar();
  }

  async function toggleRecebido(id) {
    const l = S.lancs.find((x) => x.id === id);
    if (!l) return;
    must(await sb.from('lancamentos').update({ recebido: !l.recebido }).eq('id', id));
    toast(l.recebido ? 'Entrada marcada como a receber' : 'Entrada recebida');
    await carregar();
  }

  async function togglePago(id) {
    const c = acharConta(id);
    if (!c) return;
    must(await sb.rpc('marcar_paga', { p_id: id, p_pago: !c.pago, p_data: hojeStr() }));
    toast(c.pago ? 'Pagamento desfeito' : 'Conta paga. Saída registrada.');
    await carregar();
  }

  async function confirmarExclusao(proximas) {
    const a = S.excluindo;
    if (!a) return;
    if (a.tipo === 'conta') must(await sb.rpc('excluir_conta', { p_id: a.id, p_proximas: proximas }));
    else must(await sb.from('lancamentos').delete().eq('id', a.id));
    S.excluindo = null;
    fechar('modal-excluir');
    toast(a.tipo === 'conta' ? 'Conta excluída' : 'Lançamento excluído');
    await carregar();
  }

  const fmtPct = (n) => String(n).replace('.', ',');
  const lerPct = (v) => Number(String(v).trim().replace(',', '.') || 0);

  function abrirPlano() {
    const P = S.plano;
    if (!P) { toast('Rode o SQL migracao_plano_do_mes.sql no Supabase para ativar o plano.', true); return; }
    $('plano-areas').innerHTML = P.areas.map((a) => `<div class="plano-linha"><label for="pa-${esc(a.slug)}">${esc(a.nome)}</label>
      <div class="pct"><input class="input" id="pa-${esc(a.slug)}" data-slug="${esc(a.slug)}" type="text" inputmode="decimal" autocomplete="off" value="${fmtPct(a.percentual)}" /><span aria-hidden="true">%</span></div></div>`).join('');
    const opts = (sel) => P.areas.map((a) => `<option value="${esc(a.slug)}" ${a.slug === sel ? 'selected' : ''}>${esc(a.nome)}</option>`).join('');
    $('plano-mapa').innerHTML = CATS_GASTO.map((k) => `<div class="plano-linha"><label for="pm-${esc(k)}">${esc(catNome(k))}</label>
      <select class="select" id="pm-${esc(k)}" data-cat="${esc(k)}">${opts(P.mapa[k] || MAPA_PADRAO[k] || P.areas[0].slug)}</select></div>`).join('');
    $('plano-dizimo').value = P.dizimo ? fmtPct(P.dizimo) : '';
    $('plano-receita').value = P.receita != null ? valorParaInput(P.receita) : '';
    atualizarSomaPlano();
    abrir('modal-plano');
  }

  function atualizarSomaPlano() {
    const t = [...document.querySelectorAll('#plano-areas [data-slug]')].reduce((s, i) => s + (Number.isFinite(lerPct(i.value)) ? lerPct(i.value) : 0), 0);
    const r = Math.round(t * 100) / 100;
    const el = $('plano-total');
    if (Math.abs(r - 100) < 0.005) { el.className = 'plano-total ok'; el.textContent = 'Soma: 100%. Tudo distribuído.'; }
    else if (r < 100) { el.className = 'plano-total warn'; el.textContent = `Soma: ${fmtPct(r)}%. Faltam ${fmtPct(Math.round((100 - r) * 100) / 100)}% para distribuir.`; }
    else { el.className = 'plano-total over'; el.textContent = `Soma: ${fmtPct(r)}%. Passou ${fmtPct(Math.round((r - 100) * 100) / 100)}% de 100%.`; }
  }

  function plano_padrao() {
    document.querySelectorAll('#plano-areas [data-slug]').forEach((i) => { if (i.dataset.slug in PLANO_PADRAO) i.value = String(PLANO_PADRAO[i.dataset.slug]); });
    document.querySelectorAll('#plano-mapa [data-cat]').forEach((sel) => { const a = MAPA_PADRAO[sel.dataset.cat]; if (a && [...sel.options].some((o) => o.value === a)) sel.value = a; });
    $('plano-dizimo').value = '';
    atualizarSomaPlano();
    toast('Modelo padrão preenchido. Toque em Salvar plano para aplicar.');
  }

  async function salvarPlano() {
    const P = S.plano;
    const areas = P.areas.map((a) => {
      const v = lerPct($(`pa-${a.slug}`).value);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`Percentual inválido em ${a.nome}. Use um número de 0 a 100.`);
      return { slug: a.slug, nome: a.nome, percentual: Math.round(v * 100) / 100, ordem: a.ordem, minimo: a.minimo };
    });
    const soma100 = Math.round(areas.reduce((t, a) => t + a.percentual, 0) * 100) / 100;
    if (soma100 > 100) throw new Error(`Os percentuais somam ${fmtPct(soma100)}%. Reduza para no máximo 100%.`);
    const diz = lerPct($('plano-dizimo').value);
    if (!Number.isFinite(diz) || diz < 0 || diz > 100) throw new Error('Dízimo ou doação: use um número de 0 a 100.');
    const recTxt = $('plano-receita').value.trim();
    let receita = null;
    if (recTxt) { receita = parseValor(recTxt); if (!Number.isFinite(receita) || receita <= 0) throw new Error('Receita estimada inválida. Use, por exemplo, 5.000,00 ou deixe vazio.'); }
    const mapa = [...document.querySelectorAll('#plano-mapa [data-cat]')].map((sel) => ({ categoria: sel.dataset.cat, area: sel.value }));
    must(await sb.from('areas').upsert(areas));
    must(await sb.from('categoria_area').upsert(mapa));
    must(await sb.from('planejamento').upsert({ id: true, dizimo_pct: Math.round(diz * 100) / 100, receita_centavos: receita }));
    fechar('modal-plano');
    toast(soma100 < 100 ? `Plano salvo. Faltam ${fmtPct(Math.round((100 - soma100) * 100) / 100)}% para distribuir.` : 'Plano salvo');
    await carregar();
  }

  async function salvarOrc() {
    const v = $('orc-valor').value.trim();
    if (!v) return removerOrc();
    const lim = parseValor(v);
    if (!Number.isFinite(lim) || lim <= 0) throw new Error('Informe um valor válido para o limite.');
    must(await sb.from('orcamentos').upsert({ categoria: S.orcCat, limite_centavos: lim }));
    fechar('modal-orc');
    toast('Orçamento salvo');
    await carregar();
  }
  async function removerOrc() {
    must(await sb.from('orcamentos').delete().eq('categoria', S.orcCat));
    fechar('modal-orc');
    toast('Orçamento removido');
    await carregar();
  }

  // CSV (separador ";" e BOM para abrir certo no Excel brasileiro)
  function csvCelula(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita injeção de fórmula em planilhas
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportarCsv() {
    const linhas = [['Registro', 'Data', 'Descrição', 'Categoria', 'Valor (R$)', 'Pessoa', 'Situação']];
    const val = (c) => (c / 100).toFixed(2).replace('.', ',');
    S.lancs.forEach((l) => linhas.push([
      l.tipo === 'entrada' ? 'Entrada' : 'Saída', l.data, l.descricao, catNome(l.categoria),
      (l.tipo === 'entrada' ? '' : '-') + val(l.valor_centavos), l.quem, l.conta_id ? 'Conta paga' : (l.tipo === 'entrada' ? (l.recebido ? 'Recebida' : 'A receber') : '')
    ]));
    S.contas.forEach((c) => linhas.push([
      'Conta', c.vencimento, c.nome + (c.tipo === 'parcelada' ? ` (${c.parcela_atual}/${c.total_parcelas})` : ''),
      catNome(c.categoria), val(c.valor_centavos), '',
      { pago: 'Paga', atrasado: 'Atrasada', proximo: 'A vencer', pendente: 'A vencer' }[statusConta(c)]
    ]));
    const csv = '﻿' + linhas.map((l) => l.map(csvCelula).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `lepus-${S.ano}-${pad(S.mes + 1)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function login() {
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    if (!email || !senha) { mostrarLogin('Preencha e-mail e senha.'); return; }
    $('login-erro').style.display = 'none';
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) mostrarLogin(erroMsg(error));
  }
  async function loginGoogle() {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) mostrarLogin(erroMsg(error));
  }

  const ACOES = {
    'login': () => login(),
    'login-google': () => loginGoogle(),
    'logout': async () => { fecharTodos(); await sb.auth.signOut(); },
    'recarregar': () => carregar(),
    'config': () => abrirConfig(),
    'tema': (el) => { window.LepusTheme.definir(el.dataset.tema); marcarTema(); },
    'mes': (el) => {
      S.mes += Number(el.dataset.dir);
      if (S.mes > 11) { S.mes = 0; S.ano++; }
      if (S.mes < 0) { S.mes = 11; S.ano--; }
      atualizarLabel();
      return carregar();
    },
    'page': (el) => showPage(el.dataset.page),
    'add': () => abrir('modal-add'),
    'add-entrada': () => trocar('modal-add', () => abrirLanc(null, 'entrada')),
    'add-saida': () => trocar('modal-add', () => abrirLanc(null, 'saida')),
    'add-conta': () => trocar('modal-add', () => abrirConta()),
    'novo-conta': () => abrirConta(),
    'novo-lanc': () => abrirLanc(),
    'edit-conta': (el) => abrirConta(el.dataset.id),
    'edit-lanc': (el) => abrirLanc(el.dataset.id),
    'fechar': (el) => fechar(el.dataset.modal),
    'tipo-conta': (el) => setTipoConta(el.dataset.tipo),
    'tipo-lanc': (el) => setTipoLanc(el.dataset.tipo),
    'f-contas': (el) => { S.filtroContas = el.dataset.filtro; renderContas(); },
    'f-lanc': (el) => { S.filtroLanc = el.dataset.filtro; renderLancamentos(); },
    'f-quem': (el) => { S.filtroQuem = el.dataset.quem; renderLancamentos(); },
    'salvar-conta': () => salvarConta(),
    'salvar-lanc': () => salvarLanc(),
    'toggle-pago': (el) => togglePago(el.dataset.id),
    'toggle-recebido': (el) => toggleRecebido(el.dataset.id),
    'del-conta': (el) => {
      const c = acharConta(el.dataset.id);
      if (c) pedirExclusao({ id: c.id, tipo: 'conta', recorrente: recorrente(c), nome: c.nome });
    },
    'del-lanc': (el) => {
      const l = S.lancs.find((x) => x.id === el.dataset.id);
      if (l) pedirExclusao({ id: l.id, tipo: 'lanc', recorrente: false, nome: l.descricao });
    },
    'excluir-uma': () => confirmarExclusao(false),
    'excluir-proximas': () => confirmarExclusao(true),
    'orc': (el) => abrirOrc(el.dataset.cat),
    'plano': () => abrirPlano(),
    'salvar-plano': () => salvarPlano(),
    'plano-padrao': () => plano_padrao(),
    'salvar-orc': () => salvarOrc(),
    'remover-orc': () => removerOrc(),
    'csv': () => exportarCsv()
  };

  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.slug && e.target.closest('#plano-areas')) atualizarSomaPlano(); });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'lanc-recebido') S.recebidoTocado = true;
    if (e.target.id === 'lanc-data' && !S.recebidoTocado) $('lanc-recebido').checked = !!e.target.value && e.target.value <= hojeStr();
  });
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id !== 'tela-login') fechar(e.target.id);
      return;
    }
    const fn = ACOES[el.dataset.act];
    if (!fn || el.disabled) return;
    const trava = el.tagName === 'BUTTON' && /^(salvar|login|excluir|remover)/.test(el.dataset.act);
    if (trava) el.disabled = true;
    try { await fn(el); }
    catch (err) {
      // erros de validação do formulário (Error simples) não são bugs: só avisa o usuário
      if (err && (err.code || err.status || err.name !== 'Error')) console.error(err);
      toast(erroMsg(err), true);
    } finally { if (trava) el.disabled = false; }
  });

  document.addEventListener('keydown', (e) => {
    const aberto = modalAberto();
    if (e.key === 'Escape' && aberto) { fechar(aberto.id); return; }
    if (e.key === 'Tab' && aberto) { // mantém o foco dentro do modal
      const f = [...aberto.querySelectorAll('button, input, select, a[href]')].filter((x) => !x.disabled && x.offsetParent !== null && x.type !== 'hidden');
      if (!f.length) return;
      const [primeiro, ultimo] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
    if (e.key === 'Enter' && (e.target.id === 'login-senha' || e.target.id === 'login-email')) {
      e.preventDefault();
      ACOES.login().catch((err) => mostrarLogin(erroMsg(err)));
    }
  });

  // Service worker (caminho relativo: funciona em qualquer nome de repositório do GitHub Pages)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW erro:', err));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
