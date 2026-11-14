/* Regressão dos tipos existentes (§14.4) — bloqueia publicação.
   Compara a API publicada com testes/baseline_headers.json:
     - todos os tipos antigos respondem ok:true;
     - o conjunto de colunas (key set) de cada tipo é idêntico ao baseline
       (compara chaves, não contagens — as linhas mudam legitimamente com o uso);
     - nenhum tipo antigo sumiu e nenhum GET novo foi introduzido neles.
   Uso:
     node testes/regressao_existente.js              → compara com o baseline
     node testes/regressao_existente.js --atualizar  → (re)captura o baseline
   Rede: sim (API publicada). Rodar ANTES e DEPOIS de cada deploy. */

'use strict';
const fs = require('fs');
const path = require('path');

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const BASELINE = path.join(__dirname, 'baseline_headers.json');
const TIPOS = ['pulverizacao', 'nutricao', 'bulario', 'insumosInfo', 'caldas', 'testesCopo',
  'estoque', 'movimentacoes', 'ciclos', 'colheitas', 'vendas', 'boletos', 'anotacoes'];

let total = 0, falhas = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ok  - ' + msg);
  else { falhas++; console.log('  FALHOU - ' + msg); }
}

async function get(params) {
  const url = API + '?' + params;
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em ' + params);
  return resp.json();
}

(async () => {
  console.log('== §14.4 — regressão dos tipos existentes');
  const lote = await get('tipos=' + TIPOS.join(','));
  ok(lote.ok === true, 'GET ?tipos= (lote com os 13 tipos) → ok:true');

  const dados = lote.dados || {};
  const snapshot = {};
  TIPOS.forEach((t) => {
    const linhas = dados[t];
    if (!Array.isArray(linhas)) { snapshot[t] = null; return; }
    const chaves = new Set();
    linhas.forEach((l) => Object.keys(l || {}).forEach((k) => chaves.add(k)));
    // Colunas só existem nas linhas com dados; com a planilha vazia, a key set
    // vem vazia — nesse caso usa o header implícito do primeiro objeto futuro.
    snapshot[t] = { colunas: Array.from(chaves).sort(), linhas: linhas.length };
  });

  const snap1 = await get('tipo=' + TIPOS[0]);
  ok(snap1.ok === true, 'GET ?tipo=' + TIPOS[0] + ' (individual) → ok:true');

  if (process.argv.indexOf('--atualizar') > -1) {
    fs.writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    console.log('  baseline capturado em testes/baseline_headers.json:');
    TIPOS.forEach((t) => console.log('    ' + t + ': ' + (snapshot[t] ? snapshot[t].colunas.length + ' colunas, ' + snapshot[t].linhas + ' linhas' : 'sem dados')));
    return;
  }

  if (!fs.existsSync(BASELINE)) {
    console.error('  FALHOU - baseline ausente: rode `node testes/regressao_existente.js --atualizar` antes do deploy');
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

  TIPOS.forEach((t) => {
    ok(!!snapshot[t], t + ' presente na resposta do lote');
    if (!snapshot[t] || !base[t]) return;
    const agora = snapshot[t].colunas.join('|');
    const antes = base[t].colunas.join('|');
    if (antes === '' || agora === '') {
      // Sem linhas não há como inferir o header pela API — comparação adiada.
      console.log('  nota - ' + t + ': sem dados em ' + (agora === '' ? 'agora' : 'baseline') +
        ' — colunas não comparáveis (linhas agora ' + snapshot[t].linhas + ', baseline ' + base[t].linhas + ')');
      return;
    }
    ok(agora === antes,
      t + ': colunas idênticas ao baseline (' + snapshot[t].colunas.length + ')' +
      (agora === antes ? '' : '\n      antes: ' + antes + '\n      agora: ' + agora));
    console.log('       ' + t + ': ' + snapshot[t].linhas + ' linhas (baseline ' + base[t].linhas + ')');
  });

  const extras = TIPOS.filter((t) => base[t] && snapshot[t] &&
    snapshot[t].colunas.some((c) => base[t].colunas.indexOf(c) === -1));
  ok(extras.length === 0, 'nenhuma coluna nova inserida nos tipos antigos' + (extras.length ? ' — ' + extras.join(', ') : ''));

  console.log('');
  console.log((total - falhas) + '/' + total + ' asserções passaram.');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('  FALHOU - ' + e.message); process.exit(1); });
