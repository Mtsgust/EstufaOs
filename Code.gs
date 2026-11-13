/**
 * Backend único para Pulverizações + Nutrição + Bulário + ESTOQUE.
 * Como atualizar:
 * 1. Abra sua planilha > Extensões > Apps Script
 * 2. Apague tudo e cole este arquivo inteiro
 * 3. Implantar > Gerenciar implantações > Editar > Nova versão (mantém a mesma URL /exec)
 * 4. As abas "Estoque" e "Movimentacoes" são criadas sozinhas no primeiro uso.
 */

var SHEETS = {
  pulverizacao: {
    name: 'Pulverizacoes',
    headers: ['id', 'dataCriacao', 'estufa', 'produto', 'alvo', 'dose', 'dataPrevista', 'status', 'dataExecucao', 'obs', 'litrosAgua', 'litrosPorEstufa']
  },
  nutricao: {
    name: 'Nutricao',
    headers: ['id', 'dataCriacao', 'estufa', 'tipoTarefa', 'produto', 'dose', 'dataPrevista', 'status', 'dataExecucao', 'obs', 'itens', 'dataOriginal', 'baixadoItens']
  },
  bulario: {
    name: 'Bulario',
    // 14 colunas originais preservadas + novas anexadas no fim (migração automática no 1º acesso)
    headers: ['id', 'dataCriacao', 'nome', 'categoria', 'ingredienteAtivo', 'classeToxicologica', 'dose', 'carencia', 'obs', 'bulaLink', 'foto', 'alvos', 'frac', 'culturas',
      'fabricante', 'formula', 'concentracao', 'composicao', 'garantias', 'irac', 'ph', 'restricoes', 'compatDocs', 'fichaLink', 'bulaFileId', 'fonteInfo', 'fonteUrl', 'conferidoEm']
  },
  insumosInfo: {
    name: 'InsumosInfo',
    // 28 colunas originais + 10 anexadas no fim (migração automática no 1º acesso após o deploy)
    headers: ['id', 'dataCriacao', 'estoqueId', 'nome', 'categoria', 'ingredienteAtivo', 'composicao', 'formula', 'concentracao', 'fabricante', 'garantias', 'frac', 'irac', 'ph', 'alvos', 'culturas', 'dose', 'carencia', 'restricoes', 'compatDocs', 'bulaLink', 'fichaLink', 'bulaFileId', 'foto', 'fonteInfo', 'fonteUrl', 'conferidoEm', 'obs',
      'categoriaExtra', 'grupoComercial', 'finalidade', 'tipoAplicacao', 'nutrientes', 'formasQuimicas', 'solubilidade', 'densidade', 'armazenamento', 'origemDado',
      'naturezaFisica', 'miscibilidade', 'incompatibilidades', 'cuidadosMistura']
  },
  caldas: {
    name: 'Caldas',
    headers: ['id', 'dataCriacao', 'nome', 'cultura', 'alvo', 'produtos', 'agua', 'ordem', 'estufas', 'condicoes', 'obs', 'resultado', 'sintomas', 'periodoAval', 'avaliacaoObs', 'atualizadoEm']
  },
  testesCopo: {
    name: 'TestesCopo',
    headers: ['id', 'dataCriacao', 'chave', 'produtos', 'proporcoes', 'ordem', 'agua', 'sinais', 'dataTeste', 'obs', 'resultado']
  },
  estoque: {
    name: 'Estoque',
    headers: ['id', 'dataCriacao', 'nome', 'categoria', 'unidade', 'estoqueAtual', 'estoqueMinimo', 'fornecedor', 'obs', 'foto']
  },
  movimentacoes: {
    name: 'Movimentacoes',
    headers: ['id', 'dataCriacao', 'produtoId', 'produtoNome', 'tipo', 'quantidade', 'unidade', 'origem', 'origemId', 'obs', 'data', 'estufa', 'motivo']
  },
  ciclos: {
    name: 'Ciclos',
    headers: ['id', 'dataCriacao', 'estufa', 'cultura', 'variedade', 'dataPlantio', 'dataInicio', 'dataFim', 'status', 'obs']
  },
  colheitas: {
    name: 'Colheitas',
    headers: ['id', 'dataCriacao', 'cicloId', 'estufa', 'data', 'quantidade', 'unidade', 'obs', 'fechamento']
  },
  vendas: {
    name: 'Vendas',
    headers: ['id', 'dataCriacao', 'data', 'comprador', 'cultura', 'quantidade', 'unidade', 'qtdPaga', 'preco', 'total', 'status', 'obs']
  },
  boletos: {
    name: 'Boletos',
    headers: ['id', 'dataCriacao', 'nome', 'categoria', 'empresa', 'valor', 'vencimento', 'status', 'dataPagamento', 'linhaDigitavel', 'anexoUrl', 'anexoNome', 'eventId', 'obs',
      'docTipo', 'docNumero', 'docEmissao', 'docChave', 'docExtra', 'docTexto']
  },
  anotacoes: {
    name: 'Anotacoes',
    headers: ['id', 'dataCriacao', 'data', 'texto']
  }
};

/* Agenda do Google para os boletos: '' = agenda padrão.
   Para usar outra agenda, cole aqui o ID (Configurações da agenda > ID). */
var CAL_FIN_ID = '';

function getSheet_(tipo) {
  var cfg = SHEETS[tipo];
  if (!cfg) throw new Error('tipo inválido: ' + tipo);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(cfg.name);
  if (!sheet) {
    sheet = ss.insertSheet(cfg.name);
    sheet.appendRow(cfg.headers);
    sheet.setFrozenRows(1);
  } else {
    // Se a planilha existe mas falta alguma coluna (ex: litrosAgua), adiciona no fim
    var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var missing = cfg.headers.filter(function(h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      var startCol = existing.length + 1;
      var row = [];
      for (var mi = 0; mi < existing.length; mi++) row.push('');
      missing.forEach(function(h) { row.push(h); });
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    }
  }
  try {
    var ei = cfg.headers.indexOf('estufa');
    if (ei > -1) sheet.getRange(1, ei + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  } catch (e) {}
  return sheet;
}

function sheetToJSON_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = values.slice(1);
  return rows
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    })
    .filter(function (obj) { return obj.id; });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseNum_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function norm_(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * APELIDOS: nomes alternativos que caem no produto certo.
 * Chave = nome em minúsculas, sem acento, sem espaços/pontuação.
 * Ex: "B+" vira chave "b". "Soil Vita Cal" vira "soilvacal".
 * Para adicionar: descubra a chave (minúsculo, sem acento/espaço) e aponte pro nome oficial do Estoque.
 */
var APELIDOS = {
  'b': 'Nutrilife B+',
  'nutrilifeb': 'Nutrilife B+',
  'nutrileafb': 'Nutrilife B+',
  'nutrileaf': 'Nutrilife B+',
  'soilvacal': 'Carbonato de cálcio',
  'soilvita': 'Carbonato de cálcio',
  'carbonatodecalcio': 'Carbonato de cálcio',
  'thyper': 'Typher',
  'thyper50': 'Typher',
  'toplime': 'Oleo de laranja'
};

function aplicarApelido_(nome) {
  var c = chave_(nome);
  if (APELIDOS[c]) return APELIDOS[c];
  return String(nome || '').trim();
}

/* IGNORAR_ESTOQUE: produtos com controle próprio, fora do app.
   Ex: Soil Mix Total fica num IBC de 1000 L — as baixas dele são
   ignoradas (não criam produto nem movimentação). Para adicionar
   outro, basta pôr o nome na lista. */
var IGNORAR_ESTOQUE = ['Soil Mix Total'];

function ignorar_(nome) {
  var c = chave_(nome);
  for (var i = 0; i < IGNORAR_ESTOQUE.length; i++) {
    if (chave_(IGNORAR_ESTOQUE[i]) === c) return true;
  }
  return false;
}

// Chave "tolerante a erro de digitação": ignora maiúsculas, acentos, espaços e pontuação.
// Ex: "Nutrilife B+" == "nutrilife b +" == "NUTRILIFE-B+".
function chave_(s) {
  var t = norm_(s);
  try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
  return t.replace(/[^a-z0-9]+/g, '');
}

// Conversão universal de unidades (massa: mg/g/kg/t · volume: mL/L, com apelidos).
// Devolve {qtd, aviso}. Entre massa e volume usa densidade ≈ 1 (1 mL ≈ 1 g) e AVISA.
// Se não houver conversão possível, mantém o valor original e AVISA (nunca erra calado).
var UN_MASSA = { mg: 1, g: 1000, kg: 1000000, t: 1000000000 };
var UN_VOL = { ml: 1, l: 1000 };
var UN_ALIAS = {
  ml: 'ml', l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  mg: 'mg', g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  kg: 'kg', kilo: 'kg', quilo: 'kg', kilos: 'kg', quilos: 'kg',
  t: 't', ton: 't', tonelada: 't', toneladas: 't'
};
function converterUnidade_(qtd, de, para) {
  if (!de || !para || norm_(de) === norm_(para)) return { qtd: qtd, aviso: '' };
  var d = UN_ALIAS[norm_(de)] || '', p = UN_ALIAS[norm_(para)] || '';
  if (d && p && d === p) return { qtd: qtd, aviso: '' };
  var dm = UN_MASSA[d], pm = UN_MASSA[p], dv = UN_VOL[d], pv = UN_VOL[p];
  if (dm && pm) return { qtd: qtd * dm / pm, aviso: '' };
  if (dv && pv) return { qtd: qtd * dv / pv, aviso: '' };
  if ((dm && pv) || (dv && pm)) {
    var mlEquiv = dm ? qtd * dm / 1000 : qtd * dv;
    var out = pm ? mlEquiv / (pm / 1000) : mlEquiv / pv;
    return { qtd: out, aviso: 'conversão aproximada ' + de + '→' + para };
  }
  return { qtd: qtd, aviso: 'sem conversão ' + de + '→' + para + ' (descontado valor original)' };
}

/* Cache rápido do servidor: evita reler a planilha toda hora.
   1 chamada com ?tipos=a,b,c vale por N chamadas (bem mais rápido no celular).
   O cache é limpo sozinho a cada escrita (doPost). */
var CACHE_SEG = 90;
function cacheLer_(chave) {
  try {
    var c = CacheService.getScriptCache().get(chave);
    return c ? JSON.parse(c) : null;
  } catch (e) { return null; }
}
function cacheSalvar_(chave, dados) {
  try {
    CacheService.getScriptCache().put(chave, JSON.stringify(dados), CACHE_SEG);
  } catch (e) { /* planilha grande demais p/ cache: segue sem cache */ }
}
function cacheLimpar_(tipo) {
  try { if (tipo) CacheService.getScriptCache().remove('tipo_' + tipo); } catch (e) {}
}
function dadosTipo_(tipo) {
  var cached = cacheLer_('tipo_' + tipo);
  if (cached) return cached;
  var d = sheetToJSON_(getSheet_(tipo));
  cacheSalvar_('tipo_' + tipo, d);
  return d;
}

function doGet(e) {
  try {
    // Anexo (foto/PDF) em base64: o front monta um blob e mostra aqui.
    // (o ?anexo= antigo usa HtmlService e o PDF não renderiza no iframe sandbox.)
    if (e.parameter.anexoB64) return jsonOut_(anexoB64_(e.parameter.anexoB64));
    // Abre anexo (foto/PDF) pela URL do próprio sistema: ?anexo=ID_DO_ARQUIVO
    if (e.parameter.anexo) return anexoHtml_(e.parameter.anexo);
    // Lote: ?tipos=pulverizacao,nutricao,estoque -> 1 chamada só (mais rápido)
    if (e.parameter.tipos) {
      var lista = String(e.parameter.tipos).split(',').map(function (t) { return String(t).trim(); }).filter(function (t) { return t && SHEETS[t]; });
      if (!lista.length) return jsonOut_({ ok: false, error: 'nenhum tipo válido' });
      var out = {};
      lista.forEach(function (t) { out[t] = dadosTipo_(t); });
      return jsonOut_({ ok: true, dados: out });
    }
    var tipo = e.parameter.tipo;
    return jsonOut_({ ok: true, data: dadosTipo_(tipo) });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

// Devolve o anexo em base64 (o front vira blob e exibe — PDF não renderiza em data-URI no HtmlService).
function anexoB64_(id) {
  try {
    var f = DriveApp.getFileById(id);
    var blob = f.getBlob();
    return { ok: true, mime: blob.getContentType() || 'application/octet-stream',
      nome: f.getName(), b64: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) {
    return { ok: false, error: 'Arquivo não encontrado ou sem acesso.' };
  }
}

// Mostra foto/PDF do Drive embutido (não precisa de link compartilhado).
function anexoHtml_(id) {
  try {
    var f = DriveApp.getFileById(id);
    var blob = f.getBlob();
    var mime = blob.getContentType() || 'application/octet-stream';
    var b64 = Utilities.base64Encode(blob.getBytes());
    var nome = String(f.getName()).replace(/[<>&"]/g, '');
    var inner = mime.indexOf('pdf') > -1
      ? '<embed src="data:' + mime + ';base64,' + b64 + '" type="application/pdf" style="width:100%;height:92vh">'
      : '<img src="data:' + mime + ';base64,' + b64 + '" style="max-width:100%;border-radius:12px">';
    return HtmlService.createHtmlOutput(
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + nome + '</title></head>' +
      '<body style="margin:0;background:#0D1B13;display:flex;justify-content:center;padding:12px">' + inner + '</body></html>')
      .setTitle(nome);
  } catch (err) {
    return HtmlService.createHtmlOutput('Arquivo não encontrado ou sem acesso.');
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    var tipo = body.tipo;
    var action = body.action;

    // --- Ação especial do estoque: dá entrada/saída e já atualiza o saldo ---
    if (action === 'movimentar') {
      lock.waitLock(10000);
      var res = movimentar_(body.data || {});
      cacheLimpar_('estoque'); cacheLimpar_('movimentacoes');
      return jsonOut_(res);
    }

    // --- Junta N lançamentos consecutivos em 1 semana (ex: pepino 3x/semana) ---
    if (action === 'fundirSemanas') {
      lock.waitLock(15000);
      var resf = fundirSemanas_(body);
      cacheLimpar_('colheitas'); cacheLimpar_('ciclos');
      return jsonOut_(resf);
    }

    // --- Auditoria: lista produtos com saldo negativo + últimas movimentações ---
    if (action === 'auditarEstoque') {
      lock.waitLock(10000);
      return jsonOut_(auditarEstoque_());
    }

    // --- Desloca as datas dos lançamentos de um ciclo (ex: série importada com início errado) ---
    if (action === 'deslocarDatas') {
      lock.waitLock(15000);
      var resd = deslocarDatas_(body);
      cacheLimpar_('colheitas');
      return jsonOut_(resd);
    }

    // --- Financeiro/Boletos: salvar (cria evento na Agenda), pagar, excluir, anexo ---
    if (action === 'boletoSalvar') {
      lock.waitLock(15000);
      var resb = boletoSalvar_(body.data || {}, body.id || '');
      cacheLimpar_('boletos');
      return jsonOut_(resb);
    }
    if (action === 'boletoPagar') {
      lock.waitLock(15000);
      var resp = boletoPagar_(body.id || '', body.dataPagamento || '');
      cacheLimpar_('boletos');
      return jsonOut_(resp);
    }
    if (action === 'boletoExcluir') {
      lock.waitLock(15000);
      var rese = boletoExcluir_(body.id || '');
      cacheLimpar_('boletos');
      return jsonOut_(rese);
    }
    if (action === 'uploadAnexo') {
      lock.waitLock(30000);
      return jsonOut_(uploadAnexo_(body));
    }
    // --- Bula/ficha: busca de documento oficial, download validado e diagnóstico da pasta ---
    if (action === 'buscarBula') {
      return jsonOut_(buscarBula_(body));
    }
    if (action === 'baixarBula') {
      lock.waitLock(60000);
      return jsonOut_(baixarBula_(body));
    }
    if (action === 'fetchUrl') {
      return jsonOut_(fetchUrlAction_(body));
    }
    if (action === 'diagBula') {
      return jsonOut_(diagBula_(body));
    }
    // --- Lista eventos da Agenda num período (para importar boletos que já estão lá) ---
    if (action === 'listarEventos') {
      lock.waitLock(15000);
      return jsonOut_(listarEventos_(body.inicio || '', body.fim || '', body.limite || 0));
    }
    // --- Marca como pagos todos os pendentes vencidos antes de hoje ---
    if (action === 'pagarAnteriores') {
      lock.waitLock(30000);
      var respa = pagarAnteriores_();
      cacheLimpar_('boletos');
      return jsonOut_(respa);
    }

    // --- Troca todos os lançamentos de uma estufa por uma série semanal digitada ---
    if (action === 'trocarLancamentos') {
      lock.waitLock(15000);
      var rest = trocarLancamentos_(body);
      cacheLimpar_('colheitas'); cacheLimpar_('ciclos');
      return jsonOut_(rest);
    }

    var cfg = SHEETS[tipo];
    var sheet = getSheet_(tipo);

    if (action === 'add') {
      var d = body.data || {};
      var id = Utilities.getUuid();
      var now = new Date();
      var row = cfg.headers.map(function (h) {
        if (h === 'id') return id;
        if (h === 'dataCriacao') return now;
        if (h === 'status') return d.status || 'pendente';
        // "estufa" sempre como texto ("1,3,7"), senão o Sheets converte em data/número
        if (h === 'estufa') return String(d[h] !== undefined ? d[h] : '');
        return d[h] !== undefined ? d[h] : '';
      });
      sheet.appendRow(row);
      cacheLimpar_(tipo);
      return jsonOut_({ ok: true, id: id });
    }

    if (action === 'update') {
      var values = sheet.getDataRange().getValues();
      var headers = values[0];
      var idCol = headers.indexOf('id');
      for (var i = 1; i < values.length; i++) {
        if (values[i][idCol] === body.id) {
          Object.keys(body.data || {}).forEach(function (key) {
            var col = headers.indexOf(key);
            if (col > -1) {
              var v = body.data[key];
              if (key === 'estufa') v = String(v !== undefined ? v : '');
              sheet.getRange(i + 1, col + 1).setValue(v);
            }
          });
          cacheLimpar_(tipo);
          return jsonOut_({ ok: true });
        }
      }
      return jsonOut_({ ok: false, error: 'id não encontrado' });
    }

    if (action === 'delete') {
      var values2 = sheet.getDataRange().getValues();
      var idCol2 = values2[0].indexOf('id');
      for (var j = 1; j < values2.length; j++) {
        if (values2[j][idCol2] === body.id) {
          sheet.deleteRow(j + 1);
          cacheLimpar_(tipo);
          return jsonOut_({ ok: true });
        }
      }
      return jsonOut_({ ok: false, error: 'id não encontrado' });
    }

    return jsonOut_({ ok: false, error: 'ação inválida' });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * data: { produtoId?, produtoNome, tipo: 'entrada'|'saida', quantidade, unidade?, origem?, origemId?, obs?, categoria? }
 * - Procura o produto por ID ou por nome (sem diferenciar maiúsculas).
 * - Se não existir e for entrada (ou vier categoria), cria automaticamente.
 * - Se não existir e for saída, cria com saldo negativo (para não travar o campo) e sinaliza criadoAgora:true.
 * - Registra a movimentação e atualiza Estoque.estoqueAtual de forma atômica (com Lock).
 */
function movimentar_(data) {
  var qtd = parseNum_(data.quantidade);
  if (!qtd || qtd <= 0) return { ok: false, error: 'quantidade inválida' };
  var tipo = data.tipo === 'saida' ? 'saida' : 'entrada';
  var nome = aplicarApelido_(data.produtoNome);
  if (!data.produtoId && !nome) return { ok: false, error: 'produto não informado' };
  if (ignorar_(nome)) return { ok: true, ignorado: true };

  var estSheet = getSheet_('estoque');
  var vals = estSheet.getDataRange().getValues();
  var head = vals[0];
  var cId = head.indexOf('id');
  var cNome = head.indexOf('nome');
  var cSaldo = head.indexOf('estoqueAtual');
  var cUn = head.indexOf('unidade');

  var rowIdx = -1; // 1-based na planilha
  var prodId = data.produtoId || '';
  var prodNome = nome;
  var unidadeMov = data.unidade || '';
  var unidadeProd = unidadeMov;
  var chaveNome = chave_(nome);

  for (var i = 1; i < vals.length; i++) {
    var matchId = prodId && vals[i][cId] === prodId;
    var matchNome = nome && (norm_(vals[i][cNome]) === norm_(nome) || chave_(vals[i][cNome]) === chaveNome);
    if (matchId || matchNome) {
      rowIdx = i + 1;
      prodId = vals[i][cId];
      prodNome = vals[i][cNome];
      unidadeProd = vals[i][cUn] || unidadeMov;
      break;
    }
  }

  // Converte a quantidade da unidade do form para a unidade do cadastro.
  // Ex: saiu 2000 mL mas o estoque é em L -> desconta 2 L.
  // Se a conversão for aproximada/inexistente, o aviso vai na obs e na resposta.
  var conv = converterUnidade_(qtd, unidadeMov, unidadeProd);
  var qtdEstoque = conv.qtd;

  // Saída manual nunca pode deixar saldo negativo (pulverização/nutrição seguem liberadas
  // pela regra do sistema: origem delas não é 'manual').
  if (tipo === 'saida' && norm_(data.origem || 'manual') === 'manual' && rowIdx !== -1) {
    var saldoDisp = parseNum_(estSheet.getRange(rowIdx, cSaldo + 1).getValue());
    if (qtdEstoque > saldoDisp + 1e-9) {
      return { ok: false, error: 'Saldo insuficiente: disponível ' + (Math.round(saldoDisp * 100) / 100) + ' ' + (unidadeProd || '') };
    }
  }

  var criadoAgora = false;
  var novoSaldo = 0;

  if (rowIdx === -1) {
    // Cria o produto automaticamente
    criadoAgora = true;
    prodId = Utilities.getUuid();
    novoSaldo = (tipo === 'entrada' ? qtd : -qtd);
    unidadeProd = data.unidade || 'mL';
    qtdEstoque = qtd;
    estSheet.appendRow([prodId, new Date(), prodNome || 'Sem nome',
      data.categoria || 'Defensivo', unidadeProd,
      novoSaldo, data.estoqueMinimo || 0, data.fornecedor || '', data.obsProduto || '']);
  } else {
    var saldoAtual = parseNum_(estSheet.getRange(rowIdx, cSaldo + 1).getValue());
    novoSaldo = saldoAtual + (tipo === 'entrada' ? qtdEstoque : -qtdEstoque);
    estSheet.getRange(rowIdx, cSaldo + 1).setValue(novoSaldo);
  }

  var obsFinal = data.obs || '';
  if (unidadeMov && unidadeProd && norm_(unidadeMov) !== norm_(unidadeProd)) {
    obsFinal = (obsFinal ? obsFinal + ' ' : '') + '[' + qtd + ' ' + unidadeMov + ' = ' + Math.round(qtdEstoque * 1000) / 1000 + ' ' + unidadeProd + ']';
  }
  if (conv.aviso) obsFinal = (obsFinal ? obsFinal + ' ' : '') + '[' + conv.aviso + ']';

  var movSheet = getSheet_('movimentacoes');
  movSheet.appendRow([Utilities.getUuid(), new Date(), prodId, prodNome, tipo,
    qtdEstoque, unidadeProd || '', data.origem || 'manual', data.origemId || '', obsFinal,
    dataISO_(data.data) || new Date(), data.estufa || '', data.motivo || '']);

  return { ok: true, produtoId: prodId, produtoNome: prodNome, novoSaldo: novoSaldo, criadoAgora: criadoAgora, aviso: conv.aviso || '' };
}

// Normaliza data da planilha para 'aaaa-mm-dd'.
function dataISO_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  var s = String(v || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var a = m[3].length === 2 ? '20' + m[3] : m[3];
    return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return '';
}

function somaDiasISO_(iso, dias) {
  var p = iso.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * fundirSemanas_: junta lançamentos consecutivos de uma estufa em semanas.
 * body: { estufa, porSemana (padrão 3), inicio ('aaaa-mm-dd', início correto) }
 * - Ordena por data, agrupa de N em N, soma por unidade (KG/CX separados).
 * - Apaga os originais e grava 1 lançamento por semana (data = inicio + 7 dias).
 * - Atualiza o dataInicio do ciclo ativo (reordena a aba Geral).
 */
function fundirSemanas_(body) {
  var est = norm_(body.estufa);
  if (!est) return { ok: false, error: 'estufa não informada' };
  var n = Math.max(2, parseInt(body.porSemana, 10) || 3);
  var inicio = dataISO_(body.inicio);
  var hSheet = getSheet_('colheitas');
  var vals = hSheet.getDataRange().getValues();
  if (vals.length < 2) return { ok: false, error: 'sem lançamentos' };
  var head = vals[0];
  var cEst = head.indexOf('estufa'), cData = head.indexOf('data'),
      cQtd = head.indexOf('quantidade'), cUn = head.indexOf('unidade'),
      cCiclo = head.indexOf('cicloId');
  var itens = [];
  for (var i = 1; i < vals.length; i++) {
    if (norm_(vals[i][cEst]) === est) {
      itens.push({
        row: i + 1, data: dataISO_(vals[i][cData]), cicloId: vals[i][cCiclo],
        qtd: parseNum_(vals[i][cQtd]), un: String(vals[i][cUn] || 'CX').toUpperCase()
      });
    }
  }
  if (itens.length < 2) return { ok: false, error: 'poucos lançamentos na estufa ' + body.estufa };
  itens.sort(function (a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return a.row - b.row;
  });
  if (!inicio) inicio = itens[0].data;
  if (!inicio) return { ok: false, error: 'informe o início correto' };
  var grupos = [];
  for (var g = 0; g < itens.length; g += n) grupos.push(itens.slice(g, g + n));
  var novas = [];
  grupos.forEach(function (gr, gi) {
    var porUn = {};
    gr.forEach(function (it) { porUn[it.un] = (porUn[it.un] || 0) + it.qtd; });
    var dt = somaDiasISO_(inicio, gi * 7);
    Object.keys(porUn).forEach(function (u) {
      novas.push([Utilities.getUuid(), new Date(), gr[0].cicloId, body.estufa, dt,
        Math.round(porUn[u] * 100) / 100, u, 'Semana fundida (' + gr.length + ' colheitas)']);
    });
  });
  var rows = itens.map(function (it) { return it.row; }).sort(function (a, b) { return b - a; });
  rows.forEach(function (r) { hSheet.deleteRow(r); });
  novas.forEach(function (r) { hSheet.appendRow(r); });
  if (body.inicio) {
    try {
      var cSheet = getSheet_('ciclos');
      var cv = cSheet.getDataRange().getValues();
      var ch = cv[0];
      var eC = ch.indexOf('estufa'), sC = ch.indexOf('status'), iC = ch.indexOf('dataInicio');
      for (var k = cv.length - 1; k >= 1; k--) {
        if (norm_(cv[k][eC]) === est && norm_(cv[k][sC]) === 'ativa') {
          cSheet.getRange(k + 1, iC + 1).setValue(inicio);
          break;
        }
      }
    } catch (e) {}
  }
  return { ok: true, fundidos: itens.length, semanas: grupos.length, inicio: inicio };
}

/**
 * auditarEstoque_: devolve produtos com saldo negativo e as 3 últimas
 * movimentações de cada um (para achar baixas com conversão errada).
 */
function auditarEstoque_() {
  var estSheet = getSheet_('estoque');
  var vals = estSheet.getDataRange().getValues();
  if (vals.length < 2) return { ok: true, problemas: [] };
  var head = vals[0];
  var cId = head.indexOf('id'), cNome = head.indexOf('nome'),
      cSaldo = head.indexOf('estoqueAtual'), cUn = head.indexOf('unidade'),
      cMin = head.indexOf('estoqueMinimo');
  var movs = [];
  try {
    var mv = getSheet_('movimentacoes').getDataRange().getValues();
    var mh = mv[0];
    var mPid = mh.indexOf('produtoId'), mTipo = mh.indexOf('tipo'), mQtd = mh.indexOf('quantidade'),
        mUn = mh.indexOf('unidade'), mOri = mh.indexOf('origem'), mObs = mh.indexOf('obs'), mDt = mh.indexOf('dataCriacao');
    for (var i = 1; i < mv.length; i++) {
      movs.push({ pid: mv[i][mPid], tipo: mv[i][mTipo], qtd: mv[i][mQtd], un: mv[i][mUn],
        origem: mv[i][mOri], obs: String(mv[i][mObs] || ''), data: mv[i][mDt] });
    }
  } catch (e) {}
  var problemas = [];
  for (var k = 1; k < vals.length; k++) {
    var saldo = parseNum_(vals[k][cSaldo]);
    if (saldo < 0) {
      var pid = vals[k][cId];
      var ult = movs.filter(function (m) { return m.pid === pid; }).slice(-3).reverse();
      problemas.push({ nome: vals[k][cNome], unidade: vals[k][cUn], saldo: saldo,
        minimo: vals[k][cMin], ultimas: ult });
    }
  }
  return { ok: true, problemas: problemas };
}

/**
 * deslocarDatas_: soma N dias nas datas dos lançamentos de um ciclo.
 * body: { cicloId, dias } (dias pode ser negativo)
 */
function deslocarDatas_(body) {
  var dias = parseInt(body.dias, 10) || 0;
  if (!dias || !body.cicloId) return { ok: false, error: 'informe o ciclo e os dias' };
  var hSheet = getSheet_('colheitas');
  var vals = hSheet.getDataRange().getValues();
  if (vals.length < 2) return { ok: false, error: 'sem lançamentos' };
  var head = vals[0];
  var cCiclo = head.indexOf('cicloId'), cData = head.indexOf('data');
  var n = 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][cCiclo]) === String(body.cicloId)) {
      var iso = dataISO_(vals[i][cData]);
      if (iso) { hSheet.getRange(i + 1, cData + 1).setValue(somaDiasISO_(iso, dias)); n++; }
    }
  }
  return { ok: true, movidos: n };
}

/**
 * Financeiro/Boletos + Google Agenda.
 * - Salvar cria evento de dia inteiro no vencimento com lembretes 7d, 3d e 2h antes.
 * - Pagar registra dataPagamento e apaga o evento. Excluir apaga o evento e a linha.
 * - Anexo (foto/PDF) vai para a pasta "Boletos EstufaOS" no Drive; a planilha guarda o link.
 */
function calFin_() {
  return CAL_FIN_ID ? CalendarApp.getCalendarById(CAL_FIN_ID) : CalendarApp.getDefaultCalendar();
}
// Rode esta função uma vez no editor (Executar) para autorizar Agenda + Drive.
function testarAgenda() {
  return 'Agenda: ' + calFin_().getName() + ' | Drive OK: ' + !!DriveApp.getRootFolder();
}
function criarEventoBoleto_(nome, categoria, valor, vencISO, linha) {
  try {
    var d = new Date(vencISO + 'T00:00:00');
    var ev = calFin_().createAllDayEvent('Boleto: ' + nome + ' — R$ ' + valor,
      d, { description: 'Boleto EstufaOS\nConta: ' + nome + '\nCategoria: ' + categoria +
        '\nValor: R$ ' + valor + '\nVencimento: ' + vencISO + '\nLinha: ' + (linha || '-') });
    ev.addPopupReminder(7 * 24 * 60);
    ev.addPopupReminder(3 * 24 * 60);
    ev.addPopupReminder(120);
    return ev.getId();
  } catch (e) { return ''; }
}
function excluirEventoBoleto_(eventId) {
  try { if (eventId) calFin_().getEventById(eventId).deleteEvent(); } catch (e) {}
}
function listarEventos_(ini, fim, limite) {
  var d0 = ini ? new Date(ini + 'T00:00:00') : new Date();
  if (!ini) d0.setMonth(d0.getMonth() - 3);
  var d1 = fim ? new Date(fim + 'T00:00:00') : new Date();
  if (!fim) d1.setMonth(d1.getMonth() + 12);
  var evs = calFin_().getEvents(d0, d1);
  var max = Math.min(parseInt(limite, 10) || 500, 1000);
  return {
    ok: true, total: evs.length, eventos: evs.slice(0, max).map(function (e) {
      var s = e.getStartTime();
      return { id: e.getId(), titulo: e.getTitle(), descricao: e.getDescription() || '',
        data: s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') + '-' + String(s.getDate()).padStart(2, '0'),
        diaInteiro: e.isAllDayEvent() };
    })
  };
}
/**
 * pagarAnteriores_: marca como pagos todos os boletos pendentes com
 * vencimento anterior a hoje (dataPagamento = vencimento). Os eventos ficam na Agenda.
 */
function pagarAnteriores_() {
  var hoje = dataISO_(new Date());
  var sheet = getSheet_('boletos');
  var vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return { ok: true, pagos: 0, total: 0 };
  var headers = vals[0];
  var cStatus = headers.indexOf('status'), cVenc = headers.indexOf('vencimento'),
      cPag = headers.indexOf('dataPagamento'), cValor = headers.indexOf('valor');
  var n = 0, total = 0;
  for (var i = 1; i < vals.length; i++) {
    var venc = dataISO_(vals[i][cVenc]);
    if (String(vals[i][cStatus]) !== 'pago' && venc && venc < hoje) {
      sheet.getRange(i + 1, cStatus + 1).setValue('pago');
      sheet.getRange(i + 1, cPag + 1).setValue(venc);
      n++;
      total += parseNum_(vals[i][cValor]);
    }
  }
  return { ok: true, pagos: n, total: Math.round(total * 100) / 100 };
}
function boletoLinha_(sheet, rowIdx, headers) {
  var o = {};
  headers.forEach(function (h, i) { o[h] = sheet.getRange(rowIdx, i + 1).getValue(); });
  return o;
}
function normLinha_(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function normChave_(v) { return String(v || '').replace(/[^0-9A-Za-z]/g, '').toLowerCase(); }
function boletoSalvar_(d, id) {
  var valor = parseNum_(d.valor);
  if (!d.nome || !dataISO_(d.vencimento)) {
    return { ok: false, error: 'nome e vencimento são obrigatórios' };
  }
  if (!(valor > 0) && !d.permitirZero) {
    return { ok: false, error: 'informe o valor' };
  }
  var sheet = getSheet_('boletos');
  var vals = sheet.getDataRange().getValues();
  var headers = vals[0];
  var status = d.status === 'pago' ? 'pago' : 'pendente';
  if (!id) {
    // Dedupe: o mesmo documento nunca entra duas vezes (linha digitável ou chave de NF).
    var linhaNova = normLinha_(d.linhaDigitavel);
    var chaveNova = normChave_(d.docChave);
    if (linhaNova || chaveNova) {
      var idColD = headers.indexOf('id'), cLinhaD = headers.indexOf('linhaDigitavel'), cChaveD = headers.indexOf('docChave');
      for (var di = 1; di < vals.length; di++) {
        if (linhaNova && normLinha_(vals[di][cLinhaD]) === linhaNova) {
          return { ok: false, duplicado: true, id: vals[di][idColD],
            error: 'Este boleto já foi importado (linha digitável idêntica).' };
        }
        if (chaveNova && normChave_(vals[di][cChaveD]) === chaveNova) {
          return { ok: false, duplicado: true, id: vals[di][idColD],
            error: 'Este documento já foi importado (nota fiscal idêntica).' };
        }
      }
    }
    var nid = Utilities.getUuid();
    // Se veio eventId (importado da Agenda), vincula nele em vez de criar outro evento.
    var eventId = d.eventId || (status === 'pendente'
      ? criarEventoBoleto_(d.nome, d.categoria || 'Outros', valor, dataISO_(d.vencimento), d.linhaDigitavel || '')
      : '');
    sheet.appendRow([nid, new Date(), d.nome, d.categoria || 'Outros', d.empresa || '', valor,
      dataISO_(d.vencimento), status, status === 'pago' ? (dataISO_(d.dataPagamento) || dataISO_(new Date())) : '',
      d.linhaDigitavel || '', d.anexoUrl || '', d.anexoNome || '', eventId, d.obs || '',
      d.docTipo || '', d.docNumero || '', d.docEmissao || '', d.docChave || '',
      d.docExtra || '', String(d.docTexto || '').slice(0, 40000)]);
    return { ok: true, id: nid, evento: !!eventId };
  }
  var idCol = headers.indexOf('id');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(id)) {
      var row = i + 1;
      var ant = boletoLinha_(sheet, row, headers);
      excluirEventoBoleto_(ant.eventId);
      var ev2 = d.eventId || (status === 'pendente'
        ? criarEventoBoleto_(d.nome, d.categoria || 'Outros', valor, dataISO_(d.vencimento), d.linhaDigitavel || '')
        : '');
      var mapa = { nome: d.nome, categoria: d.categoria || 'Outros', empresa: d.empresa || '', valor: valor,
        vencimento: dataISO_(d.vencimento), status: status,
        dataPagamento: status === 'pago' ? (dataISO_(d.dataPagamento) || dataISO_(ant.dataPagamento) || dataISO_(new Date())) : '',
        linhaDigitavel: d.linhaDigitavel || '', anexoUrl: d.anexoUrl !== undefined ? d.anexoUrl : ant.anexoUrl,
        anexoNome: d.anexoNome !== undefined ? d.anexoNome : ant.anexoNome, eventId: ev2, obs: d.obs || '' };
      // Dados de documento (NF/boleto lido): só atualiza se veio no payload (preserva o resto).
      if (d.docTipo !== undefined) mapa.docTipo = d.docTipo || '';
      if (d.docNumero !== undefined) mapa.docNumero = d.docNumero || '';
      if (d.docEmissao !== undefined) mapa.docEmissao = d.docEmissao || '';
      if (d.docChave !== undefined) mapa.docChave = d.docChave || '';
      if (d.docExtra !== undefined) mapa.docExtra = d.docExtra || '';
      if (d.docTexto !== undefined) mapa.docTexto = String(d.docTexto || '').slice(0, 40000);
      Object.keys(mapa).forEach(function (k) {
        var c = headers.indexOf(k);
        if (c > -1) sheet.getRange(row, c + 1).setValue(mapa[k]);
      });
      return { ok: true, id: id, evento: !!ev2 };
    }
  }
  return { ok: false, error: 'boleto não encontrado' };
}
function boletoPagar_(id, dataPag) {
  if (!id) return { ok: false, error: 'id não informado' };
  var sheet = getSheet_('boletos');
  var vals = sheet.getDataRange().getValues();
  var headers = vals[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(id)) {
      var row = i + 1;
      // O evento fica na Agenda como histórico (não apaga).
      sheet.getRange(row, headers.indexOf('status') + 1).setValue('pago');
      sheet.getRange(row, headers.indexOf('dataPagamento') + 1).setValue(dataISO_(dataPag) || dataISO_(new Date()));
      return { ok: true };
    }
  }
  return { ok: false, error: 'boleto não encontrado' };
}
function boletoExcluir_(id) {
  if (!id) return { ok: false, error: 'id não informado' };
  var sheet = getSheet_('boletos');
  var vals = sheet.getDataRange().getValues();
  var idCol = vals[0].indexOf('id');
  var evCol = vals[0].indexOf('eventId');
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][idCol]) === String(id)) {
      excluirEventoBoleto_(vals[i][evCol]);
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'boleto não encontrado' };
}
function uploadAnexo_(body) {
  if (!body.base64 || !body.nome) return { ok: false, error: 'arquivo inválido' };
  // body.pasta opcional (ex.: 'Bulários EstufaOS'); sem pasta, mantém a pasta dos boletos (compat).
  var pasta = body.pasta || 'Boletos EstufaOS';
  var it = DriveApp.getFoldersByName(pasta);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(pasta);
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mime || 'application/octet-stream', body.nome);
  var f = folder.createFile(blob);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { ok: true, url: f.getUrl(), id: f.getId(), nome: body.nome };
}

/**
 * trocarLancamentos_: apaga os lançamentos de uma estufa e grava a série semanal informada.
 * body: { estufa, valores: "13,14,21,21,30,26,37", unidade: 'CX', inicio: 'aaaa-mm-dd' }
 * - Data da semana i = inicio + i*7 dias. Atualiza o dataInicio do ciclo ativo.
 */
function trocarLancamentos_(body) {
  var est = norm_(body.estufa);
  if (!est) return { ok: false, error: 'estufa não informada' };
  var vals = String(body.valores || '').split(',').map(function (x) { return parseNum_(x); }).filter(function (x) { return x > 0; });
  if (!vals.length) return { ok: false, error: 'informe os valores separados por vírgula' };
  var un = String(body.unidade || 'CX').toUpperCase();
  var inicio = dataISO_(body.inicio);
  if (!inicio) return { ok: false, error: 'informe o início (aaaa-mm-dd)' };

  var cId = '';
  try {
    var cSheet = getSheet_('ciclos');
    var cv = cSheet.getDataRange().getValues();
    var ch = cv[0];
    var eC = ch.indexOf('estufa'), sC = ch.indexOf('status'), idC = ch.indexOf('id'), iC = ch.indexOf('dataInicio');
    for (var k = cv.length - 1; k >= 1; k--) {
      if (norm_(cv[k][eC]) === est && norm_(cv[k][sC]) === 'ativa') {
        cId = cv[k][idC];
        cSheet.getRange(k + 1, iC + 1).setValue(inicio);
        break;
      }
    }
  } catch (e) {}

  var hSheet = getSheet_('colheitas');
  var hv = hSheet.getDataRange().getValues();
  if (hv.length > 1) {
    var hh = hv[0];
    var hEst = hh.indexOf('estufa'), hCiclo = hh.indexOf('cicloId');
    var rows = [];
    for (var i = 1; i < hv.length; i++) {
      if (norm_(hv[i][hEst]) === est) {
        if (!cId) cId = hv[i][hCiclo];
        rows.push(i + 1);
      }
    }
    rows.sort(function (a, b) { return b - a; });
    rows.forEach(function (r) { hSheet.deleteRow(r); });
  }
  var total = 0;
  vals.forEach(function (q, gi) {
    total += q;
    hSheet.appendRow([Utilities.getUuid(), new Date(), cId, body.estufa,
      somaDiasISO_(inicio, gi * 7), Math.round(q * 100) / 100, un, 'Semana corrigida']);
  });
  return { ok: true, semanas: vals.length, total: Math.round(total * 100) / 100, inicio: inicio };
}

/* ================ Bula / ficha técnica: busca e guarda no Drive ================
 * Regras do fluxo (nada é inventado e nada é duplicado):
 *  1. buscarBula_ só devolve URLs que uma fonte de busca real retornou; nada é deduzido;
 *  2. host oficial (fabricante ou órgão público) pontua mais; agregador/outro país perde;
 *  3. baixarBula_ valida o conteúdo (%PDF, até 12 MB) ANTES de gravar qualquer coisa;
 *  4. se a pasta já tem o mesmo conteúdo (mesmo nome, mesmo tamanho e mesmo SHA-256),
 *     o arquivo é reutilizado — nenhum PDF igual é salvo duas vezes;
 *  5. se já existe documento para o produto e substituir !== true, nada é trocado:
 *     responde conflito:true e a decisão fica com quem opera (nunca auto-substitui);
 *  6. falha de busca vira { ok:true, encontrados:[], nenhum:true, motivo:... } — nunca
 *     resultado simulado.
 * Estas ações passam a valer depois do deploy deste Code.gs (o usuário autoriza);
 * até lá o frontend detecta "ação inválida" e informa, sem simular busca/download.
 */
var BULA_PASTA_ = 'Bulários EstufaOS';
var BULA_MAX_BYTES_ = 12 * 1024 * 1024;
var BULA_HOSTS_OFICIAIS_ = [
  'syngenta.com.br', 'syngenta.com', 'basf.com.br', 'basf.com', 'bayer.com', 'bayer.com.br',
  'upl.com.br', 'adama.com.br', 'ourofino.com.br', 'nortox.com.br', 'iosa.com.br',
  'scoop.com.br', 'fmc.com', 'fmcagro.com.br', 'fmcagricola.com.br', 'sempreagro.com.br', 'embrapa.br',
  'agrofit.agricultura.gov.br', 'gov.br'
];
var BULA_HOSTS_FORA_ = [
  'agrolink.com.br', 'revistacultivar.com.br', 'agrofy.com.br', 'solsan.com.br',
  'compreagro.com.br', 'syngenta.co.in'
];

function prop_(nome) {
  try { return String(PropertiesService.getScriptProperties().getProperty(nome) || ''); }
  catch (e) { return ''; }
}
function httpFetch_(url, opts) {
  opts = opts || {};
  var cabecalhos = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
  };
  var extra = opts.headers || {};
  for (var k in extra) cabecalhos[k] = extra[k];
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: opts.method || 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: cabecalhos
    });
    var st = resp.getResponseCode();
    var blob = resp.getBlob();
    return { ok: st >= 200 && st < 300, status: st, blob: blob, mime: blob.getContentType() || '' };
  } catch (e) {
    return { ok: false, status: 0, erro: String((e && e.message) || e) };
  }
}
function ehPdf_(bytes) {
  return !!(bytes && bytes.length > 4 &&
    bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70); // %PDF
}
function hex_(digest) {
  return digest.map(function (b) { return ('0' + (((b % 256) + 256) % 256).toString(16)).slice(-2); }).join('');
}
function limparNome_(s) {
  return String(s || '').replace(/[^A-Za-z0-9À-ÿ _.-]/g, '').replace(/\s+/g, '_')
    .replace(/\.+$/g, '').substring(0, 80);
}
function agora_() { return new Date().toISOString(); }
function pastaBula_() {
  var it = DriveApp.getFoldersByName(BULA_PASTA_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BULA_PASTA_);
}
function baixarBytes_(url) {
  var r = httpFetch_(url);
  if (!r.ok) return { ok: false, error: 'HTTP ' + (r.status || ('falha: ' + (r.erro || 'desconhecida'))) };
  var bytes = r.blob.getBytes();
  if (bytes.length > BULA_MAX_BYTES_) {
    return { ok: false, error: 'arquivo maior que ' + Math.round(BULA_MAX_BYTES_ / 1048576) + ' MB' };
  }
  return { ok: true, bytes: bytes, mime: r.mime, blob: r.blob };
}
// GET/POST genérico usado pelo frontend para baixar a fonte sem depender de proxy de navegador.
function fetchUrlAction_(body) {
  var url = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'URL inválida' };
  var r = baixarBytes_(url);
  if (!r.ok) return r;
  if (ehPdf_(r.bytes)) {
    return { ok: true, pdf: true, mime: 'application/pdf', b64: Utilities.base64Encode(r.bytes),
      bytes: r.bytes.length, url: url };
  }
  var texto = '';
  try { texto = r.blob.getDataAsString('UTF-8'); } catch (e) { texto = ''; }
  return { ok: true, pdf: false, texto: String(texto).substring(0, 400000), url: url };
}
function extrairLinks_(texto) {
  var out = [], vistos = {};
  function add(u) {
    if (!u) return;
    u = String(u).replace(/[),.;]+$/, '');
    if (!/^https?:\/\//i.test(u) || vistos[u]) return;
    if (/duckduckgo\.com|jina\.ai|google\.com\/url|bing\.com\/(?:ck|search)|gstatic|w3\.org|schema\.org|favicon/i.test(u)) return;
    vistos[u] = 1;
    out.push(u);
  }
  var m;
  var reUddg = /uddg=([^&\s"'<>]+)/g;
  while ((m = reUddg.exec(texto))) { try { add(decodeURIComponent(m[1])); } catch (e) {} }
  var reMd = /\[[^\]]{0,300}\]\((https?:\/\/[^)\s]+)\)/g;
  while ((m = reMd.exec(texto))) add(m[1]);
  var reBare = /https?:\/\/[^\s)\]"'<>\\]+/g;
  while ((m = reBare.exec(texto))) add(m[0]);
  return out;
}
function buscarJinaDdg_(consulta) {
  // Fontes em cadeia: se uma bloquear/errar, tenta a próxima. Nada é simulado.
  var q = encodeURIComponent(consulta);
  var fontes = [
    { fonte: 'DuckDuckGo (html)', url: 'https://html.duckduckgo.com/html/?q=' + q },
    { fonte: 'DuckDuckGo (lite)', url: 'https://lite.duckduckgo.com/lite/?q=' + q },
    { fonte: 'Bing', url: 'https://www.bing.com/search?q=' + q }
  ];
  var erros = [];
  for (var i = 0; i < fontes.length; i++) {
    var f = fontes[i];
    var r = httpFetch_(f.url);
    if (!r.ok) { erros.push(f.fonte + ': HTTP ' + (r.status || r.erro || '?')); continue; }
    var texto = '';
    try { texto = r.blob.getDataAsString('UTF-8'); } catch (e) { texto = ''; }
    var inicio = texto.slice(0, 4000);
    if (texto.length < 500 ||
        /just a moment|anomaly|captcha|are you a robot|enable javascript and cookies/i.test(inicio)) {
      erros.push(f.fonte + ': exigiu verificação anti-robô ou veio vazia');
      continue;
    }
    var links = extrairLinks_(texto);
    if (links.length < 3) { erros.push(f.fonte + ': resposta sem links úteis'); continue; }
    return { ok: true, fonte: f.fonte, links: links };
  }
  return { ok: false, fonte: 'busca web', erro: erros.join(' | ') || 'sem resposta' };
}
function buscarBrave_(consulta) {
  var fonte = 'Brave Search API';
  var key = prop_('BRAVE_API_KEY');
  if (!key) return { ok: false, fonte: fonte, erro: 'BRAVE_API_KEY não configurada' };
  var r = httpFetch_('https://api.search.brave.com/res/v1/web/search?count=20&q=' + encodeURIComponent(consulta),
    { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
  if (!r.ok) return { ok: false, fonte: fonte, erro: 'HTTP ' + (r.status || (r.erro || '')) };
  var links = [];
  try {
    var j = JSON.parse(r.blob.getDataAsString('UTF-8'));
    var res = (j.web && j.web.results) || [];
    for (var i = 0; i < res.length; i++) if (res[i] && res[i].url) links.push(res[i].url);
  } catch (e) { return { ok: false, fonte: fonte, erro: 'resposta ilegível da API' }; }
  return { ok: true, fonte: fonte, links: links };
}
function buscarNaWeb_(consulta) {
  var provedor = prop_('SEARCH_PROVIDER') || 'jina_ddg';
  return provedor === 'brave' ? buscarBrave_(consulta) : buscarJinaDdg_(consulta);
}
function pontuarCandidato_(url, nome, fabricante) {
  var hostM = String(url).match(/^https?:\/\/([^\/?#]+)/i);
  var host = (hostM ? hostM[1] : '').toLowerCase().replace(/^www\./, '');
  var alvo = norm_(url).replace(/[^a-z0-9]/g, '');
  var n = norm_(nome).replace(/[^a-z0-9]/g, '');
  var f = norm_(fabricante).replace(/[^a-z0-9]/g, '');
  var score = 0, motivos = [];
  if (/\.pdf(\?|#|$)/i.test(url)) { score += 2; motivos.push('é PDF'); }
  else if (/bula|ficha|manual|tecnic|documento/i.test(url)) { score += 1; motivos.push('página de documento'); }
  if (n.length >= 4 && alvo.indexOf(n) > -1) { score += 3; motivos.push('nome do produto na URL'); }
  if (f.length >= 3 && alvo.indexOf(f) > -1) { score += 1; motivos.push('fabricante na URL'); }
  var oficial = BULA_HOSTS_OFICIAIS_.some(function (d) {
    return host === d || host.slice(-(d.length + 1)) === '.' + d;
  });
  if (oficial) { score += 3; motivos.push('host oficial'); }
  var fora = BULA_HOSTS_FORA_.some(function (d) {
    return host === d || host.slice(-(d.length + 1)) === '.' + d || host.indexOf(d) > -1;
  });
  if (fora) { score -= 2; motivos.push('agregador ou outro país'); }
  if (!oficial && !fora) motivos.push('host não listado como oficial (confira na conferência)');
  return { url: url, host: host, oficial: oficial, score: score, motivo: motivos.join(', ') };
}
function buscarBula_(body) {
  var nome = String(body.nome || '').trim();
  var fabricante = String(body.fabricante || '').trim();
  var categoria = String(body.categoria || '').trim();
  if (!nome) return { ok: false, error: 'produto não informado' };
  var ehFertilizante = /fertiliz|adjuvante|umectante|nutrit|foliar|silicat|ph\b/i.test(categoria + ' ' + nome);
  var consulta = nome + (fabricante ? ' ' + fabricante : '') + (ehFertilizante ? ' ficha técnica' : ' bula') + ' PDF';
  var quando = agora_();
  var busca = buscarNaWeb_(consulta);
  if (!busca.ok) {
    return { ok: true, encontrados: [], nenhum: true, consulta: consulta, quando: quando,
      fonteBusca: busca.fonte || '',
      motivo: 'A fonte de busca não respondeu (' + (busca.erro || 'sem resposta') + '). ' +
        'Nenhum documento foi encontrado — nada foi simulado.' };
  }
  var vistos = {}, cands = [];
  var links = busca.links || [];
  for (var i = 0; i < links.length; i++) {
    if (vistos[links[i]]) continue;
    vistos[links[i]] = 1;
    var c = pontuarCandidato_(links[i], nome, fabricante);
    if (c.score > 0) cands.push(c);
  }
  cands.sort(function (a, b) { return b.score - a.score; });
  cands = cands.slice(0, 8);
  return { ok: true, encontrados: cands, nenhum: !cands.length, consulta: consulta,
    quando: quando, fonteBusca: busca.fonte || '',
    motivo: cands.length ? '' : 'Nenhum documento candidato para "' + consulta + '".' };
}
function mesmaPrefixo_(nome, prefixo) {
  return String(nome || '').toLowerCase().indexOf(String(prefixo || '').toLowerCase()) === 0;
}
function primeiroPrefixo_(pasta, prefixo) {
  var it = pasta.getFiles(), n = 0;
  while (it.hasNext() && n < 500) {
    var f = it.next(); n++;
    if (mesmaPrefixo_(f.getName(), prefixo)) return f;
  }
  return null;
}
function acharMesmoConteudo_(pasta, prefixo, tamanho, sha) {
  var it = pasta.getFiles(), n = 0;
  while (it.hasNext() && n < 500) {
    var f = it.next(); n++;
    if (!mesmaPrefixo_(f.getName(), prefixo) || f.getSize() !== tamanho) continue;
    try {
      if (hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, f.getBytes())) === sha) return f;
    } catch (e) {}
  }
  return null;
}
function baixarBula_(body) {
  var urls = Array.isArray(body.urls) && body.urls.length ? body.urls : [body.url];
  var prefixo = limparNome_(String(body.chave || body.nomeArquivo || '').trim());
  if (!prefixo) return { ok: false, error: 'chave/nome do arquivo não informado' };
  // Tenta os candidatos em ordem até achar um PDF válido (alguns hosts bloqueiam
  // os IPs do Apps Script com 403; o próximo candidato oficial pode funcionar).
  var r = null, urlUsada = '', falhas = [];
  for (var i = 0; i < urls.length && !r; i++) {
    var u = String(urls[i] || '').trim();
    if (!/^https?:\/\//i.test(u)) { falhas.push('URL inválida'); continue; }
    var rr = baixarBytes_(u);
    if (!rr.ok) { falhas.push(u + ' → ' + rr.error); continue; }
    if (!ehPdf_(rr.bytes)) { falhas.push(u + ' → o endereço não devolveu um PDF válido (não é %PDF)'); continue; }
    r = rr; urlUsada = u;
  }
  if (!r) {
    return { ok: false, error: 'Nenhum dos ' + urls.length + ' endereços devolveu um PDF válido (' +
      (falhas.join(' | ') || 'sem endereços') + '). Nada foi salvo.' };
  }
  var sha = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, r.bytes));
  var pasta = pastaBula_();
  var igual = acharMesmoConteudo_(pasta, prefixo, r.bytes.length, sha);
  if (igual) {
    return { ok: true, reutilizado: true, id: igual.getId(), url: igual.getUrl(), nome: igual.getName(),
      bytes: r.bytes.length, sha256: sha, quando: agora_(), fonte: urlUsada };
  }
  if (body.substituir !== true) {
    var atual = primeiroPrefixo_(pasta, prefixo);
    if (atual) {
      return { ok: true, conflito: true, id: atual.getId(), url: atual.getUrl(), nome: atual.getName(),
        bytes: atual.getSize(), sha256: sha, fonte: urlUsada,
        motivo: 'Já existe documento salvo para este produto (' + atual.getName() + '). Nada foi ' +
          'substituído: confirme que o novo é mais recente e peça substituição explicitamente.' };
    }
  }
  var nome = prefixo + '_' + agora_().replace(/[-:TZ]/g, '').slice(0, 15) + '.pdf';
  var f = pasta.createFile(Utilities.newBlob(r.bytes, 'application/pdf', nome));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { ok: true, reutilizado: false, id: f.getId(), url: f.getUrl(), nome: nome,
    bytes: r.bytes.length, sha256: sha, quando: agora_(), fonte: urlUsada, tentativas: urls.length };
}
// Diagnóstico: mostra o que está na pasta (para conferir deduplicação pós-deploy).
function diagBula_() {
  var it = DriveApp.getFoldersByName(BULA_PASTA_);
  if (!it.hasNext()) return { ok: true, pasta: BULA_PASTA_, existe: false, arquivos: [] };
  var folder = it.next(), arqs = [], itf = folder.getFiles(), n = 0;
  while (itf.hasNext() && n < 100) {
    var f = itf.next(); n++;
    arqs.push({ id: f.getId(), nome: f.getName(), bytes: f.getSize(),
      atualizado: String(f.getLastUpdated()) });
  }
  return { ok: true, pasta: BULA_PASTA_, existe: true, folderId: folder.getId(), arquivos: arqs };
}
