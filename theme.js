// Tema claro/escuro. Carrega no <head> (antes da pintura) para não piscar.
// Valores: 'light' | 'dark' | ausente = segue o sistema.
(function () {
  var KEY = 'lepus-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function lerSalvo() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
  function ehEscuro() { var m = lerSalvo(); return m === 'dark' || (m !== 'light' && !!(mq && mq.matches)); }
  function corBarra() {
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', ehEscuro() ? '#000a29' : '#ffffff');
  }
  function aplicar() {
    var m = lerSalvo();
    if (m) root.setAttribute('data-theme', m); else root.removeAttribute('data-theme');
    corBarra();
  }
  window.LepusTheme = {
    modo: function () { return lerSalvo() || 'auto'; },
    definir: function (modo) {
      try { if (modo === 'light' || modo === 'dark') localStorage.setItem(KEY, modo); else localStorage.removeItem(KEY); } catch (e) { /* modo privado: vale só nesta sessão */ if (modo === 'light' || modo === 'dark') root.setAttribute('data-theme', modo); else root.removeAttribute('data-theme'); }
      aplicar();
    }
  };
  aplicar();
  if (mq && mq.addEventListener) mq.addEventListener('change', corBarra);
  document.addEventListener('DOMContentLoaded', corBarra);
})();
