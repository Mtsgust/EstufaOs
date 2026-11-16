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

console.log('25) passo 5.5 — avaliacao fisico-quimica VERDE (formula igual, sem alerta)');
setBq({});
setDados([rec('FqA',{formula:'SC - Suspensão Concentrada'}), rec('FqB',{formula:'SC - Suspensão Concentrada'})], [], []);
setSel(selDe('FqA','FqB')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'AVALIACAO_FISICO_QUIMICA', 'classe 5.5 (got ' + a.classe + ')');
ok(a.fisicoQuimico === 'verde' && a.klass === 'ok', 'verde + klass ok (got ' + a.fisicoQuimico + '/' + a.klass + ')');
ok(a.pares[0].classe === 'AVALIACAO_FISICO_QUIMICA' && a.pares[0].fisicoQuimico === 'verde', 'par com a cor');
ok(a.motivos.some(m => m.indexOf('Sem conflito físico-químico aparente') >= 0), 'texto verde');
ok(a.motivos.some(m => m.indexOf('validar com teste do copo') >= 0), 'orienta teste do copo');

console.log('26) passo 5.5 — AMARELO por formulação diferente e por pH distante');
setDados([rec('Fa',{formula:'SC - Suspensão Concentrada'}), rec('Fb',{formula:'WG - Grânulos Dispersíveis em Água'})], [], []);
setSel(selDe('Fa','Fb'));
a = analisarCalda();
ok(a.classe === 'AVALIACAO_FISICO_QUIMICA' && a.fisicoQuimico === 'amarelo', 'formula diferente -> amarelo (got ' + a.fisicoQuimico + ')');
ok(a.klass === 'atencao', 'klass atencao (got ' + a.klass + ')');
ok(a.motivos.some(m => m.indexOf('mistura de formulações') >= 0), 'motivo cita formulações');
setDados([rec('Pa',{ph:'5,1', naturezaFisica:'Liquido'}), rec('Pb',{ph:'7,2', naturezaFisica:'Liquido'})], [], []);
setSel(selDe('Pa','Pb'));
a = analisarCalda();
ok(a.fisicoQuimico === 'amarelo', 'pH distante -> amarelo (got ' + a.fisicoQuimico + ')');
ok(a.motivos.some(m => m.indexOf('diferença de pH') >= 0), 'motivo cita pH');

console.log('27) passo 5.5 — SEM so com dado basico faltando; passos 1 e 5 vencem');
setDados([rec('Gb',{formula:'SC'}), rec('Gv')], [], []);
setSel(selDe('Gb','Gv'));
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'falta dado basico num lado -> SEM (got ' + a.classe + ')');
ok(a.pares[0].classe === 'SEM INFORMAÇÃO', 'par SEM (5.5 so cai aqui)');
setDados([rec('Haz',{formula:'SC', restricoes:'Nao misturar Haz com Hbz.'}), rec('Hbz',{formula:'WG'})], [], []);
setSel(selDe('Haz','Hbz'));
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'passo 1 vence 5.5 (got ' + a.classe + ')');
setDados([rec('Ca',{formula:'SC'}), rec('Cb',{formula:'WG'})], [], []);
setSel(selDe('Ca','Cb'));
setTestes([{ chave: chaveTeste(), resultado:'compativel', dataTeste:'2026-11-01', produtos:'[]' }]);
a = analisarCalda();
ok(a.classe === 'DOCUMENTADA' && a.viaCopo === true, 'passo 5 (copo exato) vence 5.5 (got ' + a.classe + ')');
setTestes([]);

console.log('28) Q_Formulacoes: formula descritiva vira fonte da ordem (AGROFIT)');
setBq({ formacoes:[{id:'F1',codigo:'SC',nome:'Suspensão concentrada',ordemMistura:'2'},
                   {id:'F2',codigo:'WP',nome:'Pó molhável',ordemMistura:'1'}] });
r2 = recomendarOrdem([rec('O1',{formula:'SC - Suspensão Concentrada'}), rec('O2',{formula:'WP - Pó Molhável'})]);
ok(r2.nivel === 'SUGESTÃO TÉCNICA', 'ordem sugestao tecnica (got ' + r2.nivel + ')');
ok(r2.fonte.indexOf('Q_Formulacoes') >= 0, 'fonte Q_Formulacoes (got ' + r2.fonte + ')');
ok(r2.sequencia && r2.sequencia[0] === 'O2', 'WP antes de SC (got ' + (r2.sequencia||[]).join(',') + ')');
setBq({});

console.log('29) interacao por INGREDIENTE ATIVO cobre marcas equivalentes');
setBq({ produtos:[{id:'BA',nomeComercial:'MarcaClor'},{id:'BB',nomeComercial:'MarcaInf'},{id:'BC',nomeComercial:'MarcaOut'}],
  ingredientes:[{id:'ICL',nome:'clorotalonil',grupoQuimico:'isoftalonitrila'},
                {id:'IPR',nome:'Cloridrato de propamocarbe',grupoQuimico:'carbamato'},
                {id:'IFL',nome:'fluopicolide',grupoQuimico:'benzamida'}],
  prodIngr:[{produtoId:'BA',ingredienteId:'ICL'},
            {produtoId:'BB',ingredienteId:'IPR'},{produtoId:'BB',ingredienteId:'IFL'}],
  interacoes:[{id:'XR',tipo:'incompatibilidade_quimica',efeito:'nao misturar clorotalonil com propamocarbe+fluopicolide',validacao:'revisado'}],
  intComp:[{interacaoId:'XR',entidadeTipo:'ingrediente',entidadeId:'ICL',ordem:1},
           {interacaoId:'XR',entidadeTipo:'ingrediente',entidadeId:'IPR',ordem:2},
           {interacaoId:'XR',entidadeTipo:'ingrediente',entidadeId:'IFL',ordem:3}] });
setDados([rec('MarcaClor'), rec('MarcaInf')], [], []);
setSel(selDe('MarcaClor','MarcaInf')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'regra por ativo -> INCOMPAT (got ' + a.classe + ')');
ok(a.pares[0].evidencia.indexOf('Q_Interacoes') >= 0, 'evidencia cita Q_Interacoes');
setDados([rec('MarcaClor'), rec('MarcaOut')], [], []);
setSel(selDe('MarcaClor','MarcaOut'));
a = analisarCalda();
ok(a.classe !== 'INCOMPATIBILIDADE', 'sem TODOS os componentes nao dispara (got ' + a.classe + ')');
setBq({});

console.log('30) interacao por GRUPO QUIMICO (outro ativo do mesmo grupo casa)');
setBq({ produtos:[{id:'GA2',nomeComercial:'GrupoA'},{id:'GB2',nomeComercial:'GrupoB'}],
  ingredientes:[{id:'I1g',nome:'outro triazol',grupoQuimico:'triazol'},
                {id:'I2g',nome:'difenoconazol',grupoQuimico:'triazol'},
                {id:'IPRg',nome:'Cloridrato de propamocarbe',grupoQuimico:'carbamato'}],
  prodIngr:[{produtoId:'GA2',ingredienteId:'I1g'},{produtoId:'GB2',ingredienteId:'IPRg'}],
  interacoes:[{id:'XG',tipo:'antagonismo',efeito:'difenoconazol com propamocarbe reduz eficacia',validacao:'validado'}],
  intComp:[{interacaoId:'XG',entidadeTipo:'ingrediente',entidadeId:'I2g',ordem:1},
           {interacaoId:'XG',entidadeTipo:'ingrediente',entidadeId:'IPRg',ordem:2}] });
setDados([rec('GrupoA'), rec('GrupoB')], [], []);
setSel(selDe('GrupoA','GrupoB')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'INCOMPATIBILIDADE', 'grupo quimico casa componente (got ' + a.classe + ')');
setBq({});

console.log('31) mistura: todos os pares 5.5 -> classe 5.5; 1 produto sem dado -> SEM parcial');
setBq({});
setDados([rec('Ma',{formula:'SC'}), rec('Mb',{formula:'SC'}), rec('Mc',{formula:'SC'})], [], []);
setSel(selDe('Ma','Mb','Mc')); setTestes([]);
a = analisarCalda();
ok(a.classe === 'AVALIACAO_FISICO_QUIMICA' && a.klass === 'ok', 'mistura verde (got ' + a.classe + '/' + a.klass + ')');
setDados([rec('Ma',{formula:'SC'}), rec('Mb',{formula:'SC'}), rec('Mv')], [], []);
setSel(selDe('Ma','Mb','Mv'));
a = analisarCalda();
ok(a.classe === 'SEM INFORMAÇÃO', 'falta dado em 1 -> SEM (got ' + a.classe + ')');
ok(a.pares.filter(p => p.classe === 'AVALIACAO_FISICO_QUIMICA').length === 1, 'so o par com os dois lados cobertos avalia');
ok(a.motivos.some(m => m.indexOf('físico-química teórica disponível') >= 0), 'motivo de informacao parcial');

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
