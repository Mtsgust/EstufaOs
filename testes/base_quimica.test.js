/* Base Química v1.0 — testes Node (§14 da especificação v1.0).
   Cobre:
     §14.1 itens 1–9  — lógica pura + gravação com mocks do Apps Script
     §14.2            — sintaxe dos scripts do backend (vm.Script ~ node --check)
     §14.5            — guarda de escopo: código bq* só passa por bqSheet_ e Q_*
     §12              — nenhuma página (.html/.js) referencia tipos bq*
   Uso: node testes/base_quimica.test.js
   (rede não é usada — o smoke da API publicada fica em api_smoke.test.js) */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ARQ_CODE = path.join(raiz, 'Code.gs');
const ARQ_BQ = path.join(raiz, 'BaseQuimica.js');

let total = 0, falhas = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ok  - ' + msg);
  else { falhas++; console.log('  FALHOU - ' + msg); }
}
function secao(t) { console.log('\n== ' + t); }

const srcCode = fs.readFileSync(ARQ_CODE, 'utf8');
const srcBq = fs.readFileSync(ARQ_BQ, 'utf8');

/* ============================ §14.2 sintaxe ============================ */
secao('§14.2 — sintaxe (Code.gs + BaseQuimica.js)');
try { new vm.Script(srcCode, { filename: 'Code.gs' }); ok(true, 'Code.gs parseia'); }
catch (e) { ok(false, 'Code.gs parseia: ' + e.message); }
try { new vm.Script(srcBq, { filename: 'BaseQuimica.js' }); ok(true, 'BaseQuimica.js parseia'); }
catch (e) { ok(false, 'BaseQuimica.js parseia: ' + e.message); }

/* ==================== utilidades de varredura estática ==================== */
/* Extrai o corpo de uma função top-level contando chaves, ignorando comentários
   e strings (suficiente para os arquivos do backend). */
function corpoFuncao(src, nome) {
  const m = new RegExp('function\\s+' + nome + '\\s*\\(').exec(src);
  if (!m) return null;
  const abre = src.indexOf('{', m.index + m[0].length - 1);
  if (abre < 0) return null;
  let prof = 0;
  for (let j = abre; j < src.length; j++) {
    const ch = src[j], prox = src[j + 1];
    if (ch === '/' && prox === '/') { const f = src.indexOf('\n', j); if (f < 0) return null; j = f; continue; }
    if (ch === '/' && prox === '*') { const f = src.indexOf('*/', j + 2); if (f < 0) return null; j = f + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      j++;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) break;
        j++;
      }
      continue;
    }
    if (ch === '{') prof++;
    else if (ch === '}') { prof--; if (prof === 0) return src.slice(abre + 1, j); }
  }
  return null;
}
function nomesFuncoesBq(src) {
  const out = [], re = /function\s+(bq\w*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/* ========================= §14.5 guarda de escopo ========================= */
secao('§14.5 — varredura de escopo (bq* → bqSheet_ → Q_*)');
const funcoesBq = nomesFuncoesBq(srcBq).concat(nomesFuncoesBq(srcCode));
ok(funcoesBq.length >= 20, 'funções bq* encontradas (' + funcoesBq.length + ')');

let getSheetFora = [];
funcoesBq.forEach((nome) => {
  if (nome === 'bqSheet_') return;
  const corpo = corpoFuncao(srcBq, nome) || corpoFuncao(srcCode, nome);
  if (corpo && /getSheet_\s*\(/.test(corpo)) getSheetFora.push(nome);
});
ok(getSheetFora.length === 0,
  'nenhuma função bq* chama getSheet_ fora de bqSheet_' +
  (getSheetFora.length ? ' — violadores: ' + getSheetFora.join(', ') : ''));

const corpoBqSheet = corpoFuncao(srcBq, 'bqSheet_') || '';
ok(/indexOf\('Q_'\)/.test(corpoBqSheet), 'bqSheet_ exige nome de planilha iniciado em Q_*');
ok(/getSheet_\s*\(/.test(corpoBqSheet), 'bqSheet_ é o ponteiro único para getSheet_');

// Nomes das planilhas operacionais (SHEETS do Code.gs) — nenhum corpo bq* pode citá-los.
const nomesOperacionais = [];
const reName = /name:\s*'([^']+)'/g;
let mn;
while ((mn = reName.exec(srcCode))) nomesOperacionais.push(mn[1]);
ok(nomesOperacionais.length >= 13, 'planilhas operacionais mapeadas (' + nomesOperacionais.length + ')');
let citouOperacional = [];
funcoesBq.forEach((nome) => {
  const corpo = corpoFuncao(srcBq, nome) || corpoFuncao(srcCode, nome) || '';
  nomesOperacionais.forEach((n) => { if (corpo.indexOf("'" + n + "'") > -1) citouOperacional.push(nome + '→' + n); });
});
ok(citouOperacional.length === 0,
  'nenhum corpo bq* cita planilha operacional' +
  (citouOperacional.length ? ' — ' + citouOperacional.join(', ') : ''));

/* ============================ §12 sem interface ============================ */
secao('§12 — nenhuma página referencia tipos bq*');
const PADRAO_BQ = /\btipo\s*=\s*bq|\btipos\s*=[^"'<>]*\bbq|\bbq(Visao|DoGet|DoPost|Produtos|Ingredientes|ProdIngredientes|Formulacoes|Propriedades|Evidencias|Documentos|Restricoes|Culturas|Interacoes|IntComponentes|Historico|Pesquisas|Sheet_|DadosTipo_|Pasta_|Planilha_)/;
function caminhosHtmlJs(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (d.name === 'testes' || d.name === 'node_modules' || d.name === 'backups' || d.name === '.git') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) caminhosHtmlJs(p, acc);
    else if (/\.(html|js)$/.test(d.name) && d.name !== 'BaseQuimica.js') acc.push(p);
  });
  return acc;
}
const arquivosFront = caminhosHtmlJs(raiz, []);
const comBq = arquivosFront.filter((f) => PADRAO_BQ.test(fs.readFileSync(f, 'utf8')));
ok(comBq.length === 0,
  arquivosFront.length + ' arquivos .html/.js sem nenhuma referência a bq*' +
  (comBq.length ? ' — violadores: ' + comBq.map((f) => path.basename(f)).join(', ') : ''));

/* ================= mocks do Apps Script (§14.1 — sem rede) ================= */
function criarMundo() {
  const drive = { pastas: [], arquivos: [] };
  const props = new Map();
  const cache = new Map();
  const abertas = new Map();
  let seq = 0;

  function grid(sheet) {
    const ncols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    return sheet.rows.map((r) => {
      const out = r.slice();
      while (out.length < ncols) out.push('');
      return out;
    });
  }
  function garantir(sheet, row, col) {
    while (sheet.rows.length < row) sheet.rows.push([]);
    const r = sheet.rows[row - 1];
    while (r.length < col) r.push('');
  }
  // Coerção realista do Sheets (pt-BR): string numérica vira número quando a
  // célula NÃO está em formato texto '@'. Sem isso o mock não reproduz o bug
  // de campo '1,410' → 1.41 que motivou a escada de reparo (§5.3).
  function fmtCel(sheet, row, col) {
    if (sheet.cellFmt[row + ',' + col]) return sheet.cellFmt[row + ',' + col];
    return sheet.colFmt[col] || '';
  }
  function coerz(sheet, row, col, v) {
    if (typeof v !== 'string' || fmtCel(sheet, row, col) === '@') return v;
    if (/^[-+]?[0-9]+([.,][0-9]+)?$/.test(v)) return parseFloat(v.replace(',', '.'));
    return v;
  }
  function range(sheet, row, col, nRows, nCols) {
    return {
      getValues() {
        const g = grid(sheet), out = [];
        for (let i = 0; i < nRows; i++) {
          const src = g[row - 1 + i] || [], linha = [];
          for (let j = 0; j < nCols; j++) linha.push(src[col - 1 + j] !== undefined ? src[col - 1 + j] : '');
          out.push(linha);
        }
        return out;
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(vals) {
        vals.forEach((linha, i) => {
          garantir(sheet, row + i, col);
          linha.forEach((v, j) => { sheet.rows[row - 1 + i][col - 1 + j] = coerz(sheet, row + i, col + j, v); });
        });
        return vals;
      },
      setValue(v) { garantir(sheet, row, col); sheet.rows[row - 1][col - 1] = coerz(sheet, row, col, v); return v; },
      setNumberFormat(fmt) {
        sheet.formatos.push({ row, col, nRows, nCols, fmt });
        if (nCols === 1 && nRows === 1) sheet.cellFmt[row + ',' + col] = fmt;
        else if (nCols === 1) sheet.colFmt[col] = fmt;
        return fmt;
      },
      clearContents() { sheet.rows = []; return null; }
    };
  }
  function novoSheet(nome) {
    return {
      name: nome, rows: [], frozen: 0, formatos: [], colFmt: {}, cellFmt: {},
      getRange(a, b, c, d) { return range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d); },
      getDataRange() {
        const g = grid(this);
        return range(this, 1, 1, Math.max(g.length, 1), Math.max(g.length ? g[0].length : 1, 1));
      },
      appendRow(linha) { this.rows.push(linha.slice()); return null; },
      deleteRow(r) { this.rows.splice(r - 1, 1); return null; },
      getLastRow() {
        for (let i = this.rows.length - 1; i >= 0; i--) {
          if (this.rows[i].some((c) => c !== '' && c !== null && c !== undefined)) return i + 1;
        }
        return 0;
      },
      getLastColumn() {
        let max = 0;
        this.rows.forEach((r) => {
          for (let i = r.length - 1; i >= 0; i--) {
            if (r[i] !== '' && r[i] !== null && r[i] !== undefined) { if (i + 1 > max) max = i + 1; break; }
          }
        });
        return max;
      },
      getMaxRows() { return Math.max(this.rows.length, 1000); },
      setFrozenRows(n) { this.frozen = n; return null; }
    };
  }
  function novoSS(id, nome) {
    const abas = new Map();
    return {
      id, nome, abas,
      getSheetByName(n) { return abas.get(n) || null; },
      insertSheet(n) { const s = novoSheet(n); abas.set(n, s); return s; },
      getId() { return id; }
    };
  }
  function arquivoApi(a) {
    return {
      _ref: a,
      getId: () => a.id, getName: () => a.nome, getSize: () => 0,
      getBytes: () => [0], getUrl: () => 'https://drive.invalid/' + a.id,
      getBlob: () => ({ getContentType: () => 'application/octet-stream', getBytes: () => [0] }),
      setSharing() {}
    };
  }
  function pastaApi(p) {
    return {
      getId: () => p.id, getName: () => p.nome,
      addFile(a) { p.arquivos.push(a._ref || a); },
      getFiles() {
        const l = p.arquivos.slice();
        let i = 0;
        return { hasNext: () => i < l.length, next: () => arquivoApi(l[i++]) };
      }
    };
  }

  const ativa = novoSS('ssAtiva', 'EstufaOS (operacional)');
  abertas.set(ativa.id, ativa);

  const DriveApp = {
    createFolder(nome) { const p = { id: 'fld' + (++seq), nome, arquivos: [] }; drive.pastas.push(p); return pastaApi(p); },
    getFoldersByName(nome) {
      const l = drive.pastas.filter((p) => p.nome === nome);
      let i = 0;
      return { hasNext: () => i < l.length, next: () => pastaApi(l[i++]) };
    },
    getFolderById(id) {
      const p = drive.pastas.find((x) => x.id === id);
      if (!p) throw new Error('pasta não encontrada: ' + id);
      return pastaApi(p);
    },
    getFileById(id) {
      const a = drive.arquivos.find((x) => x.id === id);
      if (!a) throw new Error('arquivo não encontrado: ' + id);
      return arquivoApi(a);
    },
    getRootFolder() {
      return { getId: () => 'root', addFile() {}, removeFile() {}, getFiles: () => ({ hasNext: () => false, next: () => null }) };
    }
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet() { return ativa; },
    openById(id) { const ss = abertas.get(id); if (!ss) throw new Error('planilha não encontrada: ' + id); return ss; },
    create(nome) {
      const id = 'ss' + (++seq);
      const ss = novoSS(id, nome);
      abertas.set(id, ss);
      drive.arquivos.push({ id, nome });
      return ss;
    }
  };
  const CacheService = {
    getScriptCache: () => ({
      get(k) { return cache.has(k) ? cache.get(k) : null; },
      put(k, v) { cache.set(k, String(v)); },
      remove(k) { cache.delete(k); }
    })
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty(k) { return props.has(k) ? props.get(k) : null; },
      setProperty(k, v) { props.set(k, String(v)); return String(v); }
    })
  };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const Utilities = { getUuid: () => 'uuid' + (++seq) + 'x' };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(s) { return { _s: String(s), setMimeType(m) { this._m = m; return this; }, getContent() { return this._s; } }; }
  };
  const HtmlService = { createHtmlOutput: (s) => ({ _s: s, setTitle() { return this; } }) };
  const UrlFetchApp = { fetch() { throw new Error('sem rede no teste'); } };
  const CalendarApp = {
    getDefaultCalendar: () => ({
      getName: () => 'Agenda',
      createAllDayEvent() { return { addPopupReminder() {}, getId: () => 'ev1' }; },
      getEventById() { return { deleteEvent() {} }; },
      getEvents: () => []
    }),
    getCalendarById: () => null
  };

  const sandbox = {
    console, DriveApp, SpreadsheetApp, CacheService, PropertiesService,
    LockService, Utilities, ContentService, HtmlService, UrlFetchApp, CalendarApp
  };
  vm.createContext(sandbox);
  new vm.Script(srcCode + '\n;\n' + srcBq + '\n;', { filename: 'Code.gs+BaseQuimica.js' }).runInContext(sandbox);

  return { sandbox, drive, props, cache, ativa };
}

secao('carga do runtime (Code.gs + BaseQuimica.js em vm com mocks)');
let mundo;
try { mundo = criarMundo(); ok(true, 'runtime carregado'); }
catch (e) { ok(false, 'runtime carregado: ' + e.message); console.error(e); process.exit(1); }
const ctx = mundo.sandbox;
const post = (b) => ctx.bqDoPost_(b);

/* ============ estrutura: pasta privada, seeds e formato de texto ============ */
secao('estrutura — pasta privada, seeds Q_Formulacoes, formato @ (§3.1/§5.3/§6.4)');
const abaForm = ctx.getSheet_('bqFormulacoes');
ok(!!abaForm && abaForm.name === 'Q_Formulacoes', 'Q_Formulacoes criada');
ok(abaForm.getLastRow() === 16, 'header + 15 formulações semeadas (got ' + abaForm.getLastRow() + ')');
const hdrForm = abaForm.getRange(1, 1, 1, 11).getValues()[0];
const iCod = hdrForm.indexOf('codigo'), iOrd = hdrForm.indexOf('ordemMistura');
const linhaWP = abaForm.getRange(2, 1, 1, 11).getValues()[0];
ok(linhaWP[iCod] === 'WP' && linhaWP[iOrd] === 1, 'primeira seed = WP, ordem 1');
ctx.getSheet_('bqFormulacoes');
ok(abaForm.getLastRow() === 16, 'segunda chamada não duplica seeds');
ok(ctx.getSheet_('bqProdutos').name === 'Q_Produtos', 'Q_Produtos criada sob demanda');
ok(mundo.ativa.getSheetByName('Q_Produtos') === null && mundo.ativa.getSheetByName('Q_Formulacoes') === null,
  'nenhuma aba Q_* na planilha operacional (isolamento P5)');
ok(!!mundo.props.get('BQ_FOLDER_ID') && !!mundo.props.get('BQ_SPREADSHEET_ID'),
  'BQ_FOLDER_ID e BQ_SPREADSHEET_ID gravados em Script Properties');
const abasPrivadas = [];
mundo.drive.pastas.forEach((p) => abasPrivadas.push(p.nome));
ok(abasPrivadas.indexOf('EstufaOS - Base Quimica (privada)') > -1, 'pasta privada criada no Drive');
const fmts = ctx.getSheet_('bqProdutos').formatos;
const cfgProd = ctx.SHEETS_BQ.bqProdutos;
const colNome = cfgProd.headers.indexOf('nomeComercial') + 1;
const colReg = cfgProd.headers.indexOf('registroMAPA') + 1;
ok(fmts.some((f) => f.col === colNome && f.fmt === '@'), 'nomeComercial em formato texto @');
ok(fmts.some((f) => f.col === colReg && f.fmt === '@'), 'registroMAPA em formato texto @ (anti-coerção)');

/* ============ §5.3 anti-coerção: escada de reparo de texto ============ */
secao('§5.3 — "1,410" nunca vira 1.41 (leitura → @ → apóstrofo)');
const abaProp = ctx.getSheet_('bqPropriedades');
const cfgProp = ctx.SHEETS_BQ.bqPropriedades;
const colValProp = cfgProp.headers.indexOf('valor') + 1;
ok(abaProp.colFmt[colValProp] === '@', 'coluna valor de Q_Propriedades criada com formato @');

// (a) formato intacto: texto grava direto, sem regravação (atalho da escada)
const fmtAntes = abaProp.formatos.length;
const rA = post({
  tipo: 'bqPropriedades', action: 'add',
  data: { entidadeTipo: 'produto', entidadeId: 'QPROD_coag', campo: 'densidade', valor: '3,5', unidade: 'g/mL' },
  evidencia: { campo: 'densidade', valor: '3,5', fonteTipo: 'bula', fonteNome: 'Bula A' }
});
ok(rA.ok, 'propriedade "3,5" criada');
const linA = ctx.bqAcharId_('bqPropriedades', rA.id).linha;
ok(typeof linA[colValProp - 1] === 'string' && linA[colValProp - 1] === '3,5', 'valor "3,5" lido como texto exato (got ' + JSON.stringify(linA[colValProp - 1]) + ')');
ok(abaProp.formatos.length === fmtAntes, 'sem regravação quando o texto já está correto (atalho)');

// (b) formato perdido (ambiente real converteu): coerção detectada e reparada
delete abaProp.colFmt[colValProp];
const abaEvid = ctx.getSheet_('bqEvidencias');
const colValEv = ctx.SHEETS_BQ.bqEvidencias.headers.indexOf('valor') + 1;
delete abaEvid.colFmt[colValEv];
const rB = post({
  tipo: 'bqPropriedades', action: 'add',
  data: { entidadeTipo: 'produto', entidadeId: 'QPROD_coag', campo: 'solubilidade', valor: '1,410' },
  evidencia: { campo: 'solubilidade', valor: '1,410', fonteTipo: 'bula', fonteNome: 'Bula B' }
});
ok(rB.ok, 'propriedade "1,410" criada com formato perdido');
const achB = ctx.bqAcharId_('bqPropriedades', rB.id);
ok(typeof achB.linha[colValProp - 1] === 'string' && achB.linha[colValProp - 1] === '1,410',
  'add reparado: valor lido "1,410" (got ' + JSON.stringify(achB.linha[colValProp - 1]) + ')');
const evB = ctx.bqAcharId_('bqEvidencias', rB.evidenciaId).obj;
ok(typeof evB.valor === 'string' && evB.valor === '1,410', 'evidência também reparada (got ' + JSON.stringify(evB.valor) + ')');

// (c) update com coerção (formato limpo de novo) → zeros à esquerda preservados
delete abaProp.cellFmt[achB.rowIdx + ',' + colValProp];
const rUpdB = post({ tipo: 'bqPropriedades', action: 'update', id: rB.id, data: { valor: '01970123456' } });
ok(rUpdB.ok, 'update de valor aceito');
const linC = ctx.bqAcharId_('bqPropriedades', rB.id).linha;
ok(typeof linC[colValProp - 1] === 'string' && linC[colValProp - 1] === '01970123456',
  'update preserva zeros à esquerda (got ' + JSON.stringify(linC[colValProp - 1]) + ')');

// (d) ramo do apóstrofo (formato não bate → apóstrofo força texto e não fica visível)
const fake = {
  fmts: 0, last: 5,
  getRange() {
    const s = this;
    return {
      getValue: () => s.last,
      setNumberFormat: () => { s.fmts++; return '@'; },
      setValue(v) {
        s.last = (typeof v === 'string' && v.charAt(0) === "'")
          ? v.slice(1)
          : (/^[-+]?[0-9]+([.,][0-9]+)?$/.test(String(v)) ? parseFloat(String(v).replace(',', '.')) : v);
        return v;
      }
    };
  }
};
ctx.bqSetCelula_(fake, 2, 3, '0123', true);
ok(fake.last === '0123' && fake.fmts === 1,
  'ramo apóstrofo: "0123" preservado e apóstrofo não visível (got ' + JSON.stringify(fake.last) + ')');

// (e) colunas numéricas NÃO são protegidas (continuam número)
const f0 = ctx.bqDadosTipo_('bqFormulacoes')[0];
const colOrd = ctx.SHEETS_BQ.bqFormulacoes.headers.indexOf('ordemMistura');
const rOrd = post({ tipo: 'bqFormulacoes', action: 'update', id: f0.id, data: { ordemMistura: '7' } });
ok(rOrd.ok, 'update de ordemMistura aceito');
const ordemLida = ctx.bqAcharId_('bqFormulacoes', f0.id).linha[colOrd];
ok(ordemLida === 7, 'coluna numérica segue número (7), sem forçar texto (got ' + JSON.stringify(ordemLida) + ')');
post({ tipo: 'bqFormulacoes', action: 'update', id: f0.id, data: { ordemMistura: 1 } });
ok(ctx.bqAcharId_('bqFormulacoes', f0.id).linha[colOrd] === 1, 'ordem da seed restaurada para 1');


/* ===================== 1) normalização / deduplicação ===================== */
secao('14.1(1) — normalização e deduplicação');
ok(ctx.bqNomeNormalizado_('NUTRILIFE B+') === ctx.bqNomeNormalizado_('nutrilife b +'), 'caixa/espaços viram a mesma chave');
ok(ctx.bqNomeNormalizado_('Óxido de Cobre') === ctx.bqNomeNormalizado_('oxido de cobre'), 'acentos ignorados');
const listaIng = [
  { nome: 'Mancozebe', nomeNormalizado: 'mancozebe', cas: '8018-01-7' },
  { nome: 'MANCOZEBE', nomeNormalizado: 'mancozebe', cas: '124-04-9' }
];
ok(ctx.bqAchar_(listaIng, 'MANCOZEBE') === listaIng[0], 'busca por nome acha o primeiro');
ok(ctx.bqAchar_(listaIng, 'mancozebe', 'cas', '124-04-9') === listaIng[1], 'CAS diferente NÃO funde as substâncias');
ok(ctx.bqAchar_(listaIng, 'mancozebe', 'cas', '999-99-9') === null, 'CAS inexistente → nada encontrado');

/* ============ 2) parse de ingredientes ativos (nulos preservados) ============ */
secao('14.1(2) — parse do ingrediente_ativo_detalhado (nunca inventa)');
const ativos = ctx.bqParseAtivos_([
  { ingrediente_ativo: 'Sulfato de cobre', grupo_quimico: 'Cobre', concentracao: '125', unidade_medida: 'g/L', percentual: '' },
  { ingrediente_ativo: 'Água' }
]);
ok(ativos.length === 2, '2 ingredientes no payload');
ok(ativos[0].concentracao === '125' && ativos[0].unidade === 'g/L', 'campos completos preservados');
ok(ativos[1].concentracao === null && ativos[1].percentual === null, 'campo ausente vira null (não vira 0 nem "")');
ok(!ativos[1].grupoQuimico && !ativos[1].unidade, 'sem valor heurístico para o incompleto');

/* ====================== 3) guarda de evidência obrigatória ====================== */
secao('14.1(3) — evidência obrigatória (§7.1)');
let r = post({ tipo: 'bqPropriedades', action: 'add', data: { entidadeTipo: 'produto', entidadeId: 'QPROD_x', campo: 'ph', valor: '6,5' } });
ok(!r.ok && r.error === 'evidencia_obrigatoria', 'add de Q_Propriedades sem evidência → evidencia_obrigatoria');
r = post({ tipo: 'bqPropriedades', action: 'add', data: { entidadeTipo: 'produto', entidadeId: 'QPROD_x', campo: 'ph', valor: '6,5', evidenciaId: 'QEVID_que_nao_existe' } });
ok(!r.ok && r.error === 'referencia_invalida', 'evidenciaId inexistente → referencia_invalida');
r = post({
  tipo: 'bqPropriedades', action: 'add',
  data: { entidadeTipo: 'produto', entidadeId: 'QPROD_x', campo: 'ph', valor: '6,5', unidade: 'pH' },
  evidencia: { campo: 'ph', valor: '6,5', fonteTipo: 'ficha_tecnica', fonteNome: 'Ficha X', documentoUrl: 'https://invalid/ficha.pdf' }
});
ok(r.ok && !!r.evidenciaId, 'add com evidência inline aceito e evidência criada');
const propsPh = ctx.bqDadosTipo_('bqPropriedades').filter((p) => p.entidadeId === 'QPROD_x');
ok(propsPh.length === 1 && String(propsPh[0].evidenciaId) === String(r.evidenciaId), 'linha liga à evidência criada');

/* ==================== enums e transições de estado da fila ==================== */
secao('14.1(4) — enums fechados e transições da fila (§8.2)');
ok(ctx.bqEnumValido_('bqProdutos', 'categoria', 'Fungicida'), 'enum válido aceito');
ok(!ctx.bqEnumValido_('bqProdutos', 'categoria', 'CoisaInventada'), 'enum fora do conjunto rejeitado');
ok(!ctx.bqEnumValido_('bqEvidencias', 'fonteTipo', 'chute'), 'enum rejeitado em outra tabela');
ok(ctx.bqEnumValido_('bqProdutos', 'obs', 'texto livre'), 'campo sem enum é livre');
ok(ctx.bqEnumValido_('bqPesquisas', 'prioridade', '2'), 'enum "numérico" aceito como string (Sheets converte)');
const trans = [
  ['pendente', 'pesquisando', true], ['pendente', 'cancelado', true],
  ['pendente', 'extraindo', false], ['pendente', 'concluido', false],
  ['pesquisando', 'identificando', true], ['pesquisando', 'validando', false],
  ['identificando', 'extraindo', true], ['extraindo', 'validando', true],
  ['validando', 'concluido', true], ['validando', 'revisao', true], ['validando', 'pesquisando', false],
  ['revisao', 'concluido', true], ['revisao', 'pesquisando', false],
  ['concluido', 'pendente', false], ['concluido', 'concluido', true],
  ['erro', 'pendente', true], ['cancelado', 'pendente', true], ['cancelado', 'concluido', false],
  ['', 'pesquisando', false], ['pendente', 'estado_inventado', false]
];
trans.forEach(([de, para, esperado]) => {
  const got = ctx.bqTransicaoValida_(de, para);
  ok(got === esperado, `transição ${de || '(vazio)'}→${para} = ${esperado} (got ${got})`);
});

/* ============ 5) soft delete + Q_Historico somente leitura ============ */
secao('14.1(5) — soft delete e histórico protegido (§9.2)');
const rSoft = post({ tipo: 'bqProdutos', action: 'add', data: { nomeComercial: 'Produto Soft', categoria: 'Inseticida' } });
ok(rSoft.ok, 'produto de teste criado');
const nAntes = ctx.bqLinhas_('bqProdutos').rows.length;
const rDel = post({ tipo: 'bqProdutos', action: 'delete', id: rSoft.id });
ok(rDel.ok, 'delete aceito');
const nDepois = ctx.bqLinhas_('bqProdutos').rows.length;
ok(nDepois === nAntes, 'delete não remove linha (soft delete)');
const linhaSoft = ctx.bqAcharId_('bqProdutos', rSoft.id);
ok(linhaSoft && (linhaSoft.obj.excluido === true || linhaSoft.obj.excluido === 'true'), 'coluna excluido = true');
const histExcluir = ctx.bqDadosTipo_('bqHistorico').filter((h) => String(h.entidadeId) === String(rSoft.id) && h.acao === 'excluir');
ok(histExcluir.length === 1, 'histórico registrou acao=excluir');
const rJaDel = post({ tipo: 'bqProdutos', action: 'delete', id: rSoft.id });
ok(rJaDel.ok && rJaDel.jaExcluido === true, 'delete repetido é idempotente');
const rRest = post({ tipo: 'bqProdutos', action: 'restaurar', id: rSoft.id });
ok(rRest.ok && !ctx.bqAcharId_('bqProdutos', rSoft.id).obj.excluido, 'restaurar desfaz o soft delete');
ok(post({ tipo: 'bqHistorico', action: 'add', data: { entidadeTipo: 'produto' } }).error === 'somente_leitura', 'add em Q_Historico → somente_leitura');
ok(post({ tipo: 'bqHistorico', action: 'update', id: 'x', data: { campo: 'y' } }).error === 'somente_leitura', 'update em Q_Historico → somente_leitura');
ok(post({ tipo: 'bqHistorico', action: 'delete', id: 'x' }).error === 'somente_leitura', 'delete em Q_Historico → somente_leitura');

/* ========================= 6) divergência de evidências ========================= */
secao('14.1(6) — divergência detectada, valor existente preservado (§7.3)');
const rDiv = post({
  tipo: 'bqProdutos', action: 'add',
  data: { nomeComercial: 'Prod Diverg', formula: 'SC' },
  evidencia: { campo: 'formula', valor: 'SC', fonteTipo: 'bula', fonteNome: 'Bula v1', documentoUrl: 'https://invalid/b1.pdf' }
});
ok(rDiv.ok, 'produto com campo crítico + evidência criado');
const evs0 = ctx.bqDadosTipo_('bqEvidencias').filter((e) => String(e.entidadeId) === String(rDiv.id));
ok(evs0.length === 1 && evs0[0].status !== 'divergente', '1ª evidência não nasce divergente (status ' + evs0[0].status + ')');
const rDiv2 = post({
  tipo: 'bqProdutos', action: 'update', id: rDiv.id,
  data: { formula: 'WG' },
  evidencia: { campo: 'formula', valor: 'WG', fonteTipo: 'bula', fonteNome: 'Bula v2', documentoUrl: 'https://invalid/b2.pdf' }
});
ok(rDiv2.ok, 'update com evidência inline aceito');
const evs = ctx.bqDadosTipo_('bqEvidencias').filter((e) => String(e.entidadeId) === String(rDiv.id));
ok(evs.length === 2, '2 evidências coexistem (não sobrescreve)');
ok(String(evs[0].valor) === 'SC', 'evidência antiga preservada (valor atual não muda)');
ok(evs[1].status === 'divergente', 'nova evidência nasce divergente');
const histDiv = ctx.bqDadosTipo_('bqHistorico').filter((h) => h.acao === 'divergencia');
ok(histDiv.length === 1, 'histórico registrou acao=divergencia');
ok(String(ctx.bqAcharId_('bqProdutos', rDiv.id).obj.formula) === 'WG', 'produto mudou só porque a evidência veio junto');

/* ============= 7) dedup de importação (contrato da Fase 2, §10.3) ============= */
secao('14.1(7) — deduplicação de importação (idempotência)');
const prodsImport = [
  { id: 'p1', registroMAPA: '12345', nomeNormalizado: 'elatus', titularRegistro: 'Syngenta', excluido: '' },
  { id: 'p2', registroMAPA: '', nomeNormalizado: 'score', titularRegistro: 'Syngenta', excluido: '' },
  { id: 'p3', registroMAPA: '99999', nomeNormalizado: 'score', titularRegistro: 'Outro Lab', excluido: '' },
  { id: 'p4', registroMAPA: '55555', nomeNormalizado: 'infinito', titularRegistro: 'Bayer', excluido: true }
];
let m = ctx.bqProdutoImportMatch_(prodsImport, '12345', 'outra coisa', 'x');
ok(m && m.produto.id === 'p1' && m.criterio === 'registroMAPA', 'registroMAPA casa primeiro');
m = ctx.bqProdutoImportMatch_(prodsImport, '', 'SCORE', 'syngenta');
ok(m && m.produto.id === 'p2' && m.criterio === 'nomeNormalizado+titularRegistro', 'senão nomeNormalizado+titularRegistro');
ok(ctx.bqProdutoImportMatch_(prodsImport, '', 'score', 'Laboratório Nada') === null, 'titular diferente → não casa');
ok(ctx.bqProdutoImportMatch_(prodsImport, '77777', 'genérico', 'ninguém') === null, 'produto novo → null (não deduz)');
m = ctx.bqProdutoImportMatch_(prodsImport, '12345', 'elatus', 'syngenta');
ok(m && m.produto.id === 'p1', 'reimportar o mesmo registro devolve o mesmo produto (idempotente)');
ok(ctx.bqProdutoImportMatch_(prodsImport, '55555', 'infinito', 'bayer') === null, 'produto excluído não casa');

/* ====================== 8) unicidade (produtoId, ingredienteId) ====================== */
secao('14.1(8) — unicidade em Q_Produto_Ingredientes');
const rP8 = post({ tipo: 'bqProdutos', action: 'add', data: { nomeComercial: 'Prod PI' } });
const rI8 = post({ tipo: 'bqIngredientes', action: 'add', data: { nome: 'Ingrediente Teste', cas: '1234-56-7' } });
ok(rP8.ok && rI8.ok, 'produto e ingrediente de teste criados');
const pi1 = post({
  tipo: 'bqProdIngredientes', action: 'add',
  data: { produtoId: rP8.id, ingredienteId: rI8.id, concentracao: '125', unidade: 'g/L' },
  evidencia: { campo: 'concentracao', valor: '125 g/L', fonteTipo: 'bula', fonteNome: 'Bula Prod PI' }
});
ok(pi1.ok, 'primeira relação produto↔ingrediente aceita');
const pi2 = post({
  tipo: 'bqProdIngredientes', action: 'add',
  data: { produtoId: rP8.id, ingredienteId: rI8.id, concentracao: '250', unidade: 'g/L' },
  evidencia: { campo: 'concentracao', valor: '250 g/L', fonteTipo: 'bula', fonteNome: 'Bula Prod PI' }
});
ok(!pi2.ok && pi2.error === 'duplicata', 'segunda relação idêntica → duplicata');
const piLinha = ctx.bqDadosTipo_('bqProdIngredientes').filter((p) => !p.excluido && String(p.produtoId) === String(rP8.id));
ok(piLinha.length === 1, 'só 1 linha ativa do par');

/* ======================= 9) componentes N-áricos ======================= */
secao('14.1(9) — componentes de interação (par = 2, mistura = N)');
const comp = (id) => ({ entidadeTipo: 'produto', entidadeId: id, papel: 'ativo' });
const l3 = ctx.bqLinhasComponentes_('QINT_teste', [comp('a'), comp('b'), comp('c')]);
ok(l3.length === 3, '3 componentes → 3 linhas QIC');
ok(l3[0].ordem === 1 && l3[2].ordem === 3 && l3.every((x) => x.interacaoId === 'QINT_teste'), 'ordem 1..3 e interacaoId propagado');
const l2 = ctx.bqLinhasComponentes_('QINT_teste', [comp('a'), comp('b')]);
ok(l2.length === 2, 'par → 2 linhas QIC');

/* ================== contrato HTTP: hooks do Code.gs (§9.1/§9.2) ================== */
secao('9.1/9.2 — roteamento doGet/doPost (hooks) + bqVisao');
let out = JSON.parse(ctx.doGet({ parameter: { tipo: 'bqProdutos' } }).getContent());
ok(out.ok && Array.isArray(out.data), 'GET ?tipo=bqProdutos → handler bq');
out = JSON.parse(ctx.doGet({ parameter: { tipos: 'bulario,bqProdutos,bqEvidencias' } }).getContent());
ok(out.ok && 'bulario' in out.dados && 'bqProdutos' in out.dados && 'bqEvidencias' in out.dados,
  'lote ?tipos= aceita tipos antigos + bq* misturados');
out = JSON.parse(ctx.doGet({ parameter: { tipo: 'bqVisao', id: rP8.id } }).getContent());
ok(out.ok && out.data && out.data.produto && out.data.produto.id === rP8.id, 'GET ?tipo=bqVisao&id= agrega produto');
ok(Array.isArray(out.data.evidencias), 'bqVisao devolve evidências');
out = JSON.parse(ctx.doGet({ parameter: { tipo: 'bulario' } }).getContent());
ok(out.ok && Array.isArray(out.data), 'tipo antigo continua respondendo igual (regressão leve)');
out = JSON.parse(ctx.doGet({ parameter: { tipo: 'bqInexistente' } }).getContent());
ok(!out.ok && /inválido/.test(out.error), 'tipo bq inexistente → erro controlado (não exceção)');
out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ tipo: 'bqHistorico', action: 'add', data: {} }) } }).getContent());
ok(out.error === 'somente_leitura', 'POST de tipo bq passa pelo hook e cai no bqDoPost_');
out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ tipo: 'bqProdutos', action: 'inventada' }) } }).getContent());
ok(!out.ok && out.error === 'ação inválida', 'ação desconhecida em bq* → ação inválida');
out = JSON.parse(ctx.doGet({ parameter: { tipo: 'tiposInvalido' } }).getContent());
ok(!out.ok, 'tipo desconhecido antigo continua com erro controlado');

/* ============ Fase 2 — importação AGROFIT (§9.3/§10/§14.3) ============ */
secao('Fase 2 — AGROFIT: plano, simulação, execução, fila e vínculo (§10)');

/* Fixture offline do payload de detalhe (§14.3(4) — nunca chama rede). */
const FIX = {
  numero_registro: '99991',
  marca_comercial: ['Fungix 999'],
  titular_registro: 'Coagri Teste Ltda',
  classe_categoria_agronomica: ['Fungicida'],
  formulacao: 'Suspensão Concentrada (SC)',
  ingrediente_ativo: ['Mancozebe', 'Tebuconazol'],
  ingrediente_ativo_detalhado: [
    { ingrediente_ativo: 'Mancozebe', grupo_quimico: 'Ditiocarbamatos', concentracao: '640', unidade_medida: 'g/L', percentual: '' },
    { ingrediente_ativo: 'Tebuconazol', grupo_quimico: 'Triazol', concentracao: '200', unidade_medida: 'g/L', percentual: '' },
    { ingrediente_ativo: 'Mancozebe', grupo_quimico: 'Ditiocarbamatos', concentracao: '640', unidade_medida: 'g/L', percentual: '' }
  ],
  produto_biologico: false,
  url_agrofit: 'https://agrofit.agricultura.gov.br/detalhe/99991',
  documentos: [
    { descricao: 'Bula Fungix 999', tipo_documento: 'Bula', data_inclusao: '2024-05-01', url: 'https://agrofit/bula/99991.pdf' },
    { descricao: 'Bula Fungix 999', tipo_documento: 'Bula', data_inclusao: '2024-06-01', url: 'https://agrofit/bula/99991-v2.pdf' },
    { descricao: 'Bula Fungix 999', tipo_documento: 'Bula', url: 'https://agrofit/bula/99991.pdf' },
    { descricao: 'Ato administrativo', tipo_documento: 'Ato', url: 'https://agrofit/ato/99991.pdf' }
  ],
  culturas_autorizadas: [
    { cultura: 'Soja', estadio: 'V4-V6', dose_referencia: '300 mL/ha', condicao: '' }
  ]
};

// --- helpers puros ---
ok(ctx.bqDocTipo_('Bula') === 'bula' && ctx.bqDocTipo_('ficha técnica') === 'ficha_tecnica',
  'bqDocTipo_ mapeia tipo_documento AGROFIT → enum Q_Documentos');
ok(ctx.bqDocTipo_('Ato') === '', 'tipo_documento desconhecido → vazio (pula, não inventa)');
ok(ctx.bqCategoriaDaClasse_('Fungicida') === 'Fungicida' && ctx.bqCategoriaDaClasse_('Inseticida') === 'Inseticida',
  'classe AGROFIT → categoria enum');
ok(ctx.bqCategoriaDaClasse_('') === '' && ctx.bqCategoriaDaClasse_('Coisa da Natureza') === 'Outros',
  'classe vazia → vazio; fora do padrão → Outros (nunca inventa)');
const detEnv = ctx.bqAgrofitExtrair_({ results: { content: [FIX] } });
ok(detEnv && detEnv.numero_registro === '99991', 'bqAgrofitExtrair_ desaninha envelope results.content');
ok(Array.isArray(ctx.bqAgrofitLista_({ results: [{ numero_registro: '1', marca_comercial: ['A'] }] })) &&
   ctx.bqAgrofitLista_({ results: [{ numero_registro: '1' }] }).length === 1,
  'bqAgrofitLista_ aceita envelope results[]');
ok(ctx.bqAgrofitLista_({ content: [] }).length === 0, 'lista vazia em envelope desconhecido → []');

// --- plano puro (nada é escrito) ---
const atuaisVazio = { produtos: [], ingredientes: [], documentos: [] };
const plan0 = ctx.bqImportPlano_(FIX, atuaisVazio);
ok(plan0.produto.acao === 'criar' && plan0.registro === '99991', 'produto novo → acao criar');
ok(plan0.produto.campos.categoria === 'Fungicida' && plan0.produto.campos.nomeNormalizado === 'fungix999',
  'campos derivados (categoria, nomeNormalizado) preenchidos');
ok(plan0.produto.campos.formula === 'Suspensão Concentrada (SC)', 'formula preservada com acento');
ok(plan0.ingredientes.length === 2 && plan0.relacoes.length === 2,
  'dedup de ingrediente (3 linhas → 2) e par único QPI (2 relações)');
ok(plan0.ingredientes[0].nome === 'Mancozebe' && plan0.ingredientes[1].nome === 'Tebuconazol',
  'ordem do payload preservada');
ok(plan0.documentos.filter((d) => d.acao === 'criar').length === 2 &&
   plan0.documentos.filter((d) => d.motivo === 'url_existente').length === 1 &&
   plan0.documentos.filter((d) => d.motivo === 'tipo_desconhecido').length === 1,
  'docs: 2 criáveis, 1 URL duplicada no payload pula, 1 tipo desconhecido pula');
ok(plan0.culturas.length === 1 && plan0.culturas[0].cultura === 'Soja', 'cultura extraída do payload');
ok(plan0.faltantes.length === 0, 'fixture sem campos obrigatórios faltantes');
const planSemNome = ctx.bqImportPlano_(
  { numero_registro: '99992', marca_comercial: [], classe_categoria_agronomica: ['Fungicida'] }, atuaisVazio);
ok(planSemNome.produto.acao === 'impossivel' && planSemNome.faltantes.indexOf('marca_comercial') > -1,
  'marca_comercial ausente → impossivel + faltantes');
const planExcluido = ctx.bqImportPlano_(FIX, {
  produtos: [{ id: 'QPROD_ex', registroMAPA: '99991', excluido: true }], ingredientes: [], documentos: []
});
ok(planExcluido.produto.acao === 'ignorado_excluido' && planExcluido.produto.id === 'QPROD_ex',
  'registro igual a produto excluído → ignorado_excluido (não reativa)');

// --- substitui: identidade existente com URL nova ---
const planSub = ctx.bqImportPlano_(FIX, {
  produtos: [], ingredientes: [],
  documentos: [{ id: 'QDOC_old', tipo: 'bula', titulo: 'Bula Fungix 999', url: 'https://agrofit/bula/antiga.pdf', excluido: '' }]
});
ok(planSub.documentos[0].acao === 'criar' && planSub.documentos[0].substitui === 'QDOC_old',
  'doc com mesmo tipo+título e URL nova → substitui o anterior');

/* Payload REAL da API (captura ao vivo Elatus 2414, 2026-11-15): campos
   documento_cadastrado / indicacao_uso / classificacao_toxicologica. */
const FIXREAL = {
  numero_registro: '2414',
  marca_comercial: ['Elatus'],
  titular_registro: 'Syngenta Proteção de Cultivos Ltda.',
  classe_categoria_agronomica: ['Fungicida'],
  formulacao: 'WG - Gránulos Dispersíveis em Água',
  ingrediente_ativo_detalhado: [
    { ingrediente_ativo: 'Azoxistrobina', grupo_quimico: 'estrobilurina', concentracao: '300', unidade_medida: 'Gramas por Kilogramas', percentual: '30' }
  ],
  produto_biologico: false,
  classificacao_toxicologica: 'IV - Produto Pouco Tóxico',
  classificacao_ambiental: 'II - Produto Muito Perigoso ao Meio Ambiente',
  url_agrofit: 'https://agrofit.agricultura.gov.br/detalhe/2414',
  documento_cadastrado: [
    { descricao: 'ELATUS_BulaCompleta_09.01.2026', tipo_documento: 'Bula', data_inclusao: '09/01/2026 17:15:49', url: 'https://agrofit/bula/2414.pdf', origem: 'Bula, Rótulo e Certificado' },
    { descricao: 'emitido em 30/04/2014', tipo_documento: 'Certificado', data_inclusao: '27/05/2014 16:05:41', url: 'https://agrofit/cert/2414.pdf', origem: 'Ministério da Agricultura' },
    { descricao: 'ELATUS_RótuloCompleto_09.01.2026', tipo_documento: 'Rótulo', data_inclusao: '09/01/2026 17:15:59', url: 'https://agrofit/rot/2414.pdf', origem: 'Bula, Rótulo e Certificado' }
  ],
  indicacao_uso: [
    { cultura: 'Soja', praga_nome_cientifico: 'Phakopsora pachyrhizi', praga_nome_comum: ['Ferrugem-asiática'] },
    { cultura: 'Soja', praga_nome_cientifico: 'Corynespora cassiicola', praga_nome_comum: ['Mancha-alvo'] },
    { cultura: 'Milho', praga_nome_cientifico: 'Puccinia polysora', praga_nome_comum: ['Ferrugem'] }
  ]
};
ok(ctx.bqDocTipo_('Certificado') === 'registro', '"Certificado" (MAPA) → enum registro (não é desconhecido)');
const planR = ctx.bqImportPlano_(FIXREAL, atuaisVazio);
ok(planR.produto.campos.classeToxicologica === 'IV - Produto Pouco Tóxico' &&
   planR.produto.campos.classeAmbiental === 'II - Produto Muito Perigoso ao Meio Ambiente',
  'classificacao_toxicologica/_ambiental (payload real) → campos do produto');
ok(planR.documentos.length === 3 && planR.documentos.every((d) => d.acao === 'criar') &&
   planR.documentos.filter((d) => d.tipo === 'registro').length === 1,
  'documento_cadastrado: bula+certificado(registro)+rotulo → 3 docs criáveis');
ok(planR.documentos[0].dataDocumento === '09/01/2026', 'data_inclusao dd/MM/yyyy → dataDocumento');
ok(planR.culturas.length === 2 && planR.culturas.some((c) => c.cultura === 'Soja') &&
   planR.culturas.some((c) => c.cultura === 'Milho'),
  'indicacao_uso: Soja×2+Milho → 2 culturas (dedup por cultura+estadio+dose)');
ok(planR.faltantes.length === 0, 'payload real sem campos obrigatórios faltantes');

// --- simulação (§14.3(4)): NÃO escreve em nenhuma planilha bq ---
function totalLinhasBq() {
  return ['bqProdutos', 'bqIngredientes', 'bqProdIngredientes', 'bqDocumentos', 'bqCulturas',
    'bqPesquisas', 'bqEvidencias', 'bqHistorico']
    .reduce((s, t) => s + ctx.bqDadosTipo_(t).length, 0);
}
const lin0 = totalLinhasBq();
const rSim = post({ tipo: 'bqPesquisas', action: 'agrofit', data: { numeroRegistro: '99991', detalhe: FIX } });
ok(rSim.ok && rSim.simular === true, 'action agrofit com simular default → simular:true');
ok(rSim.plano && rSim.plano.produto.acao === 'criar', 'simular devolve o plano');
ok(totalLinhasBq() === lin0, 'simular não escreve em nenhuma planilha bq');
const rSimSem = post({ tipo: 'bqPesquisas', action: 'agrofit', data: { detalhe: { numero_registro: '99992', marca_comercial: [] } } });
ok(rSimSem.ok && rSimSem.plano.produto.acao === 'impossivel',
  'simular expõe payload impossível em vez de exceção');
const rSemCampo = post({ tipo: 'bqPesquisas', action: 'agrofit', data: {} });
ok(!rSemCampo.ok && rSemCampo.error === 'campo_obrigatorio' && rSemCampo.campo === 'numeroRegistro|nome',
  'agrofit sem numeroRegistro|nome → campo_obrigatorio');
ok(post({ tipo: 'bqProdutos', action: 'agrofit', data: {} }).error === 'ação inválida',
  'action agrofit só existe em bqPesquisas (§9.3)');

// --- execução real (simular:false) com fixture offline ---
const rImp1 = post({ tipo: 'bqPesquisas', action: 'agrofit',
  data: { numeroRegistro: '99991', detalhe: FIX, simular: false } });
ok(rImp1.ok && rImp1.simular === false, 'execução aceita com fixture offline');
ok(!!rImp1.produtoId && !!rImp1.filaId, 'produto e fila criados');
const fila1 = ctx.bqAcharId_('bqPesquisas', rImp1.filaId).obj;
ok(String(fila1.estado) === 'concluido' && String(fila1.execucaoPor) === 'ia:import_agrofit',
  'fila concluída com carimbo import_agrofit');
ok(String(fila1.resumoResultado).indexOf('produto criado') === 0, 'resumo da fila: produto criado');
const prod1 = ctx.bqAcharId_('bqProdutos', rImp1.produtoId).obj;
ok(prod1.nomeComercial === 'Fungix 999' && prod1.registroMAPA === '99991',
  'produto criado com registro em texto');
ok(String(prod1.categoria) === 'Fungicida' && String(prod1.statusValidacao) === 'pendente',
  'categoria enum + statusValidacao default');
ok(!!rImp1.evidenciaId, 'add respondeu com o id da evidência do bloco identidade');
const evIdent = ctx.bqDadosTipo_('bqEvidencias').filter((e) => e.campo === 'identidade' && String(e.entidadeId) === String(rImp1.produtoId));
ok(evIdent.length === 1 && evIdent[0].fonteTipo === 'registro_mapa' &&
   evIdent[0].revisadoPor === 'ia:import_agrofit' && evIdent[0].status === 'aprovado',
  'evidência identidade: fonte oficial, carimbo ia, status aprovado');
const hImp = ctx.bqDadosTipo_('bqHistorico').filter((h) => h.acao === 'importar' && String(h.entidadeId) === String(rImp1.produtoId));
ok(hImp.length >= 1, 'histórico registrou acao=importar no produto');
const ingsNovos = ctx.bqDadosTipo_('bqIngredientes').filter((i) => !i.excluido && (i.nome === 'Mancozebe' || i.nome === 'Tebuconazol'));
ok(ingsNovos.length === 2, '2 ingredientes criados');
const pis1 = ctx.bqDadosTipo_('bqProdIngredientes').filter((p) => !p.excluido && String(p.produtoId) === String(rImp1.produtoId));
ok(pis1.length === 2 && pis1.every((p) => !!p.evidenciaId), '2 relações criadas (par único), todas com evidenciaId');
const evComp = ctx.bqDadosTipo_('bqEvidencias').filter((e) => e.campo === 'composicao' && String(e.entidadeId) === String(rImp1.produtoId));
ok(evComp.length === 1 && evComp[0].status === 'aprovado', '1 evidência do bloco composicao (sob demanda)');
const docs1 = ctx.bqDadosTipo_('bqDocumentos').filter((d) => !d.excluido && String(d.url).indexOf('99991') > -1);
ok(docs1.length === 2 && docs1.every((d) => String(d.fonte) === 'agrofit'), '2 documentos agrofit (URL dup e tipo desconhecido pulados)');
ok(rImp1.resultado.pulados.indexOf('documento_url_existente') > -1 &&
   rImp1.resultado.pulados.indexOf('documento_tipo_desconhecido') > -1,
  'pulados registram url_existente e tipo_desconhecido');
const cults1 = ctx.bqDadosTipo_('bqCulturas').filter((c) => String(c.produtoId) === String(rImp1.produtoId));
ok(cults1.length === 1 && cults1[0].cultura === 'Soja' && !!cults1[0].evidenciaId, 'cultura criada com evidência');
ok(!!ctx.bqDadosTipo_('bqEvidencias').find((e) => e.campo === 'autorizacao' && String(e.entidadeId) === String(rImp1.produtoId)),
  'evidência do bloco autorizacao criada');
ok(rImp1.resultado.evidencias === 2, 'resumo: 2 evidências de bloco (composicao + autorizacao)');

// --- idempotência: reimportar o mesmo payload não duplica nada ---
const rImp2 = post({ tipo: 'bqPesquisas', action: 'agrofit',
  data: { numeroRegistro: '99991', detalhe: FIX, simular: false } });
ok(rImp2.ok && rImp2.produtoId === rImp1.produtoId, 'reimport casa o mesmo produto (registroMAPA)');
ok(rImp2.reusado === true && rImp2.filaId === rImp1.filaId, 'fila com mesma consulta é reusada');
ok(ctx.bqDadosTipo_('bqProdutos').filter((p) => !p.excluido && p.registroMAPA === '99991').length === 1,
  'produto não duplicou');
ok(ctx.bqDadosTipo_('bqIngredientes').filter((i) => !i.excluido && i.nome === 'Mancozebe').length === 1,
  'ingrediente não duplicou');
ok(ctx.bqDadosTipo_('bqProdIngredientes').filter((p) => !p.excluido && String(p.produtoId) === String(rImp1.produtoId)).length === 2,
  'relações não duplicaram');
ok(rImp2.resultado.documentos === 0 && rImp2.resultado.culturas === 0 &&
   rImp2.resultado.ingredientes === 0 && rImp2.resultado.relacoes === 0,
  'reimport: 0 criações (tudo idêntico)');
ok(rImp2.resumo.indexOf('produto conferido') === 0, 'reimport: resumo "produto conferido"');

// --- divergente: produto validado não é sobrescrito (§10.3) ---
ok(post({ tipo: 'bqProdutos', action: 'update', id: rImp1.produtoId,
  data: { statusValidacao: 'validado' } }).ok, 'produto marcado como validado');
const FIX_DIV = Object.assign({}, FIX, { formulacao: 'Emulsão Concentrada (EC)' });
const rImpDiv = post({ tipo: 'bqPesquisas', action: 'agrofit',
  data: { numeroRegistro: '99991', detalhe: FIX_DIV, simular: false } });
ok(rImpDiv.ok && rImpDiv.plano.produto.acao === 'divergente', 'plano marca divergente (validado + conflito)');
ok(String(ctx.bqAcharId_('bqProdutos', rImp1.produtoId).obj.formula) === 'Suspensão Concentrada (SC)',
  'divergente NÃO sobrescreve a formula');
ok(rImpDiv.resumo.indexOf('produto conferido') === 0 && rImpDiv.resultado.ingredientes === 0,
  'divergente: resto da importação ignorado (pulado produto_divergente)');
ok(rImpDiv.resultado.pulados.indexOf('produto_divergente') > -1, 'pulados registram produto_divergente');
const evIdent2 = ctx.bqDadosTipo_('bqEvidencias').filter((e) => e.campo === 'identidade' && String(e.entidadeId) === String(rImp1.produtoId));
ok(evIdent2.length === 2 && evIdent2[1].status === 'divergente',
  'evidência divergente coexiste com a anterior (valor anterior preservado)');

// --- ignorado_excluido na execução ---
const rDelEx = post({ tipo: 'bqProdutos', action: 'add',
  data: { nomeComercial: 'Excl Teste', registroMAPA: '99992' },
  evidencia: { campo: 'registroMAPA', valor: '99992', fonteTipo: 'registro_mapa', fonteNome: 'MAPA' } });
ok(rDelEx.ok, 'produto com registro 99992 criado para o teste');
post({ tipo: 'bqProdutos', action: 'delete', id: rDelEx.id });
const rImpEx = post({ tipo: 'bqPesquisas', action: 'agrofit',
  data: { numeroRegistro: '99992', detalhe: Object.assign({}, FIX, { numero_registro: '99992', marca_comercial: ['Excl Teste'] }), simular: false } });
ok(rImpEx.ok && rImpEx.aviso === 'produto_excluido', 'import de registro excluído → aviso, sem exceção');
ok(ctx.bqAcharId_('bqProdutos', rDelEx.id).obj.excluido, 'produto segue excluído (não reativado)');
ok(ctx.bqDadosTipo_('bqPesquisas').filter((q) => String(q.consulta) === '99992').length === 0,
  'nenhuma fila criada para produto excluído');

// --- processar (§10.3): sem token, com falha de rede, com orçamento ---
const rQ = post({ tipo: 'bqPesquisas', action: 'add',
  data: { entidadeTipo: 'produto', entidadeId: rImp1.produtoId, consulta: '123456', fonteAlvo: 'agrofit' } });
ok(rQ.ok && String(ctx.bqAcharId_('bqPesquisas', rQ.id).obj.estado) === 'pendente',
  'item de fila pendente criado');
ok(!mundo.props.has('AGROAPI_TOKEN'), 'nenhum token nas propriedades no teste');
let rProc = post({ tipo: 'bqPesquisas', action: 'processar', data: {} });
ok(!rProc.ok && rProc.error === 'agrofit_token_ausente', 'processar sem token → agrofit_token_ausente');
ok(String(ctx.bqAcharId_('bqPesquisas', rQ.id).obj.estado) === 'pendente',
  'token ausente deixa o item pendente (não vira erro)');
ok(ctx.bqConfigurarAgrofitToken('') === 'vazio', 'bootstrap com token vazio → vazio');
ok(ctx.bqConfigurarAgrofitToken('tok-abc') === 'ok:7' && mundo.props.get('AGROAPI_TOKEN') === 'tok-abc',
  'bootstrap grava AGROAPI_TOKEN nas Script Properties');
ok(ctx.bqAgrofitToken_() === 'tok-abc', 'bqAgrofitToken_ lê o token gravado');
mundo.props.delete('AGROAPI_TOKEN');
mundo.props.set('AGROAPI_TOKEN', 'tok-teste');
rProc = post({ tipo: 'bqPesquisas', action: 'processar', data: { limite: 1 } });
ok(rProc.ok && rProc.processados === 1 && rProc.falhas === 1, 'com token e sem rede → falha controlada, 1 processado');
const filaErr = ctx.bqAcharId_('bqPesquisas', rQ.id).obj;
ok(String(filaErr.estado) === 'erro' && /fetch_falhou/.test(String(filaErr.ultimoErro)),
  'item de erro com ultimoErro registrado');
mundo.props.delete('AGROAPI_TOKEN');
ok(ctx.bqFilaProcessar_({ data: { limite: 0 } }).ok, 'processar com limite inválido usa default (sem pendentes)');
ctx.BQ_FETCH_CONTADOR_ = 150;
const rQ3 = post({ tipo: 'bqPesquisas', action: 'add',
  data: { entidadeTipo: 'produto', entidadeId: rImp1.produtoId, consulta: '99991', fonteAlvo: 'agrofit' } });
rProc = post({ tipo: 'bqPesquisas', action: 'processar', data: {} });
ok(!rProc.ok && rProc.error === 'agrofit_orcamento_excedido', 'orçamento excedido → agrofit_orcamento_excedido');
ok(String(ctx.bqAcharId_('bqPesquisas', rQ3.id).obj.estado) === 'pendente',
  'orçamento excedido deixa o item pendente');
ctx.BQ_FETCH_CONTADOR_ = 0;

// --- vincular (§9.3/§16) ---
ok(post({ tipo: 'bqProdutos', action: 'vincular', data: {} }).error === 'campo_obrigatorio',
  'vincular sem produtoId → campo_obrigatorio');
ok(post({ tipo: 'bqProdutos', action: 'vincular', data: { produtoId: 'QPROD_nao', origemEstoqueId: 'E1' } }).error === 'id não encontrado',
  'vincular com produto inexistente → id não encontrado');
ok(post({ tipo: 'bqProdutos', action: 'vincular', data: { produtoId: rImp1.produtoId, extra: 'x' } }).error === 'campo_desconhecido',
  'vincular com campo desconhecido → campo_desconhecido');
ok(post({ tipo: 'bqProdutos', action: 'vincular', data: { produtoId: rImp1.produtoId } }).error === 'campo_obrigatorio',
  'vincular sem origem → campo_obrigatorio');
const rV = post({ tipo: 'bqProdutos', action: 'vincular',
  data: { produtoId: rImp1.produtoId, origemInfoId: 'INFO1' } });
ok(rV.ok && rV.alterados === 1, 'vínculo com origemInfoId aceito');
ok(String(ctx.bqAcharId_('bqProdutos', rImp1.produtoId).obj.origemInfoId) === 'INFO1', 'origemInfoId gravado');
ok(ctx.bqDadosTipo_('bqHistorico').some((h) => String(h.entidadeId) === String(rImp1.produtoId) && h.campo === 'origemInfoId'),
  'histórico registrou o vínculo');

/* ============================ critério final ============================ */
console.log('');
console.log((total - falhas) + '/' + total + ' asserções passaram.');
if (falhas) process.exit(1);
