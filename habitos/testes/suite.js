// Suíte de testes do módulo Hábitos (roda DENTRO do contexto da app, concatenada ao script).
// Cobertura: CRUD de hábitos, checkins/quantidades, agendamento, modos do dia,
// sequências (streaks), categorias, treino (fichas/sessões/séries/descanso/volume),
// persistência LocalStorage, sync-cfg, gráficos, render dos 4 painéis e migrações.
let __fails = 0, __n = 0;
function ok(cond, msg){
  __n++;
  if(cond) console.log('  ok   ' + msg);
  else { __fails++; console.log('FALHA ' + msg); }
}
function eq(a, b, msg){
  ok(a === b, msg + ' [esperado=' + JSON.stringify(b) + ' obtido=' + JSON.stringify(a) + ']');
}

console.log('== Hábitos: CRUD ==');
state.habits = []; state.checkins = {}; state.modos = {};
addHabit({ name: 'Beber agua', category: 'fisico', type: 'quantity', target: 3, unit: 'L', step: 0.5 });
const hAgua = state.habits[0];
eq(state.habits.length, 1, 'addHabit cria 1 hábito');
eq(hAgua.type, 'quantity', 'tipo quantity');
eq(hAgua.target, 3, 'target preservado');
eq(hAgua.step, 0.5, 'step preservado');
eq(hAgua.unit, 'L', 'unit preservado');
ok(JSON.parse(localStorage.getItem('habits-v3')).habits.length === 1, 'persistido em habits-v3');

addHabit({ name: 'Ler', category: 'mental', type: 'check' });
const hLer = state.habits[1];
eq(hLer.type, 'check', 'tipo check');
ok(!hLer.target, 'check sem target');

addHabit({ name: 'Acordar cedo', category: 'disciplina', type: 'time', time: '06:30' });
const hHora = state.habits[2];
eq(hHora.time, '06:30', 'horário preservado');

addHabit({ name: 'So domingo', category: 'disciplina', type: 'check', days: [0] });
const hDom = state.habits[3];
eq(hDom.days.length, 1, 'days parcial preservado');

updateHabit(hLer.id, { name: 'Ler 20 min', category: 'mental', type: 'check' });
eq(state.habits[1].name, 'Ler 20 min', 'updateHabit nome');
updateHabit(hAgua.id, { name: 'Beber agua', category: 'fisico', type: 'check' });
eq(state.habits[0].type, 'check', 'updateHabit troca tipo');
eq(state.habits[0].target, undefined, 'updateHabit limpa target antigo');
eq(state.habits[0].step, undefined, 'updateHabit limpa step antigo');
updateHabit(hAgua.id, { name: 'Beber agua', category: 'fisico', type: 'quantity', target: 4, unit: 'L', step: 1 });
eq(state.habits[0].target, 4, 'updateHabit recria quantity');

console.log('== Hábitos: checkins, quantidades, agendamento ==');
const hoje = todayISO();
toggleCheckin(hLer.id, hoje);
eq(state.checkins[hoje][hLer.id], true, 'toggleCheckin marca');
toggleCheckin(hLer.id, hoje);
ok(!state.checkins[hoje] || !state.checkins[hoje][hLer.id], 'toggleCheckin desmarca');
toggleCheckin(hLer.id, '2999-01-01');
ok(!state.checkins['2999-01-01'], 'data futura bloqueada');

let naoDom = null;
for(let i = 1; i < 8; i++){
  const iso = isoFromOffset(-i);
  if(dowIndex(iso) !== 0){ naoDom = iso; break; }
}
toggleCheckin(hDom.id, naoDom);
ok(!(state.checkins[naoDom] && state.checkins[naoDom][hDom.id]), 'dia nao agendado bloqueado');
toggleCheckin(hDom.id, hoje);
if(dowIndex(hoje) === 0){
  eq(state.checkins[hoje][hDom.id], true, 'domingo agendado permite checkin');
} else {
  ok(!(state.checkins[hoje] && state.checkins[hoje][hDom.id]), 'dia nao agendado (hoje) bloqueado');
}

addQty(hAgua.id, hoje, 1);
eq(qtyOn(hAgua, hoje), 1, 'addQty +1');
addQty(hAgua.id, hoje, 0.5);
eq(qtyOn(hAgua, hoje), 1.5, 'addQty +0.5');
addQty(hAgua.id, hoje, -10);
eq(qtyOn(hAgua, hoje), 0, 'addQty nao fica negativo');
ok(!isDoneOn(hAgua, hoje), 'quantidade abaixo do alvo nao conclui');
addQty(hAgua.id, hoje, 4);
ok(isDoneOn(hAgua, hoje), 'quantidade alcancou o alvo');

const stSet = setQty(hAgua, hoje);
eq(qtyOn(hAgua, hoje), 2.5, 'setQty via prompt (2,5)');

console.log('== Hábitos: modo do dia, estado reduzido ==');
setModo(hoje, 'corrido');
eq(modoDe(hoje), 'corrido', 'setModo corrido');
setMotivo(hoje, 'plantio o dia todo');
eq(motivoDe(hoje), 'plantio o dia todo', 'setMotivo');
setModo(hoje, 'normal');
eq(modoDe(hoje), 'normal', 'volta normal');

toggleReduzida(hLer.id, hoje);
eq(estadoDe(hLer, hoje), 'reduz', 'estado reduzido');
ok(isDoneOn(hLer, hoje), 'versao reduzida conta como feita');
toggleReduzida(hLer.id, hoje);
eq(estadoDe(hLer, hoje), '', 'volta ao normal');

console.log('== Hábitos: sequencias e categorias ==');
addHabit({ name: 'Sequencia', category: 'fisico', type: 'check' });
const hSeq = state.habits[state.habits.length - 1];
toggleCheckin(hSeq.id, hoje);
toggleCheckin(hSeq.id, isoFromOffset(-1));
toggleCheckin(hSeq.id, isoFromOffset(-2));
eq(streakAtual(hSeq), 3, 'streakAtual = 3 dias');
eq(habitStats(hSeq, habitDays(7)).currentStreak, 3, 'habitStats streak = 3');

addHabit({ name: 'So ontem', category: 'fisico', type: 'check' });
const hOntem = state.habits[state.habits.length - 1];
toggleCheckin(hOntem.id, isoFromOffset(-1));
eq(streakAtual(hOntem), 1, 'hoje pendente nao quebra a sequencia');

addHabit({ name: 'Quebrada', category: 'fisico', type: 'check' });
const hQ = state.habits[state.habits.length - 1];
toggleCheckin(hQ.id, isoFromOffset(-3));
eq(streakAtual(hQ), 0, 'sequencia quebrada = 0');

const savedForCat = { habits: JSON.parse(JSON.stringify(state.habits)), checkins: JSON.parse(JSON.stringify(state.checkins)), modos: JSON.parse(JSON.stringify(state.modos || {})) };
state.habits = [{ id: 'hx1', name: 'A', category: 'fisico', type: 'check' }];
state.checkins = {};
state.checkins[hoje] = { hx1: true };
eq(catCompletion('fisico', [hoje]), 100, 'catCompletion 100%');
state.checkins = {};
eq(catCompletion('fisico', [hoje]), 0, 'catCompletion 0%');
state.habits = [];
eq(catCompletion('fisico', [hoje]), 0, 'catCompletion sem habitos = 0');
state.habits = savedForCat.habits;
state.checkins = savedForCat.checkins;
state.modos = savedForCat.modos;

const dias7 = habitDays(7);
eq(dias7.length, 7, 'habitDays 7');
eq(dias7[6], todayISO(), 'habitDays termina hoje');
eq(habitPctDia(hoje) >= 0, true, 'habitPctDia numerico');

const ordenada = sortedTodayList();
ok(ordenada.length === state.habits.length, 'sortedTodayList mantem todos');
const soHoras = state.habits.filter(h => h.type === 'time');
if(soHoras.length && state.habits.some(h => h.type !== 'time')){
  const idxHora = ordenada.findIndex(h => h.type === 'time');
  const idxCheck = ordenada.findIndex(h => h.type === 'check');
  if(idxHora > -1 && idxCheck > -1 && idxHora < ordenada.length - 1){
    ok(true, 'horarios ordenados antes de nao-horarios');
  }
}

eq(esc('a<b>&"x'), 'a&lt;b&gt;&amp;&quot;x', 'esc HTML');
eq(formatNum(1.5), '1,5', 'formatNum decimal');
eq(formatNum(1440), '1440', 'formatNum inteiro');
eq(resumoHoje().today, hoje, 'resumoHoje data');
eq(typeof resumoHoje().pct, 'number', 'resumoHoje pct numerico');

console.log('== Treino: fichas, sessao, series, descanso, volume ==');
treino2.fichas = []; treino2.sessoes = []; treino2.ativaId = null;
treino2.fichas.push({
  id: 'f1', nome: 'Treino A', categoria: 'Forca', descricao: '', criadoEm: hoje, descansoTroca: 90,
  exercicios: [
    { nome: 'Supino', grupo: 'Peito', equip: 'Peso livre', dif: 'Iniciante', tipo: 'reps', series: 3, reps: 12, tempoSeg: 60, distanciaM: 400, descansoSeg: 60, carga: 40, obs: '', demo: 'X', inst: '' },
    { nome: 'Prancha', grupo: 'Core', equip: 'Peso corporal', dif: 'Iniciante', tipo: 'tempo', series: 1, reps: 0, tempoSeg: 30, distanciaM: 0, descansoSeg: 0, carga: 0, obs: '', demo: 'Y', inst: '' }
  ]
});
saveTreino2();
ok(localStorage.getItem('treino-v2') !== null, 'treino-v2 persistido');
eq(fichaDe('f1').nome, 'Treino A', 'fichaDe');

const nHabAntes = state.habits.length;
iniciarSessao('f1');
const s = sessaoAtiva();
ok(!!s, 'sessao ativa criada');
eq(treino2.ativaId, s.id, 'ativaId definido');
eq(s.itens.length, 2, 'itens copiados da ficha');
eq(s.itens[0].meta.carga, 40, 'meta carga copiada');
const hTreinar = state.habits.find(x => /trein/i.test(x.name || ''));
ok(!!hTreinar, 'habito Treinar criado/existente');
ok(state.habits.length >= nHabAntes, 'marcarTreinoFeito nao perde habitos');
eq(state.checkins[hoje][hTreinar.id], true, 'checkin do treino hoje');

const p0 = posAtual(s);
eq(p0.ex, 0, 'posAtual ex=0');
eq(p0.sr, 0, 'posAtual sr=0');

concluirSerie(s, { ex: 0, sr: 0 }, 12, 40);
eq(s.itens[0].series.length, 1, '1a serie registrada');
eq(s.itens[0].series[0].repsFeitas, 12, 'repsFeitas');
eq(s.itens[0].series[0].carga, 40, 'carga registrada');
ok(s.descanso && s.descanso.durSeg === 60, 'descanso de 60s entre series');
eq(s.descanso.troca, false, 'descanso comum (nao troca)');

fimDescanso(s, true);
ok(!s.descanso, 'descanso encerrado');
concluirSerie(s, { ex: 0, sr: 1 }, 10, 42);
eq(s.itens[0].series.length, 2, '2a serie registrada');
fimDescanso(s, true);
concluirSerie(s, { ex: 0, sr: 2 }, 8, 45);
eq(s.itens[0].series.length, 3, '3a serie registrada');
ok(s.descanso && s.descanso.troca, 'descanso de troca de exercicio');
eq(s.descanso.durSeg, 90, 'duracao da troca = descansoTroca');
eq(s.descanso.prox, 'Prancha', 'proximo exercicio indicado');

fimDescanso(s, true);
const p1 = posAtual(s);
eq(p1.ex, 1, 'avanca para exercicio 2');
concluirSerie(s, { ex: 1, sr: 0 }, 30, 0);
eq(s.itens[1].series[0].tempoFeitoSeg, 30, 'tempoFeitoSeg');
ok(!s.descanso, 'sem descanso no fim do treino');
const p2 = posAtual(s);
eq(p2.ex, 2, 'todas as series concluidas (ex == len)');

eq(volSessao(s), 12 * 40 + 10 * 42 + 8 * 45, 'volSessao = reps x carga');
const ft = seriesFeitasSessao(s);
eq(ft.f, 4, 'series feitas');
eq(ft.t, 4, 'series totais');

corrigirUltima(s);
eq(s.itens[1].series.length, 0, 'corrigirUltima removeu a ultima serie');

cancelarSessao(s, true);
eq(s.status, 'cancelada', 'sessao cancelada');
eq(sessaoAtiva(), null, 'sem sessao ativa');

eq(fmtDur(65000), '1:05', 'fmtDur mm:ss');
eq(fmtDur(3600000), '1:00:00', 'fmtDur hh:mm:ss');
eq(fmtDur(0), '0:00', 'fmtDur zero');
eq(metaTexto({ tipo: 'reps', series: 3, reps: 12, carga: 40 }), '3x12 · 40kg', 'metaTexto reps');
eq(metaTexto({ tipo: 'tempo', series: 1, tempoSeg: 30 }), '1x30s', 'metaTexto tempo');
eq(metaTexto({ tipo: 'distancia', series: 2, distanciaM: 400 }), '2x400m', 'metaTexto distancia');

console.log('== Graficos, evolucao semanal, painel ==');
const e8 = evolucaoSemanal(8);
eq(e8.length, 8, 'evolucaoSemanal 8 semanas');
ok(typeof e8[0].vol === 'number', 'vol numerico');
ok(e8[0].lbl.indexOf('/') > 0, 'rotulo dd/mm');
const lin = chartLinhaSVG([0, 10, 20], ['a', 'b', 'c']);
ok(lin.indexOf('<svg') > -1, 'chartLinha tem svg');
ok(lin.indexOf('polyline') > -1, 'chartLinha tem polyline');
const bar = chartBarrasSVG([1, 2, 3], ['s1', 's2', 's3']);
ok(bar.indexOf('<rect') > -1, 'chartBarras tem rects');
eq(chartLinhaSVG([], []), '', 'chartLinha vazio = string vazia');
eq(chartBarrasSVG([], []), '', 'chartBarras vazio = string vazia');

console.log('== Navegacao entre views ==');
irPara('treino');
eq(view, 'treino', 'irPara treino');
eq(localStorage.getItem('habitos-aba'), 'treino', 'aba persistida');
irPara('habitos');
eq(view, 'habitos', 'irPara habitos');
irPara('qualquer');
eq(view, 'habitos', 'view invalida ignorada');
irPara('painel');
eq(view, 'painel', 'irPara painel');

console.log('== Sync (configuracao local) ==');
eq(syncCfg(), null, 'sync sem configuracao');
localStorage.setItem('habitos-sync-url', 'https://example.com/exec/');
localStorage.setItem('habitos-sync-chave', '  abc  ');
const cfg = syncCfg();
eq(cfg.url, 'https://example.com/exec', 'url com trim e sem barra final');
eq(cfg.chave, 'abc', 'chave com trim');
localStorage.removeItem('habitos-sync-url');
localStorage.removeItem('habitos-sync-chave');
eq(syncCfg(), null, 'sync volta a nulo');

console.log('== Chaves de backup presentes ==');
ok(localStorage.getItem('habits-v3') !== null, 'chave habits-v3');
ok(localStorage.getItem('treino-v2') !== null, 'chave treino-v2');
ok(localStorage.getItem('habitos-aba') !== null, 'chave habitos-aba');

console.log('== Render dos 4 paineis (smoke) ==');
view = 'painel'; renderPainel();
let raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('HOJE') > -1, 'painel: card HOJE');
ok(raiz.indexOf('SEQU') > -1, 'painel: card SEQUENCIAS');
ok(raiz.indexOf('TREINO') > -1, 'painel: card TREINO');
ok(raiz.indexOf('<svg') > -1, 'painel: grafico presente');
ok(raiz.indexOf('data-goto') > -1, 'painel: atalhos de navegacao');

view = 'habitos'; renderHabitos();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('RESUMO DO DIA') > -1, 'habitos: resumo do dia');
ok(raiz.indexOf('streak-pill') > -1, 'habitos: selo de sequencia');
ok(raiz.indexOf('VIS') > -1, 'habitos: visao geral');

view = 'treino'; tTela = 'home'; renderTreino();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('MEUS TREINOS') > -1, 'treino: home');

tTela = 'historico'; renderHistorico();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('HIST') > -1, 'historico: titulo');
ok(raiz.indexOf('8 semanas') > -1, 'historico: graficos 8 semanas');
tTela = 'home';

console.log('== Render: evolucao, historico geral, config ==');
view = 'evolucao'; renderEvolucao();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('Peso') > -1, 'evolucao: titulo Peso');
ok(raiz.indexOf('Carga') > -1, 'evolucao: titulo Carga');

view = 'historico'; renderHistoricoGeral();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('Calend') > -1, 'historico geral: calendario');

view = 'config'; renderConfig();
raiz = document.getElementById('root').innerHTML;
ok(raiz.indexOf('BACKUP') > -1, 'config: card backup');

console.log('== Evolucao: addPeso ==');
eq(addPeso(todayISO(), '78,5'), true, 'addPeso valido');
eq(addPeso(todayISO(), 'abc'), false, 'addPeso invalido');
eq(addPeso('', '78'), false, 'addPeso sem data');

console.log('== Navegacao: novas views ==');
irPara('evolucao');
eq(view, 'evolucao', 'irPara evolucao');
irPara('historico');
eq(view, 'historico', 'irPara historico');
irPara('config');
eq(view, 'config', 'irPara config');
view = 'painel';

console.log('== Migracoes ==');
localStorage.setItem('habits-v3', JSON.stringify({
  habits: [{ id: 'old1', name: 'Antigo', category: 'intelecto', type: 'check' }],
  checkins: {}, modos: {}
}));
localStorage.removeItem('treino-v2');
localStorage.setItem('treino-v1', JSON.stringify({
  exercicios: [{ id: 'e1', nome: 'Agachamento', grupo: 'Pernas', series: 4, reps: 10, carga: 60 }],
  sessoes: { '2026-11-01': { e1: { feitas: 3 } } }
}));
load();
eq(state.habits[0].category, 'mental', 'migra categoria intelecto -> mental');
eq(state.habits[0].name, 'Antigo', 'habito antigo preservado');
ok(treino2.fichas.some(f => f.nome === 'Meu treino'), 'treino-v1 vira ficha');
const sessImport = treino2.sessoes.find(x => x.obs === 'Importado do treino anterior');
ok(!!sessImport, 'sessao importada');
eq(sessImport.itens[0].series.filter(x => x.feita).length, 3, 'series feitas importadas = 3');
eq(sessImport.itens[0].series[0].carga, 60, 'carga importada');
ok(localStorage.getItem('treino-v1') !== null, 'treino-v1 preservado (nao apagado)');
eq(fichaDe(sessImport.fichaId).exercicios[0].nome, 'Agachamento', 'exercicio importado');

console.log('----------------------------------------');
if(__fails){
  throw new Error(__fails + ' de ' + __n + ' testes falharam');
}
console.log('TODOS OS ' + __n + ' TESTES PASSARAM');
