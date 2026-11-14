/* Extrai o script inline do bulario.html, faz node --check e roda os testes do
   motor (36 asserções). Migra para /testes o harness que vivia só em %TEMP%.
   Uso: node testes/bulario_check.js [caminho do bulario.html] */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const file = process.argv[2] || path.join(__dirname, '..', 'bulario.html');
const html = fs.readFileSync(file, 'utf8');
const startIdx = html.indexOf('const BULARIO_KEY');
if (startIdx < 0) { console.error('marcador BULARIO_KEY nao encontrado'); process.exit(1); }
const scriptStart = html.lastIndexOf('<script>', startIdx);
const scriptEnd = html.indexOf('</script>', startIdx);
if (scriptStart < 0 || scriptEnd < 0) { console.error('tags de script nao encontradas'); process.exit(1); }
let code = html.slice(scriptStart + '<script>'.length, scriptEnd);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulario_check_'));
const checkFile = path.join(outDir, '_bulario_inline.js');
fs.writeFileSync(checkFile, code, 'utf8');
try {
  execFileSync(process.execPath, ['--check', checkFile], { stdio: 'inherit' });
  console.log('[sintaxe] OK (' + code.split('\n').length + ' linhas)');
} catch (e) {
  console.error('[sintaxe] FALHOU');
  process.exit(1);
}

const prelude = `
process.on('unhandledRejection', function(){});
function makeEl(){
  return {
    innerHTML:'', textContent:'', value:'', hidden:false, className:'', style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    appendChild(){}, remove(){}, focus(){}, scrollIntoView(){},
    showModal(){}, close(){}, checked:false, dataset:{},
    getAttribute(){ return null; }, setAttribute(){},
    closest(){ return null; }, contains(){ return false; },
    options:[], length:0, onload:null, onerror:null, src:''
  };
}
const __els = new Map();
global.document = {
  getElementById(id){ if(!__els.has(id)) __els.set(id, makeEl()); return __els.get(id); },
  querySelectorAll(){ return []; },
  querySelector(){ return null; },
  createElement(){ return makeEl(); },
  addEventListener(){},
  head: makeEl(),
  body: Object.assign(makeEl(), { insertBefore(){}, firstChild:null }),
  documentElement: makeEl()
};
global.window = { addEventListener(){}, location:{ href:'', pathname:'/bulario.html' } };
global.location = { pathname:'/bulario.html', href:'' };
global.navigator = { userAgent:'node' };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
global.fetch = function(){ return Promise.reject(new Error('offline no teste')); };
global.alert = function(){};
global.confirm = function(){ return false; };
`;

const tests = `
// ===== TESTES DO MOTOR =====
let falhas = 0, total = 0;
function ok(cond, msg){ total++; if(cond){ console.log('  ok  - ' + msg); }
  else { falhas++; console.log('  FALHOU - ' + msg); } }
function rec(nome, extra){
  return Object.assign({ nome, ingredienteAtivo:'', composicao:'', fabricante:'', formula:'', categoria:'',
    restricoes:'', compatDocs:'', incompatibilidades:'', miscibilidade:'', cuidadosMistura:'', obs:'',
    ph:'', naturezaFisica:'', solubilidade:'', densidade:'' }, extra || {});
}
function setDados(l, i, e){ lista = l || []; infos = i || []; estoque = e || []; }
function setSel(arr){ selProdutos = arr; }
function setTestes(arr){ testes = arr || []; }
function selDe(){ return Array.prototype.slice.call(arguments).map(n => ({ chave: chave(n), nome: n, dose:'', unidade:'' })); }

console.log('1) par incompativel por restricoes');
setDados([rec('Fungicida A', { restricoes:'Nao misturar com Fungicida B.' }), rec('Fungicida B', {})], [], []);
setSel(selDe('Fungicida A','Fungicida B')); setTestes([]);
let a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'classe INCOMPATIBILIDADE (got ' + a.classe + ')');
ok(a.pares.length === 1 && a.pares[0].classe === 'INCOMPATIBILIDADE', 'par marcado incompativel');
ok(String(a.pares[0].evidencia).indexOf('Fungicida A') >= 0, 'evidencia cita a origem');

console.log('2) sem dados -> SEM INFORMACAO + faltantes');
setDados([rec('Prod X'), rec('Prod Y')], [], []);
setSel(selDe('Prod X','Prod Y'));
a = analisarCalda();
ok(a.classe === 'SEM INFORMACAO' || a.classe === 'SEM INFORMAÇÃO', 'classe SEM INFORMACAO (got ' + a.classe + ')');
ok(a.faltantes.length === 2, 'dois produtos com dados faltantes (got ' + a.faltantes.length + ')');
ok(a.faltantes[0].campos.some(c => c.c === 'restrições'), 'falta restricoes listada');
ok(a.faltantes[0].campos.every(c => c.l && c.l.length > 5), 'cada falta explica a limitacao');
ok(a.pares.length === 1 && a.pares[0].classe === 'SEM INFORMAÇÃO', 'par sem informacao');

console.log('3) compatibilidade documentada citando todos -> DOCUMENTADA');
setDados([rec('PrdA',{ compatDocs:'Compativel com PrdA e PrdB na calda.' }), rec('PrdB',{ compatDocs:'Compativel com PrdA e PrdB na calda.' })], [], []);
setSel(selDe('PrdA','PrdB'));
a = analisarCalda();
ok(a.classe === 'DOCUMENTADA', 'DOCUMENTADA (got ' + a.classe + ')');

console.log('4) documento negativo citando todos -> INCOMPATIBILIDADE');
setDados([rec('PrdA',{ compatDocs:'Nao misturar PrdA com PrdB.' }), rec('PrdB',{})], [], []);
setSel(selDe('PrdA','PrdB'));
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'INCOMPAT (got ' + a.classe + ')');

console.log('5) teste do copo identico compativel -> FISICA');
setDados([rec('C1'), rec('C2')], [], []);
setSel(selDe('C1','C2'));
setTestes([{ chave: chaveCalda(['C1','C2']), resultado:'compativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'FÍSICA – TESTE DO COPO', 'FISICA (got ' + a.classe + ')');
ok(a.klass === 'fis', 'klass fis');
ok(a.motivos.some(m => m.indexOf('física') >= 0), 'motivo explica que so cobre a fisica');

console.log('6) teste do copo identico incompativel -> INCOMPATIBILIDADE');
setTestes([{ chave: chaveCalda(['C1','C2']), resultado:'incompativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'INCOMPAT (got ' + a.classe + ')');

console.log('7) pares OK mas sem doc da mistura completa -> SEM INFORMACAO');
setDados([rec('D1'), rec('D2'), rec('D3')], [], []);
setSel(selDe('D1','D2','D3'));
const pk = (x,y) => [chave(x), chave(y)].sort().join('|');
setTestes([
  { chave: pk('D1','D2'), resultado:'compativel', dataTeste:'2026-10-01', produtos:'[]' },
  { chave: pk('D1','D3'), resultado:'compativel', dataTeste:'2026-10-02', produtos:'[]' },
  { chave: pk('D2','D3'), resultado:'compativel', dataTeste:'2026-10-03', produtos:'[]' }
]);
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'mix vira SEM INFORMACAO (got ' + a.classe + ')');
ok(a.motivos.some(m => m.indexOf('MISTURA COMPLETA') >= 0), 'nota sobre a mistura completa presente');
ok(a.pares.length === 3 && a.pares.every(p => p.classe === 'FÍSICA'), 'todos os pares FISICA');

console.log('8) miscibilidade com citacao + negativo -> INCOMPAT');
setDados([rec('Mixa',{ miscibilidade:'Nao misturar Mixa com Mixb em calda unica.' }), rec('Mixb',{})], [], []);
setSel(selDe('Mixa','Mixb')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'miscibilidade negativa vira INCOMPAT (got ' + a.classe + ')');

console.log('9) ordem por texto do fabricante');
let r = recomendarOrdem([rec('W',{cuidadosMistura:'Adicionar primeiro W na calda.'}), rec('L',{})]);
ok(r.base === 'fabricante', 'base fabricante (got ' + r.base + ')');
ok(r.texto.indexOf('Adicionar primeiro W') >= 0, 'cita o texto registrado');

console.log('10) ordem por formulação');
r = recomendarOrdem([rec('E1',{formula:'EC'}), rec('P1',{formula:'WP'})]);
ok(r.base === 'formula', 'base formula (got ' + r.base + ')');
ok(r.sequencia && r.sequencia[0] === 'P1', 'pos antes de EC (got ' + (r.sequencia||[]).join(',') + ')');
r = recomendarOrdem([rec('E1',{formula:'EC'}), rec('N1',{formula:''})]);
ok(r.base === 'nenhuma', 'formulação desconhecida -> nenhuma (got ' + r.base + ')');
r = recomendarOrdem([rec('S1',{formula:'WP'}), rec('S2',{formula:'SC'})]);
ok(r.base === 'formula' && r.texto.indexOf('já segue') >= 0, 'ordem atual ja esta correta');
r = recomendarOrdem([rec('F',{formula:'SC'}), rec('Adj',{formula:'', categoria:'Adjuvante'})]);
ok(r.base === 'formula' && r.sequencia && r.sequencia[1] === 'Adj', 'adjuvante por ultimo');

console.log('11) dados faltantes: completo nao aparece, vazio aparece');
setDados([
  rec('Full',{ fabricante:'X', ingredienteAtivo:'y', formula:'SC', ph:'6,5', naturezaFisica:'Suspensao', restricoes:'ok', compatDocs:'ok' }),
  rec('Vazio')
], [], []);
setSel(selDe('Full','Vazio'));
a = analisarCalda();
ok(!a.faltantes.some(f => f.nome === 'Full'), 'produto completo sem faltantes');
ok(a.faltantes.some(f => f.nome === 'Vazio'), 'produto vazio listado');

console.log('12) painel fisico so com quem tem dados');
setDados([rec('Fis',{ ph:'5,1', naturezaFisica:'Fluido', solubilidade:'TOTAL', densidade:'1,410' }), rec('Sem')], [], []);
setSel(selDe('Fis','Sem'));
a = analisarCalda();
ok(a.fisico.length === 1 && a.fisico[0].nome === 'Fis', 'so produto com dados fisicos');

console.log('13) tagCompat');
ok(tagCompat('INCOMPATIBILIDADE').indexOf('ruim') >= 0, 'tag ruim');
ok(tagCompat('DOCUMENTADA').indexOf('ok') >= 0, 'tag ok');
ok(tagCompat('FÍSICA – TESTE DO COPO').indexOf('fis') >= 0, 'tag fis');
ok(tagCompat('SEM INFORMAÇÃO').indexOf('none') >= 0, 'tag none');

console.log('14) ingredientes ativos diferentes NAO viram compativel');
setDados([rec('A1',{ ingredienteAtivo:'mancozebe' }), rec('B1',{ ingredienteAtivo:'clorotalonil' })], [], []);
setSel(selDe('A1','B1')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'IA diferentes != compativel (got ' + a.classe + ')');

console.log('15) doses e unidades na selecao');
setSel([{ chave: chave('A1'), nome:'A1', dose:'200', unidade:'mL/100 L' },
        { chave: chave('B1'), nome:'B1', dose:'', unidade:'' }]);
a = analisarCalda();
ok(a.pares.length === 1, 'analisa com doses/unidades presentes');

console.log('16) resolverProduto faz merge (fisica do insumos + restricao do bulario)');
setDados(
  [rec('Junto',{ restricoes:'Nao misturar com Par.' })],
  [rec('Junto',{ ph:'7,2', naturezaFisica:'Liquido', restricoes:'' })],
  []);
const rp = resolverProduto('Junto');
ok(rp.restricoes === 'Nao misturar com Par.', 'restricao do bulario preservada');
ok(rp.ph === '7,2' && rp.naturezaFisica === 'Liquido', 'dados fisicos do insumos preenchidos');

console.log('');
console.log((total - falhas) + '/' + total + ' testes passaram.');
if(falhas) process.exit(1);
`;

const runFile = path.join(outDir, '_bulario_run.js');
fs.writeFileSync(runFile, prelude + code + tests, 'utf8');
try {
  execFileSync(process.execPath, [runFile], { stdio: 'inherit' });
  console.log('[testes] OK');
} catch (e) {
  console.error('[testes] FALHOU');
  process.exit(1);
}
