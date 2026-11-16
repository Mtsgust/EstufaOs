/* Extrai o script inline do bulario.html, faz node --check e roda os testes do
   motor (compatibilidade, hierarquia do copo, Base Química, ordem, etapas).
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
function setBq(o){ bq = Object.assign(bqVazio(), o || {}); bqIdx = null; }
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

console.log('5) teste do copo exato compativel -> DOCUMENTADO viaCopo (3 classes)');
setDados([rec('C1'), rec('C2')], [], []);
setSel(selDe('C1','C2'));
setTestes([{ chave: chaveTeste(), resultado:'compativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'DOCUMENTADA', 'DOCUMENTADA (got ' + a.classe + ')');
ok(a.viaCopo === true, 'viaCopo true');
ok(a.klass === 'ok', 'klass ok (indicador de documentado)');
ok(a.motivos.some(m => m.indexOf('física') >= 0), 'motivo explica que so cobre a fisica');

console.log('6) teste do copo exato incompativel -> INCOMPATIBILIDADE');
setTestes([{ chave: chaveTeste(), resultado:'incompativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'INCOMPAT (got ' + a.classe + ')');

console.log('7) pares com teste de copo parcial (3 produtos) -> SEM INFORMACAO');
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
ok(a.pares.length === 3 && a.pares.every(p => p.classe === 'SEM INFORMAÇÃO'),
  'pares SEM INFORMACAO (copo parcial nao reutilizado fora do match exato)');
ok(a.motivos.some(m => m.indexOf('match exato') >= 0), 'motivo explica a falta de match exato');
ok(a.alertas.some(x => x.indexOf('semelhantes') >= 0), 'alerta de teste semelhante presente');

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
const full = a.faltantes.find(f => f.nome === 'Full');
ok(!full || full.campos.every(c => c.c === 'Base Química'),
  'Full: nenhum campo operacional faltando (so a lacuna opcional da Base Quimica)');
ok(a.faltantes.some(f => f.nome === 'Vazio'), 'produto vazio listado');

console.log('12) painel fisico so com quem tem dados');
setDados([rec('Fis',{ ph:'5,1', naturezaFisica:'Fluido', solubilidade:'TOTAL', densidade:'1,410' }), rec('Sem')], [], []);
setSel(selDe('Fis','Sem'));
a = analisarCalda();
ok(a.fisico.length === 1 && a.fisico[0].nome === 'Fis', 'so produto com dados fisicos');
ok(a.fisico[0].origem === 'cadastro', 'origem do cadastro rotulada (got ' + a.fisico[0].origem + ')');

console.log('13) tagCompat (3 indicadores + copo)');
ok(tagCompat('INCOMPATIBILIDADE').indexOf('ruim') >= 0, 'tag ruim');
ok(tagCompat('DOCUMENTADA').indexOf('ok') >= 0, 'tag ok');
ok(tagCompat('DOCUMENTADA', true).indexOf('copo') >= 0, 'tag documentado via copo');
ok(tagCompat('FÍSICA – TESTE DO COPO').indexOf('fis') >= 0, 'tag legada fisica');
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

console.log('17) Q_Restricoes da Base Quimica citando parceiro -> INCOMPATIBILIDADE');
setBq({ produtos:[{id:'P1',nomeComercial:'BqA'},{id:'P2',nomeComercial:'BqB'}],
  restricoes:[{id:'R1',produtoId:'P1',tipo:'incompatibilidade_bula',texto:'Nao misturar BqA com BqB.',status:'aprovado'}] });
setDados([rec('BqA'), rec('BqB')], [], []);
setSel(selDe('BqA','BqB')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'Q_Restricoes -> INCOMPAT (got ' + a.classe + ')');
ok(a.pares[0].evidencia.indexOf('Q_Restricoes') >= 0, 'evidencia cita Q_Restricoes');
ok(a.pares[0].evidencia.indexOf('aprovado') >= 0, 'evidencia cita o status');
setBq({});

console.log('18) Q_Interacoes validada conta; pendente NAO conta');
setBq({ produtos:[{id:'I1',nomeComercial:'IntA'},{id:'I2',nomeComercial:'IntB'}],
  interacoes:[{id:'X1',tipo:'compatibilidade',efeito:'sem incompatibilidade nas condicoes testadas',validacao:'validado'}],
  intComp:[{interacaoId:'X1',entidadeTipo:'produto',entidadeId:'I1'},
           {interacaoId:'X1',entidadeTipo:'produto',entidadeId:'I2'}] });
setDados([rec('IntA'), rec('IntB')], [], []);
setSel(selDe('IntA','IntB')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'DOCUMENTADA', 'Q_Interacoes validada -> DOCUMENTADA (got ' + a.classe + ')');
ok(a.pares[0].evidencia.indexOf('Q_Interacoes') >= 0, 'evidencia cita Q_Interacoes');
setBq({ produtos:[{id:'I1',nomeComercial:'IntA'},{id:'I2',nomeComercial:'IntB'}],
  interacoes:[{id:'X1',tipo:'compatibilidade',efeito:'ok',validacao:'pendente'}],
  intComp:[{interacaoId:'X1',entidadeTipo:'produto',entidadeId:'I1'},
           {interacaoId:'X1',entidadeTipo:'produto',entidadeId:'I2'}] });
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'pendente nao vira base (got ' + a.classe + ')');
setBq({});

console.log('19) hierarquia: copo NAO preenche quando ha base teorica parcial');
setDados([
  rec('PrdT1',{ compatDocs:'Compativel com PrdT1 e PrdT2.' }),
  rec('PrdT2',{ compatDocs:'Compativel com PrdT1 e PrdT2.' }),
  rec('PrdT3')
], [], []);
setSel(selDe('PrdT1','PrdT2','PrdT3'));
setTestes([{ chave: chaveTeste(), resultado:'compativel', dataTeste:'2026-11-10', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'copo nao sobe classe com base parcial (got ' + a.classe + ')');
ok(a.pares.some(p => p.classe === 'DOCUMENTADA' && !p.viaCopo), 'par teorico documentado presente');
ok(a.motivos.some(m => m.indexOf('base teórica parcial') >= 0), 'motivo cita base teorica parcial');
ok(a.motivos.some(m => m.indexOf('Desconhecido') >= 0), 'diz o que continua desconhecido');
setTestes([]);

console.log('20) match exato: doses diferentes quebram o reaproveitamento');
setDados([rec('E1'), rec('E2')], [], []);
setSel(selDe('E1','E2'));
setTestes([{ chave: chaveTeste(), resultado:'compativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'DOCUMENTADA' && a.viaCopo === true, 'sem doses reaproveita (got ' + a.classe + ')');
setSel([{ chave: chave('E1'), nome:'E1', dose:'200', unidade:'mL/100 L' },
        { chave: chave('E2'), nome:'E2', dose:'', unidade:'' }]);
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'doses diferentes => match quebra (got ' + a.classe + ')');
ok(a.alertas.some(x => x.indexOf('semelhantes') >= 0), 'alerta de teste semelhante');
setTestes([]);

console.log('21) enriquecimento BQ: pendente preenche, rejeitado ignorado, fonte registrada');
setBq({ produtos:[{id:'PQ',nomeComercial:'Enr'}],
  propriedades:[
    {entidadeTipo:'produto',entidadeId:'PQ',campo:'ph',valor:'6,8',unidade:'',status:'pendente'},
    {entidadeTipo:'produto',entidadeId:'PQ',campo:'naturezaFisica',valor:'Liquido (fluído)',unidade:'',status:'rejeitado'}] });
setDados([rec('Enr')], [], []);
const rp2 = resolverProduto('Enr');
ok(rp2.ph === '6,8', 'ph pendente preenchido (got ' + rp2.ph + ')');
ok(rp2.fonte_ph === 'pendente', 'fonte registrada (got ' + rp2.fonte_ph + ')');
ok(!rp2.naturezaFisica, 'rejeitado ignorado (got ' + rp2.naturezaFisica + ')');
ok(rp2.bqProdutoId === 'PQ', 'produto bq vinculado');
setBq({});

console.log('22) niveis da ordem (DOCUMENTADA / SUGESTAO TECNICA / NAO DETERMINADA)');
let r2 = recomendarOrdem([rec('W2',{cuidadosMistura:'Adicionar primeiro W2 na calda.'}), rec('L2',{})]);
ok(r2.nivel === 'DOCUMENTADA' && r2.fonte, 'documentada com fonte (got ' + r2.nivel + ')');
r2 = recomendarOrdem([rec('E2b',{formula:'EC'}), rec('P2b',{formula:'WP'})]);
ok(r2.nivel === 'SUGESTÃO TÉCNICA', 'formula -> sugestao tecnica (got ' + r2.nivel + ')');
r2 = recomendarOrdem([rec('N2',{formula:''})]);
ok(r2.nivel === 'NÃO DETERMINADA', 'sem formula -> nao determinada (got ' + r2.nivel + ')');

console.log('23) lacuna: produto fora da Base Quimica aparece nos faltantes');
setBq({});
setDados([rec('ForaBq')], [], []);
const fl = dadosFaltantes([resolverProduto('ForaBq')]);
ok(fl.length === 1 && fl[0].campos.some(c => c.c === 'Base Química'), 'lacuna Base Quimica listada');

console.log('24) ingredientes em comum citados, NUNCA como incompatibilidade');
setBq({ produtos:[{id:'GA',nomeComercial:'GlyA'},{id:'GB',nomeComercial:'GlyB'}],
  ingredientes:[{id:'IG',nome:'Glifosato'}],
  prodIngr:[{produtoId:'GA',ingredienteId:'IG'},{produtoId:'GB',ingredienteId:'IG'}] });
setDados([rec('GlyA'), rec('GlyB')], [], []);
setSel(selDe('GlyA','GlyB')); setTestes([]);
a = analisarCalda();
ok(a.bq && a.bq.comuns.join(',').indexOf('Glifosato') >= 0, 'ingrediente em comum listado');
ok(a.classe !== 'INCOMPATIBILIDADE', 'ingrediente em comum nao vira incompat (got ' + a.classe + ')');
setBq({});

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
