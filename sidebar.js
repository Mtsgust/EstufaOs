/* Barra lateral compartilhada + hambúrguer no celular.
   A página diz quem está ativo com <body data-page="nutricao">. */
(function(){
  var S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"';
  var items = [
    ['index.html', 'Painel', 'painel',
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', 'geral'],
    ['pulverizacoes.html', 'Pulverizações', 'pulverizacoes',
      '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>', 'manejo'],
    ['nutricao.html', 'Nutrição', 'nutricao',
      '<path d="M12 21c-5 0-8-3-8-8 0-6 5-9 14-10-.5 9-2 18-6 18z"/><path d="M12 21c0-6 2-11 6-14"/>', 'manejo'],
    ['estoque.html', 'Estoque', 'estoque',
      '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', 'manejo'],
    ['colheita.html', 'Colheita', 'colheita',
      '<path d="M3 21h18"/><path d="M6 21v-9M12 21V5M18 21v-12"/>', 'producao'],
    ['vendas.html', 'Vendas', 'vendas',
      '<path d="M12 3v18M5 8l7-5 7 5M5 8c0 5 3 9 7 9s7-4 7-9"/>', 'producao'],
    ['financeiro.html', 'Financeiro', 'financeiro',
      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>', 'producao'],
    ['bulario.html', 'Bulário', 'bulario',
      '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>', 'apoio'],
    ['relatorios.html', 'Relatórios', 'relatorios',
      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 'apoio'],
    ['configuracoes.html', 'Configurações', 'configuracoes',
      '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z"/>', 'apoio']
  ];
  var SEC = {geral:'Geral', manejo:'Manejo', producao:'Produção', apoio:'Apoio'};
  var page = (document.body.getAttribute('data-page') || '').trim().toLowerCase();
  if(!page){
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    page = f.indexOf('pulv') === 0 ? 'pulverizacoes'
         : f.indexOf('nutr') === 0 ? 'nutricao'
         : f.indexOf('esto') === 0 ? 'estoque'
         : f.indexOf('colh') === 0 ? 'colheita'
         : f.indexOf('vend') === 0 ? 'vendas'
         : f.indexOf('fin') === 0 ? 'financeiro'
         : f.indexOf('bul') === 0 ? 'bulario'
         : f.indexOf('rel') === 0 ? 'relatorios'
         : f.indexOf('conf') === 0 ? 'configuracoes'
         : f.indexOf('inic') === 0 ? 'inicio' : 'painel';
  }
  var lastSec = '';
  var nav = items.map(function(it){
    var h = '';
    if(it[4] !== lastSec){ lastSec = it[4]; h = '<div class="sb-sec">' + (SEC[lastSec] || lastSec) + '</div>'; }
    return h + '<a href="' + it[0] + '"' + (it[2] === page ? ' class="active"' : '') +
      '><svg ' + S + '>' + it[3] + '</svg>' + it[1] + '</a>';
  }).join('');
  var brand = '<div class="sb-brand"><div class="sb-logo"><img src="logo.png" alt="Estufas" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div>' +
    '<div><b>Estufas</b><small>Controle · Capão Bonito SP</small></div></div>';
  var aside = document.createElement('aside');
  aside.className = 'sb-aside';
  aside.innerHTML = '<button class="sb-close" aria-label="Fechar menu">✕</button>' +
    brand + '<nav class="sb-nav">' + nav + '</nav>' +
    '<div class="sb-foot">v2 · tema premium</div>';
  var fab = document.createElement('button');
  fab.className = 'sb-fab';
  fab.setAttribute('aria-label', 'Abrir menu');
  fab.textContent = '☰';
  var overlay = document.createElement('div');
  overlay.className = 'sb-overlay';
  document.body.classList.add('has-sidebar');
  document.body.insertBefore(overlay, document.body.firstChild);
  document.body.insertBefore(fab, document.body.firstChild);
  document.body.insertBefore(aside, document.body.firstChild);
  fab.onclick = function(){ document.body.classList.toggle('sb-open'); };
  overlay.onclick = function(){ document.body.classList.remove('sb-open'); };
  aside.querySelector('.sb-close').onclick = function(){ document.body.classList.remove('sb-open'); };
  aside.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){ document.body.classList.remove('sb-open'); });
  });
})();
