(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ===== Constantes =====
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const CATS = {
    moradia: ['🏠','Moradia'], alimentacao: ['🍔','Alimentação'], saude: ['💊','Saúde'],
    transporte: ['🚗','Transporte'], educacao: ['📚','Educação'], lazer: ['🎮','Lazer'],
    servicos: ['📱','Serviços'], emprestimo: ['💰','Empréstimo'], cartao: ['💳','Cartão'],
    salario: ['💵','Salário'], beneficio: ['🎁','Benefício'], extra: ['💼','Extra'], outros: ['📦','Outros']
  };
  const catIcon = (c) => (CATS[c] || CATS.outros)[0];
  const catNome = (c) => (CATS[c] ? CATS[c][1] : (c || 'Outros'));
  const PESSOAS = ['Bruno', 'Nanda', 'Família'];

  // ===== Helpers =====
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt = (centavos) => brl.format((centavos || 0) / 100);
  const soma = (arr) => arr.reduce((s, x) => s + Number(x.valor_centavos || 0), 0);

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
  const fmtData = (s) => (s ? s.split('-').reverse().join('/') : '');
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

  function toast(msg, erro = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (erro ? ' erro' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = 'toast'; }, erro ? 5000 : 2200);
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
    userId: null, ano: hoje0.getFullYear(), mes: hoje0.getMonth(), page: 'home',
    contas: [], lancs: [], atrasadas: [], proximas: [], resumo: {}, orc: {},
    filtroContas: 'todas', filtroLanc: 'todos', filtroQuem: 'todos',
    tipoConta: 'fixa', tipoLanc: 'entrada', excluindo: null, orcCat: null, token: 0
  };
  let sb = null;
  let canal = null;

  const acharConta = (id) =>
    [...S.contas, ...S.atrasadas, ...S.proximas].find((c) => c.id === id);

  // ===== Boot =====
  function mostrarLogin(msg) {
    $('tela-login').classList.add('open');
    $('app-root').style.display = 'none';
    const el = $('login-erro');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function boot() {
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
      setTimeout(() => {
        if (session && session.user) entrar(session.user);
        else sair();
      }, 0);
    });
  }

  async function entrar(user) {
    if (S.userId === user.id) return;
    S.userId = user.id;
    try {
      const permitido = must(await sb.rpc('is_allowed'));
      if (!permitido) {
        S.userId = null;
        await sb.auth.signOut();
        mostrarLogin('Este e-mail não tem permissão para usar o app.');
        return;
      }
    } catch (e) {
      S.userId = null;
      mostrarLogin(erroMsg(e));
      return;
    }
    $('tela-login').classList.remove('open');
    $('app-root').style.display = 'block';
    atualizarLabel();
    $('login-senha').value = '';
    showPage('home');
    try { must(await sb.rpc('estender_fixas', { p_hoje: hojeStr() })); } catch (e) { console.warn('estender_fixas:', e); }
    await carregar();
    assinarMudancas();
  }

  function sair() {
    S.userId = null;
    if (canal && sb) { sb.removeChannel(canal); canal = null; }
    S.contas = []; S.lancs = []; S.atrasadas = []; S.proximas = []; S.resumo = {}; S.orc = {};
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
      const [c, l, atr, prox, res, orc] = await Promise.all([
        sb.from('contas').select('*').gte('vencimento', ini).lte('vencimento', fim).order('vencimento'),
        sb.from('lancamentos').select('*').gte('data', ini).lte('data', fim).order('data', { ascending: false }),
        sb.from('contas').select('*').eq('pago', false).lt('vencimento', hoje).order('vencimento'),
        sb.from('contas').select('*').eq('pago', false).gte('vencimento', hoje).lte('vencimento', maisDias(7)).order('vencimento'),
        sb.rpc('resumo', { p_hoje: hoje, p_fim_mes: fim }),
        sb.from('orcamentos').select('*')
      ]);
      if (tk !== S.token) return; // chegou resposta de uma navegação mais antiga
      S.contas = must(c); S.lancs = must(l); S.atrasadas = must(atr); S.proximas = must(prox);
      S.resumo = must(res) || {};
      S.orc = Object.fromEntries(must(orc).map((o) => [o.categoria, Number(o.limite_centavos)]));
      renderizarTudo();
    } catch (e) {
      if (tk !== S.token) return;
      toast(erroMsg(e), true);
      ['home-content', 'contas-content', 'lancamentos-content'].forEach((id) => {
        $(id).innerHTML = `<div class="empty"><div class="icon">⚠️</div><div>Não foi possível carregar os dados.</div>
          <div style="margin-top:8px"><button class="btn-add" data-act="recarregar">Tentar de novo</button></div></div>`;
      });
    }
  }

  function atualizarLabel() { $('monthLabel').textContent = `${MESES[S.mes]} ${S.ano}`; }

  // ===== Renderização =====
  function renderizarTudo() {
    if (S.page === 'home') renderHome();
    else if (S.page === 'contas') renderContas();
    else if (S.page === 'lancamentos') renderLancamentos();
    else if (S.page === 'analise') renderAnalise();
  }

  function itemResumo(c, cor) {
    const d = diffDias(hojeStr(), c.vencimento);
    const meta = cor === 'red'
      ? `Venceu dia ${fmtData(c.vencimento)}`
      : (d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d} dias (${fmtData(c.vencimento)})`);
    return `<div class="item-card">
      <button class="item-check" data-act="toggle-pago" data-id="${esc(c.id)}" aria-label="Marcar ${esc(c.nome)} como paga"></button>
      <div class="item-info">
        <div class="item-name">${catIcon(c.categoria)} ${esc(c.nome)}</div>
        <div class="item-meta" ${cor === 'red' ? 'style="color:var(--red)"' : ''}>${esc(meta)}</div>
      </div>
      <div class="item-value ${cor}">${fmt(c.valor_centavos)}</div>
    </div>`;
  }

  function renderHome() {
    const r = S.resumo || {};
    const saldoAtual = Number(r.entradas || 0) - Number(r.saidas || 0);
    const previsto = saldoAtual - Number(r.pendente_ate_fim_mes || 0);
    const entM = soma(S.lancs.filter((l) => l.tipo === 'entrada'));
    const saiM = soma(S.lancs.filter((l) => l.tipo === 'saida'));
    const pagoM = soma(S.contas.filter((c) => c.pago));
    const pendM = soma(S.contas.filter((c) => !c.pago));
    const totM = pagoM + pendM;
    const pct = totM > 0 ? (pagoM / totM) * 100 : 0;

    let html = '';
    if (S.atrasadas.length) {
      html += `<div class="alert-banner">⚠️ ${S.atrasadas.length} conta(s) atrasada(s), somando ${fmt(soma(S.atrasadas))}.</div>`;
    }
    html += `
      <div class="summary-grid">
        <div class="summary-card full">
          <div class="label">💰 Saldo atual</div>
          <div class="value ${saldoAtual >= 0 ? 'blue' : 'red'}">${fmt(saldoAtual)}</div>
          <div class="sub">Entradas − saídas até hoje (contas pagas já contam como saída)</div>
        </div>
        <div class="summary-card">
          <div class="label">🔮 Previsto fim de ${esc(MESES[S.mes])}</div>
          <div class="value ${previsto >= 0 ? 'green' : 'red'}">${fmt(previsto)}</div>
          <div class="sub">Saldo − contas em aberto até o fim do mês</div>
        </div>
        <div class="summary-card">
          <div class="label">⏳ A pagar no mês</div>
          <div class="value orange">${fmt(pendM)}</div>
          <div class="sub">${S.contas.filter((c) => !c.pago).length} conta(s) em aberto</div>
        </div>
        <div class="summary-card full">
          <div class="label">✅ Contas de ${esc(MESES[S.mes])}</div>
          <div class="value green">${fmt(pagoM)} <span style="font-size:13px;color:var(--text2);font-weight:500">de ${fmt(totM)}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="sub" style="margin-top:6px">${pct.toFixed(0)}% pago</div>
        </div>
        <div class="summary-card">
          <div class="label">⬆️ Entradas do mês</div>
          <div class="value green">${fmt(entM)}</div>
        </div>
        <div class="summary-card">
          <div class="label">⬇️ Saídas do mês</div>
          <div class="value red">${fmt(saiM)}</div>
        </div>
      </div>`;

    if (S.proximas.length) {
      html += `<div class="section"><div class="section-header">
        <div class="section-title">⚠️ Vencem em breve <span class="badge orange">${S.proximas.length}</span></div></div>
        ${S.proximas.map((c) => itemResumo(c, 'orange')).join('')}</div>`;
    }
    if (S.atrasadas.length) {
      html += `<div class="section"><div class="section-header">
        <div class="section-title">🔴 Atrasadas <span class="badge">${S.atrasadas.length}</span></div></div>
        ${S.atrasadas.map((c) => itemResumo(c, 'red')).join('')}</div>`;
    }
    if (!S.contas.length && !S.lancs.length && !S.atrasadas.length) {
      html += `<div class="empty"><div class="icon">📊</div><div>Nenhum dado em ${esc(MESES[S.mes])}.</div>
        <div style="margin-top:8px">Toque no + para começar.</div></div>`;
    }
    $('home-content').innerHTML = html;
  }

  function renderContas() {
    let lista = S.contas;
    if (S.filtroContas === 'pendente') lista = lista.filter((c) => statusConta(c) === 'pendente' || statusConta(c) === 'proximo');
    else if (S.filtroContas === 'pago') lista = lista.filter((c) => c.pago);
    else if (S.filtroContas === 'atrasado') lista = S.atrasadas;

    document.querySelectorAll('#page-contas .tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.filtro === S.filtroContas));

    if (!lista.length) {
      $('contas-content').innerHTML = `<div class="empty"><div class="icon">💳</div><div>Nenhuma conta encontrada.</div></div>`;
      return;
    }
    const resumo = S.filtroContas === 'atrasado' ? '' :
      `<div class="sub" style="margin:-4px 2px 12px;color:var(--text2);font-size:12px">Total ${fmt(soma(lista))}</div>`;

    $('contas-content').innerHTML = resumo + lista.map((c) => {
      const st = statusConta(c);
      const parc = c.tipo === 'parcelada' ? ` • ${c.parcela_atual}/${c.total_parcelas}` : '';
      const rotulo = c.tipo === 'fixa' ? 'Fixa' : c.tipo === 'parcelada' ? 'Parcelada' : 'Esporádica';
      const tipoCls = c.tipo === 'esporadica' ? 'esporadico' : c.tipo === 'parcelada' ? 'parcelado' : 'fixo';
      return `<div class="item-card">
        <button class="item-check ${c.pago ? 'checked' : ''}" data-act="toggle-pago" data-id="${esc(c.id)}"
          aria-pressed="${c.pago}" aria-label="${c.pago ? 'Desfazer pagamento de' : 'Marcar como paga:'} ${esc(c.nome)}"></button>
        <div class="item-info">
          <div class="item-name ${c.pago ? 'paid' : ''}">${catIcon(c.categoria)} ${esc(c.nome)}</div>
          <div class="item-meta">Vence ${esc(fmtData(c.vencimento))}${parc}${c.obs ? ' • ' + esc(c.obs) : ''}</div>
          <div class="item-tags"><span class="tag ${tipoCls}">${rotulo}</span>${st === 'atrasado' ? '<span class="tag atrasado">Atrasada</span>' : ''}</div>
        </div>
        <div class="item-value ${c.pago ? 'paid' : st === 'atrasado' ? 'red' : ''}">${fmt(c.valor_centavos)}</div>
        <div class="item-actions">
          <button class="btn-icon" data-act="edit-conta" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nome)}">✏️</button>
          <button class="btn-icon" data-act="del-conta" data-id="${esc(c.id)}" aria-label="Excluir ${esc(c.nome)}">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderLancamentos() {
    let lista = S.lancs;
    if (S.filtroLanc !== 'todos') lista = lista.filter((l) => l.tipo === S.filtroLanc);
    if (S.filtroQuem !== 'todos') lista = lista.filter((l) => l.quem === S.filtroQuem);

    document.querySelectorAll('#page-lancamentos .tab[data-filtro]').forEach((t) =>
      t.classList.toggle('active', t.dataset.filtro === S.filtroLanc));
    document.querySelectorAll('#page-lancamentos .tab[data-quem]').forEach((t) =>
      t.classList.toggle('active', t.dataset.quem === S.filtroQuem));

    if (!lista.length) {
      $('lancamentos-content').innerHTML = `<div class="empty"><div class="icon">💸</div><div>Nenhum lançamento encontrado.</div></div>`;
      return;
    }
    $('lancamentos-content').innerHTML = lista.map((l) => {
      const ent = l.tipo === 'entrada';
      const ligado = !!l.conta_id;
      return `<div class="entrada-card">
        <div class="entrada-icon ${ent ? '' : 'saida'}">${catIcon(l.categoria)}</div>
        <div class="item-info">
          <div class="item-name">${esc(l.descricao)}</div>
          <div class="item-meta">${esc(fmtData(l.data))} • ${esc(l.quem)}${ligado ? ' • 🔗 conta paga' : ''}</div>
        </div>
        <div class="item-value ${ent ? 'green' : 'red'}">${ent ? '+' : '−'}${fmt(l.valor_centavos)}</div>
        <div class="item-actions">
          <button class="btn-icon" data-act="edit-lanc" data-id="${esc(l.id)}" aria-label="Editar ${esc(l.descricao)}">✏️</button>
          <button class="btn-icon" data-act="del-lanc" data-id="${esc(l.id)}" aria-label="Excluir ${esc(l.descricao)}">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  async function renderAnalise() {
    const tk = S.token;
    const entM = soma(S.lancs.filter((l) => l.tipo === 'entrada'));
    const saiM = soma(S.lancs.filter((l) => l.tipo === 'saida'));
    const pendM = soma(S.contas.filter((c) => !c.pago));

    // por pessoa
    const pessoas = PESSOAS.map((p) => {
      const e = soma(S.lancs.filter((l) => l.quem === p && l.tipo === 'entrada'));
      const s = soma(S.lancs.filter((l) => l.quem === p && l.tipo === 'saida'));
      return { p, e, s };
    }).filter((x) => x.e || x.s);
    const pessoasHtml = pessoas.length ? pessoas.map((x) => `
      <div class="linha-pessoa">
        <strong>${esc(x.p)}</strong>
        <span class="green">+${fmt(x.e)}</span><span class="red">−${fmt(x.s)}</span>
        <span class="${x.e - x.s >= 0 ? 'blue' : 'red'}" style="font-weight:700">${fmt(x.e - x.s)}</span>
      </div>`).join('') : '<div class="empty" style="padding:12px">Sem lançamentos no mês.</div>';

    // por categoria: realizado (saídas) + a pagar (contas em aberto)
    const cat = {};
    S.lancs.filter((l) => l.tipo === 'saida').forEach((l) => { cat[l.categoria] = (cat[l.categoria] || 0) + Number(l.valor_centavos); });
    S.contas.filter((c) => !c.pago).forEach((c) => { cat[c.categoria] = (cat[c.categoria] || 0) + Number(c.valor_centavos); });
    Object.keys(S.orc).forEach((k) => { if (!(k in cat)) cat[k] = 0; });
    const cats = Object.entries(cat).sort(([, a], [, b]) => b - a);
    const totCat = cats.reduce((s, [, v]) => s + v, 0);
    const catHtml = cats.length ? cats.map(([k, v]) => {
      const lim = S.orc[k];
      const base = lim ? Math.min(100, (v / lim) * 100) : (totCat ? (v / totCat) * 100 : 0);
      const estourou = lim && v > lim;
      return `<button class="cat-row" data-act="orc" data-cat="${esc(k)}" aria-label="Definir orçamento de ${esc(catNome(k))}">
        <div class="cat-top"><span>${catIcon(k)} ${esc(catNome(k))}</span>
          <span style="font-weight:600">${fmt(v)}${lim ? ` / ${fmt(lim)}` : ` (${totCat ? Math.round((v / totCat) * 100) : 0}%)`}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${base.toFixed(1)}%;background:${estourou ? 'var(--red)' : 'var(--blue)'}"></div></div>
        ${estourou ? `<div class="sub" style="color:var(--red);font-size:12px;margin-top:4px">Acima do orçamento em ${fmt(v - lim)}</div>` : ''}
      </button>`;
    }).join('') : '<div class="empty" style="padding:12px">Sem gastos no mês.</div>';

    const base = `
      <div class="section">
        <div class="section-title" style="margin-bottom:12px">📊 Resumo de ${esc(MESES[S.mes])}</div>
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Entradas</div><div class="value green">${fmt(entM)}</div></div>
          <div class="summary-card"><div class="label">Saídas</div><div class="value red">${fmt(saiM)}</div></div>
          <div class="summary-card"><div class="label">Resultado</div><div class="value ${entM - saiM >= 0 ? 'blue' : 'red'}">${fmt(entM - saiM)}</div></div>
          <div class="summary-card"><div class="label">Ainda a pagar</div><div class="value orange">${fmt(pendM)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title" style="margin-bottom:12px">👥 Por pessoa</div>
        <div class="summary-card">${pessoasHtml}</div>
      </div>
      <div class="section">
        <div class="section-title" style="margin-bottom:4px">🏷️ Gastos por categoria</div>
        <div class="sub" style="font-size:12px;color:var(--text2);margin-bottom:10px">Pago + a pagar no mês. Toque numa categoria para definir um orçamento.</div>
        <div class="summary-card">${catHtml}</div>
      </div>
      <div class="section" id="hist-box"><div class="section-title" style="margin-bottom:12px">📈 Últimos 6 meses</div>
        <div class="summary-card"><div class="loading" style="padding:12px">Carregando...</div></div></div>
      <div class="section">
        <button class="btn-salvar" style="background:var(--card);color:var(--text);border:1.5px solid var(--border)" data-act="csv">⬇️ Exportar ${esc(MESES[S.mes])} (CSV)</button>
      </div>`;
    $('analise-content').innerHTML = base;

    // histórico de 6 meses
    try {
      let y = S.ano, m = S.mes;
      const meses = [];
      for (let i = 0; i < 6; i++) { meses.unshift({ y, m }); m--; if (m < 0) { m = 11; y--; } }
      const ini = ymd(meses[0].y, meses[0].m, 1);
      const fim = ymd(S.ano, S.mes, diasNoMes(S.ano, S.mes));
      const dados = must(await sb.from('lancamentos').select('tipo,valor_centavos,data').gte('data', ini).lte('data', fim));
      if (tk !== S.token && S.page !== 'analise') return;
      const por = Object.fromEntries(meses.map(({ y, m }) => [`${y}-${pad(m + 1)}`, { e: 0, s: 0 }]));
      dados.forEach((d) => { const k = d.data.slice(0, 7); if (por[k]) por[k][d.tipo === 'entrada' ? 'e' : 's'] += Number(d.valor_centavos); });
      const max = Math.max(1, ...Object.values(por).flatMap((v) => [v.e, v.s]));
      const html = meses.map(({ y, m }) => {
        const v = por[`${y}-${pad(m + 1)}`];
        return `<div class="hist-col" title="${esc(MESES[m])}: entradas ${fmt(v.e)}, saídas ${fmt(v.s)}">
          <div class="hist-bars"><div class="hist-bar e" style="height:${(v.e / max) * 100}%"></div><div class="hist-bar s" style="height:${(v.s / max) * 100}%"></div></div>
          <div class="hist-lbl">${esc(MESES[m].slice(0, 3))}</div></div>`;
      }).join('');
      const box = $('hist-box');
      if (box) box.querySelector('.summary-card').innerHTML =
        `<div class="hist">${html}</div><div class="sub" style="margin-top:8px;font-size:12px"><span class="green">■</span> entradas &nbsp; <span class="red">■</span> saídas</div>`;
    } catch (e) {
      const box = $('hist-box');
      if (box) box.querySelector('.summary-card').innerHTML = `<div class="empty" style="padding:12px">${esc(erroMsg(e))}</div>`;
    }
  }

  // ===== Navegação =====
  function showPage(page) {
    S.page = page;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
    document.querySelectorAll('.nav-item').forEach((n) => {
      const on = n.dataset.page === page;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    $('fab-btn').classList.toggle('visible', page === 'home');
    renderizarTudo();
  }

  // ===== Modais =====
  const abrir = (id) => $(id).classList.add('open');
  const fechar = (id) => $(id).classList.remove('open');

  function setTipoConta(tipo) {
    S.tipoConta = tipo;
    document.querySelectorAll('#modal-conta .tipo-btn').forEach((b) => {
      const on = b.dataset.tipo === tipo;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
    $('cond-dia').classList.toggle('show', tipo === 'fixa' || tipo === 'parcelada');
    $('cond-parcelas').classList.toggle('show', tipo === 'parcelada');
    $('cond-data').classList.toggle('show', tipo === 'esporadica');
  }

  function setTipoLanc(tipo) {
    S.tipoLanc = tipo;
    document.querySelectorAll('#modal-lancamento .tipo-btn').forEach((b) => {
      const on = b.dataset.tipo === tipo;
      b.classList.toggle('active', on);
      b.classList.toggle('entrada', on && tipo === 'entrada');
      b.classList.toggle('saida', on && tipo === 'saida');
      b.setAttribute('aria-pressed', on);
    });
  }

  function abrirConta(id) {
    const c = id ? acharConta(id) : null;
    $('modal-conta-title').textContent = c ? 'Editar Conta' : 'Nova Conta a Pagar';
    $('conta-id').value = c ? c.id : '';
    $('conta-nome').value = c ? c.nome : '';
    $('conta-valor').value = c ? valorParaInput(c.valor_centavos) : '';
    $('conta-categoria').value = c ? c.categoria : 'outros';
    $('conta-obs').value = c ? c.obs : '';
    $('conta-dia').value = c && c.dia_venc ? c.dia_venc : '';
    $('conta-parcela-atual').value = c && c.parcela_atual ? c.parcela_atual : '';
    $('conta-total-parcelas').value = c && c.total_parcelas ? c.total_parcelas : '';
    $('conta-data').value = c && c.tipo === 'esporadica' ? c.vencimento : '';
    document.querySelectorAll('#modal-conta .tipo-btn').forEach((b) => { b.disabled = !!c; });
    $('conta-parcela-atual').disabled = !!c;
    $('conta-total-parcelas').disabled = !!c;
    setTipoConta(c ? c.tipo : 'fixa');
    const mostrarProx = !!c && recorrente(c);
    $('row-proximas').style.display = mostrarProx ? 'flex' : 'none';
    $('conta-proximas').checked = false;
    abrir('modal-conta');
    $('conta-nome').focus();
  }

  function abrirLanc(id) {
    const l = id ? S.lancs.find((x) => x.id === id) : null;
    if (l && l.conta_id) {
      toast('Esta saída veio de uma conta paga. Para alterar, edite a conta ou desfaça o pagamento na aba Contas.', true);
      return;
    }
    $('modal-lanc-title').textContent = l ? 'Editar Lançamento' : 'Novo Lançamento';
    $('lanc-id').value = l ? l.id : '';
    $('lanc-desc').value = l ? l.descricao : '';
    $('lanc-valor').value = l ? valorParaInput(l.valor_centavos) : '';
    $('lanc-data').value = l ? l.data : hojeStr();
    $('lanc-quem').value = l ? l.quem : 'Bruno';
    $('lanc-categoria').value = l ? l.categoria : 'salario';
    setTipoLanc(l ? l.tipo : 'entrada');
    abrir('modal-lancamento');
    $('lanc-desc').focus();
  }

  function abrirOrc(cat) {
    S.orcCat = cat;
    $('orc-titulo').textContent = `${catIcon(cat)} ${catNome(cat)}`;
    $('orc-valor').value = S.orc[cat] ? valorParaInput(S.orc[cat]) : '';
    $('orc-remover').style.display = S.orc[cat] ? 'block' : 'none';
    abrir('modal-orc');
    $('orc-valor').focus();
  }

  // ===== Ações =====
  async function salvarConta() {
    const id = $('conta-id').value;
    const nome = $('conta-nome').value.trim();
    const valor = parseValor($('conta-valor').value);
    if (!nome || nome.length > 120) throw new Error('Informe um nome (até 120 caracteres).');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido, ex.: 1.250,90');
    const categoria = $('conta-categoria').value;
    const obs = $('conta-obs').value.trim().slice(0, 300);
    const tipo = S.tipoConta;
    const dia = parseInt($('conta-dia').value, 10);
    const data = $('conta-data').value;
    if (tipo !== 'esporadica' && !(dia >= 1 && dia <= 31)) throw new Error('Informe o dia do vencimento (1 a 31).');
    if (tipo === 'esporadica' && !data) throw new Error('Informe a data de vencimento.');

    if (id) {
      must(await sb.rpc('editar_conta', {
        p_id: id, p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_obs: obs,
        p_dia: tipo === 'esporadica' ? null : dia, p_data: tipo === 'esporadica' ? data : null,
        p_proximas: $('conta-proximas').checked
      }));
    } else if (tipo === 'fixa') {
      must(await sb.rpc('criar_fixa', {
        p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_dia: dia, p_obs: obs,
        p_inicio: ymd(S.ano, S.mes, 1)
      }));
    } else if (tipo === 'parcelada') {
      const atual = parseInt($('conta-parcela-atual').value, 10);
      const total = parseInt($('conta-total-parcelas').value, 10);
      if (!(atual >= 1) || !(total >= 1) || atual > total || total > 360) throw new Error('Parcelas inválidas (a atual não pode passar do total).');
      must(await sb.rpc('criar_parcelada', {
        p_nome: nome, p_valor_centavos: valor, p_categoria: categoria, p_dia: dia, p_obs: obs,
        p_inicio: ymd(S.ano, S.mes, 1), p_parcela_atual: atual, p_total: total
      }));
    } else {
      must(await sb.from('contas').insert({
        nome, valor_centavos: valor, categoria, tipo: 'esporadica', vencimento: data, obs
      }));
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
    if (!descricao || descricao.length > 120) throw new Error('Informe uma descrição (até 120 caracteres).');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido, ex.: 350,00');
    if (!data) throw new Error('Informe a data.');
    const row = {
      tipo: S.tipoLanc, descricao, valor_centavos: valor, data,
      quem: $('lanc-quem').value, categoria: $('lanc-categoria').value
    };
    if (id) must(await sb.from('lancamentos').update(row).eq('id', id));
    else must(await sb.from('lancamentos').insert(row));
    fechar('modal-lancamento');
    toast('Lançamento salvo');
    await carregar();
  }

  async function togglePago(id) {
    const c = acharConta(id);
    if (!c) return;
    must(await sb.rpc('marcar_paga', { p_id: id, p_pago: !c.pago, p_data: hojeStr() }));
    toast(c.pago ? 'Pagamento desfeito' : 'Conta paga — saída registrada');
    await carregar();
  }

  async function excluirConta(id, proximas) {
    must(await sb.rpc('excluir_conta', { p_id: id, p_proximas: proximas }));
    fechar('modal-excluir');
    toast('Conta excluída');
    await carregar();
  }

  async function salvarOrc() {
    const v = $('orc-valor').value.trim();
    if (!v) { return removerOrc(); }
    const lim = parseValor(v);
    if (!Number.isFinite(lim) || lim <= 0) throw new Error('Informe um valor válido.');
    must(await sb.from('orcamentos').upsert({ categoria: S.orcCat, limite_centavos: lim }));
    fechar('modal-orc');
    await carregar();
  }
  async function removerOrc() {
    must(await sb.from('orcamentos').delete().eq('categoria', S.orcCat));
    fechar('modal-orc');
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
      (l.tipo === 'entrada' ? '' : '-') + val(l.valor_centavos), l.quem, l.conta_id ? 'Conta paga' : ''
    ]));
    S.contas.forEach((c) => linhas.push([
      'Conta', c.vencimento, c.nome + (c.tipo === 'parcelada' ? ` (${c.parcela_atual}/${c.total_parcelas})` : ''),
      catNome(c.categoria), val(c.valor_centavos), '', { pago: 'Paga', atrasado: 'Atrasada', proximo: 'A vencer', pendente: 'A vencer' }[statusConta(c)]
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
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: location.origin + location.pathname }
    });
    if (error) mostrarLogin(erroMsg(error));
  }

  const ACOES = {
    'login': () => login(),
    'login-google': () => loginGoogle(),
    'logout': async () => { if (confirm('Sair da conta?')) await sb.auth.signOut(); },
    'recarregar': () => carregar(),
    'mes': (el) => {
      S.mes += Number(el.dataset.dir);
      if (S.mes > 11) { S.mes = 0; S.ano++; }
      if (S.mes < 0) { S.mes = 11; S.ano--; }
      atualizarLabel();
      return carregar();
    },
    'page': (el) => showPage(el.dataset.page),
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
    'del-conta': (el) => {
      const c = acharConta(el.dataset.id);
      if (!c) return;
      if (recorrente(c)) {
        S.excluindo = c.id;
        $('excluir-nome').textContent = c.nome;
        abrir('modal-excluir');
      } else if (confirm(`Excluir "${c.nome}"?`)) {
        return excluirConta(c.id, false);
      }
    },
    'excluir-uma': () => excluirConta(S.excluindo, false),
    'excluir-proximas': () => excluirConta(S.excluindo, true),
    'del-lanc': async (el) => {
      const l = S.lancs.find((x) => x.id === el.dataset.id);
      if (!l) return;
      if (l.conta_id) { toast('Esta saída pertence a uma conta paga. Desfaça o pagamento na aba Contas.', true); return; }
      if (!confirm(`Excluir "${l.descricao}"?`)) return;
      must(await sb.from('lancamentos').delete().eq('id', l.id));
      toast('Lançamento excluído');
      await carregar();
    },
    'orc': (el) => abrirOrc(el.dataset.cat),
    'salvar-orc': () => salvarOrc(),
    'remover-orc': () => removerOrc(),
    'csv': () => exportarCsv()
  };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id !== 'tela-login') {
        e.target.classList.remove('open');
      }
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
    }
    finally { if (trava) el.disabled = false; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('#app-root .modal-overlay.open').forEach((m) => m.classList.remove('open'));
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
