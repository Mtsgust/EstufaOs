/**
 * Base Química v1.0 — camada interna de dados e serviços do EstufaOS.
 * Especificação: ESPECIFICACAO_BASE_QUIMICA_v1.0.md (repositório).
 *
 * Regras da v1 (não negociáveis):
 *  - 13 planilhas Q_* numa pasta PRIVADA do Drive (bqPlanilha_), só acessível
 *    pelo Apps Script — nunca misturadas com as planilhas operacionais.
 *  - Nenhuma página do site consome tipos bq* (§12): endpoints existem para o
 *    backend/futuro, não são referenciados por nenhum HTML.
 *  - Nenhum handler bq* escreve fora de planilhas Q_* (guarda em getSheet_).
 *  - Nenhum dado técnico entra sem evidência (§7.1); nulos nunca são inventados.
 *  - Q_Historico é append-only (somenteLeitura para a API).
 *  - Soft delete (excluido) — nenhuma linha é removida fisicamente.
 */

// ---------------------------------------------------------------------------
// Configuração das 13 tabelas (§6 da especificação — colunas na ordem exata)
// ---------------------------------------------------------------------------

var SHEETS_BQ = {
  bqProdutos: {
    name: 'Q_Produtos', prefixo: 'QPROD_', interna: true,
    headers: ['id', 'dataCriacao', 'nomeComercial', 'nomeNormalizado', 'fabricante', 'titularRegistro',
      'categoria', 'classeAgronomica', 'formula', 'registroMAPA', 'produtoBiologico',
      'classeToxicologica', 'classeAmbiental', 'origemEstoqueId', 'origemInfoId',
      'statusValidacao', 'ultimaRevisao', 'dataColetaMAPA', 'excluido', 'obs'],
    textos: ['nomeComercial', 'nomeNormalizado', 'registroMAPA'],
    obrigatorios: ['nomeComercial'],
    padroes: { statusValidacao: 'pendente' },
    criticos: ['registroMAPA', 'formula', 'classeAgronomica'],
    enums: {
      categoria: ['Fungicida', 'Inseticida', 'Acaricida', 'Herbicida', 'Fertilizante', 'Bioestimulante', 'Adjuvante', 'Condicionador', 'Biológico', 'Outros'],
      statusValidacao: ['pendente', 'em_revisao', 'validado', 'divergente', 'rejeitado']
    }
  },
  bqIngredientes: {
    name: 'Q_Ingredientes', prefixo: 'QING_', interna: true,
    headers: ['id', 'dataCriacao', 'nome', 'nomeNormalizado', 'tipo', 'grupoQuimico', 'cas',
      'unidadePadrao', 'statusValidacao', 'ultimaRevisao', 'excluido', 'obs'],
    textos: ['nome', 'nomeNormalizado', 'cas'],
    obrigatorios: ['nome'],
    padroes: { statusValidacao: 'pendente' },
    enums: {
      tipo: ['ativo', 'nutriente', 'adjuvante', 'microorganismo', 'outro'],
      statusValidacao: ['pendente', 'em_revisao', 'validado', 'divergente', 'rejeitado']
    }
  },
  bqProdIngredientes: {
    name: 'Q_Produto_Ingredientes', prefixo: 'QPI_', interna: true,
    headers: ['id', 'dataCriacao', 'produtoId', 'ingredienteId', 'concentracao', 'unidade',
      'percentual', 'ordem', 'evidenciaId', 'statusValidacao', 'excluido', 'obs'],
    textos: ['concentracao', 'unidade', 'percentual'],
    obrigatorios: ['produtoId', 'ingredienteId'],
    padroes: { statusValidacao: 'pendente' },
    evidenciaObrigatoria: true,
    refs: { produtoId: 'bqProdutos', ingredienteId: 'bqIngredientes', evidenciaId: 'bqEvidencias' },
    enums: { statusValidacao: ['pendente', 'em_revisao', 'validado', 'divergente', 'rejeitado'] },
    unico: { campos: ['produtoId', 'ingredienteId'], erro: 'duplicata' }
  },
  bqFormulacoes: {
    name: 'Q_Formulacoes', prefixo: 'QFORM_', interna: true,
    headers: ['id', 'dataCriacao', 'codigo', 'nome', 'ordemMistura', 'caracteristicas',
      'cuidadoGeral', 'fonteInfo', 'conferidoEm', 'excluido', 'obs'],
    textos: ['codigo', 'caracteristicas', 'cuidadoGeral', 'fonteInfo'],
    obrigatorios: ['codigo', 'nome'],
    seeds: true
  },
  bqPropriedades: {
    name: 'Q_Propriedades', prefixo: 'QPROP_', interna: true,
    headers: ['id', 'dataCriacao', 'entidadeTipo', 'entidadeId', 'campo', 'valor', 'valorMin',
      'valorMax', 'unidade', 'condicao', 'status', 'evidenciaId', 'dataColeta', 'atualizadoEm',
      'excluido', 'obs'],
    textos: ['valor', 'valorMin', 'valorMax', 'unidade', 'condicao'],
    obrigatorios: ['entidadeTipo', 'entidadeId', 'campo'],
    padroes: { status: 'pendente' },
    datasAuto: ['dataColeta', 'atualizadoEm'],
    evidenciaObrigatoria: true,
    refs: { evidenciaId: 'bqEvidencias' },
    enums: {
      entidadeTipo: ['produto', 'ingrediente'],
      campo: ['ph', 'densidade', 'solubilidade', 'naturezaFisica', 'estabilidade', 'miscibilidade', 'durezaAgua', 'ce', 'pontoDeCongelamento', 'viscosidade', 'outro'],
      status: ['pendente', 'aprovado', 'divergente', 'rejeitado']
    }
  },
  bqEvidencias: {
    name: 'Q_Evidencias', prefixo: 'QEVID_', interna: true,
    headers: ['id', 'dataCriacao', 'entidadeTipo', 'entidadeId', 'campo', 'valor', 'unidade',
      'fonteTipo', 'fonteNome', 'documentoId', 'documentoUrl', 'pagina', 'trechoOriginal',
      'dataDocumento', 'dataColeta', 'confiabilidade', 'status', 'revisadoPor', 'revisadoEm',
      'excluido', 'obs'],
    textos: ['campo', 'valor', 'unidade', 'pagina', 'trechoOriginal'],
    obrigatorios: ['entidadeTipo', 'entidadeId', 'campo', 'fonteTipo', 'fonteNome'],
    padroes: { status: 'pendente', confiabilidade: 'pendente' },
    datasAuto: ['dataColeta'],
    refs: { documentoId: 'bqDocumentos' },
    enums: {
      entidadeTipo: ['produto', 'ingrediente', 'produto_ingrediente', 'propriedade', 'restricao', 'cultura', 'interacao', 'formulacao'],
      fonteTipo: ['registro_mapa', 'bula', 'rotulo', 'ficha_tecnica', 'documento_do_fabricante', 'manual_tecnico', 'estudo_cientifico', 'especificacao_oficial', 'usuario', 'importacao'],
      confiabilidade: ['alta', 'media', 'baixa', 'pendente'],
      status: ['pendente', 'aprovado', 'divergente', 'rejeitado']
    }
  },
  bqDocumentos: {
    name: 'Q_Documentos', prefixo: 'QDOC_', interna: true,
    headers: ['id', 'dataCriacao', 'tipo', 'titulo', 'autorFabricante', 'url', 'arquivoDriveId',
      'dataDocumento', 'versao', 'fonte', 'dataColeta', 'substitui', 'status', 'excluido', 'obs'],
    textos: ['titulo', 'url', 'versao'],
    obrigatorios: ['tipo', 'titulo'],
    padroes: { status: 'identificado' },
    datasAuto: ['dataColeta'],
    refs: { substitui: 'bqDocumentos' },
    enums: {
      tipo: ['bula', 'rotulo', 'ficha_tecnica', 'estudo', 'manual', 'registro', 'especificacao'],
      fonte: ['agrofit', 'fabricante', 'embrapa', 'faowho', 'cipac', 'mapa', 'outro'],
      status: ['identificado', 'baixado', 'validado', 'obsoleto']
    }
  },
  bqRestricoes: {
    name: 'Q_Restricoes', prefixo: 'QREST_', interna: true,
    headers: ['id', 'dataCriacao', 'produtoId', 'tipo', 'texto', 'documentoId', 'evidenciaId',
      'status', 'excluido', 'obs'],
    textos: ['texto'],
    obrigatorios: ['produtoId', 'tipo', 'texto'],
    padroes: { status: 'pendente' },
    evidenciaObrigatoria: true,
    refs: { produtoId: 'bqProdutos', documentoId: 'bqDocumentos', evidenciaId: 'bqEvidencias' },
    enums: {
      tipo: ['carencia', 'restricao_cultura', 'restricao_alvo', 'incompatibilidade_bula', 'mistura_restrita', 'observacao'],
      status: ['pendente', 'aprovado', 'divergente', 'rejeitado']
    }
  },
  bqCulturas: {
    name: 'Q_Culturas', prefixo: 'QCULT_', interna: true,
    headers: ['id', 'dataCriacao', 'produtoId', 'cultura', 'estadio', 'doseReferencia', 'condicao',
      'documentoId', 'evidenciaId', 'status', 'excluido', 'obs'],
    textos: ['cultura', 'estadio', 'doseReferencia', 'condicao'],
    obrigatorios: ['produtoId', 'cultura'],
    padroes: { status: 'pendente' },
    evidenciaObrigatoria: true,
    refs: { produtoId: 'bqProdutos', documentoId: 'bqDocumentos', evidenciaId: 'bqEvidencias' },
    enums: { status: ['pendente', 'aprovado', 'divergente', 'rejeitado'] }
  },
  bqInteracoes: {
    name: 'Q_Interacoes', prefixo: 'QINT_', interna: true,
    headers: ['id', 'dataCriacao', 'tipo', 'efeito', 'condicoesEnsaio', 'concentracao', 'proporcao',
      'culturasAvaliadas', 'formulacoesEnvolvidas', 'limitacoesEstudo', 'grauConfianca',
      'validacao', 'evidenciaId', 'fonteTipo', 'dataEstudo', 'excluido', 'obs'],
    textos: ['efeito', 'condicoesEnsaio', 'concentracao', 'proporcao', 'culturasAvaliadas',
      'formulacoesEnvolvidas', 'limitacoesEstudo', 'fonteTipo'],
    obrigatorios: ['tipo', 'efeito'],
    padroes: { validacao: 'pendente' },
    evidenciaObrigatoria: true,
    refs: { evidenciaId: 'bqEvidencias' },
    enums: {
      tipo: ['incompatibilidade_fisica', 'incompatibilidade_quimica', 'compatibilidade', 'observacao_condicionada', 'antagonismo', 'sinergismo', 'neutro'],
      grauConfianca: ['alto', 'medio', 'baixo', 'teorico'],
      validacao: ['pendente', 'revisado', 'validado', 'refutado']
    }
  },
  bqIntComponentes: {
    name: 'Q_Interacoes_Componentes', prefixo: 'QIC_', interna: true,
    headers: ['id', 'dataCriacao', 'interacaoId', 'ordem', 'entidadeTipo', 'entidadeId', 'papel', 'excluido'],
    obrigatorios: ['interacaoId', 'ordem', 'entidadeTipo', 'entidadeId'],
    refs: { interacaoId: 'bqInteracoes' },
    enums: {
      entidadeTipo: ['produto', 'ingrediente'],
      papel: ['ativo', 'adjuvante', 'nutriente', 'outro']
    }
  },
  bqHistorico: {
    name: 'Q_Historico', prefixo: 'QHIST_', interna: true, somenteLeitura: true,
    headers: ['id', 'dataHora', 'entidadeTipo', 'entidadeId', 'campo', 'valorAnterior', 'valorNovo',
      'acao', 'autor', 'origem', 'motivo', 'obs'],
    textos: ['campo', 'valorAnterior', 'valorNovo', 'motivo'],
    datasAuto: ['dataHora'],
    enums: {
      acao: ['criar', 'alterar', 'aprovar', 'rejeitar', 'importar', 'excluir', 'restaurar', 'divergencia'],
      origem: ['api', 'import_agrofit', 'ui', 'pesquisa']
    }
  },
  bqPesquisas: {
    name: 'Q_Pesquisas', prefixo: 'QPESQ_', interna: true,
    headers: ['id', 'dataAbertura', 'entidadeTipo', 'entidadeId', 'prioridade', 'estado',
      'fonteAlvo', 'consulta', 'documentoIdentificadoId', 'resumoResultado', 'tentativas',
      'ultimoErro', 'dataAtualizacao', 'dataConclusao', 'execucaoPor', 'excluido', 'obs'],
    textos: ['consulta', 'resumoResultado', 'ultimoErro'],
    obrigatorios: ['entidadeTipo', 'entidadeId'],
    padroes: { estado: 'pendente', prioridade: '2' },
    datasAuto: ['dataAbertura', 'dataAtualizacao'],
    refs: { documentoIdentificadoId: 'bqDocumentos' },
    enums: {
      entidadeTipo: ['produto', 'ingrediente', 'interacao'],
      prioridade: ['1', '2', '3'],
      estado: ['pendente', 'pesquisando', 'identificando', 'extraindo', 'validando', 'concluido', 'revisao', 'erro', 'cancelado'],
      fonteAlvo: ['agrofit', 'fabricante', 'embrapa', 'literatura']
    }
  }
};

/* Transições legais da fila de pesquisa (§8.2). 'concluido' é terminal. */
var BQ_TRANSICOES = {
  pendente: ['pesquisando', 'cancelado'],
  pesquisando: ['identificando', 'erro', 'cancelado'],
  identificando: ['extraindo', 'erro', 'cancelado'],
  extraindo: ['validando', 'erro', 'cancelado'],
  validando: ['concluido', 'revisao', 'erro', 'cancelado'],
  revisao: ['concluido', 'erro', 'cancelado'],
  concluido: [],
  erro: ['pendente', 'cancelado'],
  cancelado: ['pendente']
};

/* Chaves do payload que nunca vão para a planilha (reservadas). */
var BQ_PAYLOAD_RESERVADAS = ['evidencia', 'componentes', 'autor', 'origem', 'motivo'];

// ---------------------------------------------------------------------------
// Identificadores e utilidades puras (testáveis em Node)
// ---------------------------------------------------------------------------

function bqId_(prefixo) {
  return prefixo + Utilities.getUuid();
}

function bqNormalizar_(s) {
  return String(s || '').trim();
}

/* Nome normalizado p/ deduplicação — mesma chave do sistema (chave_ do Code.gs). */
function bqNomeNormalizado_(nome) {
  return chave_(nome);
}

/* Busca item por nome normalizado; com campoExtra, exige também igualdade
   (ex.: cas — duas substâncias com mesmo nome e CAS diferente NÃO se fundem). */
function bqAchar_(lista, nome, campoExtra, valorExtra) {
  var alvo = chave_(nome);
  if (!alvo) return null;
  for (var i = 0; i < (lista || []).length; i++) {
    var it = lista[i];
    var base = chave_(it.nomeNormalizado || it.nome || '');
    if (!base || base !== alvo) continue;
    if (campoExtra) {
      var a = String(it[campoExtra] === undefined || it[campoExtra] === null ? '' : it[campoExtra]).trim().toLowerCase();
      var b = String(valorExtra === undefined || valorExtra === null ? '' : valorExtra).trim().toLowerCase();
      if (a !== b) continue;
    }
    return it;
  }
  return null;
}

/* Parse do ingrediente_ativo_detalhado do AGROFIT — campos ausentes viram null,
   nunca valor inventado (§2.1). */
function bqParseAtivos_(lista) {
  var out = [];
  (lista || []).forEach(function (a) {
    if (!a) return;
    var nome = bqNormalizar_(a.ingrediente_ativo);
    if (!nome) return;
    out.push({
      nome: nome,
      grupoQuimico: bqNormalizar_(a.grupo_quimico),
      concentracao: (a.concentracao === undefined || a.concentracao === null || a.concentracao === '') ? null : String(a.concentracao),
      unidade: bqNormalizar_(a.unidade_medida),
      percentual: (a.percentual === undefined || a.percentual === null || a.percentual === '') ? null : String(a.percentual)
    });
  });
  return out;
}

/* Duplicata em Q_Produto_Ingredientes: (produtoId, ingredienteId) único. */
function bqDuplicadoPI_(lista, produtoId, ingredienteId) {
  return (lista || []).some(function (r) {
    return !r.excluido && String(r.produtoId) === String(produtoId) && String(r.ingredienteId) === String(ingredienteId);
  });
}

/* Match de produto na importação (§10.3): registroMAPA primeiro; depois
   nomeNormalizado + titularRegistro. Puro — contrato da Fase 2 já testável.
   Retorna {produto, criterio} ou null (nunca deduz produto inexistente). */
function bqProdutoImportMatch_(produtos, registroMAPA, nomeNormalizado, titularRegistro) {
  var reg = bqNormalizar_(registroMAPA);
  var nome = chave_(nomeNormalizado);
  var tit = chave_(titularRegistro);
  var lista = (produtos || []).filter(function (p) { return !p.excluido; });
  var i;
  if (reg) {
    for (i = 0; i < lista.length; i++) {
      if (bqNormalizar_(lista[i].registroMAPA) === reg) {
        return { produto: lista[i], criterio: 'registroMAPA' };
      }
    }
  }
  if (nome && tit) {
    for (i = 0; i < lista.length; i++) {
      if (chave_(lista[i].nomeNormalizado || lista[i].nomeComercial) === nome &&
          chave_(lista[i].titularRegistro) === tit) {
        return { produto: lista[i], criterio: 'nomeNormalizado+titularRegistro' };
      }
    }
  }
  return null;
}

/* Linhas de Q_Interacoes_Componentes a partir de uma lista de componentes —
   suporta N componentes (pares = 2, mistura completa = N ≥ 2). */
function bqLinhasComponentes_(interacaoId, componentes) {
  return (componentes || []).map(function (c, i) {
    return {
      interacaoId: interacaoId,
      ordem: i + 1,
      entidadeTipo: String(c.entidadeTipo || ''),
      entidadeId: String(c.entidadeId || ''),
      papel: String(c.papel || '')
    };
  });
}

/* Comparação de valores para detecção de divergência (§7.3). */
function bqDivergente_(valorA, valorB) {
  var a = String(valorA === undefined || valorA === null ? '' : valorA).trim();
  var b = String(valorB === undefined || valorB === null ? '' : valorB).trim();
  return a !== b;
}

/* Transição de estado da fila: legal? (§8.2) */
function bqTransicaoValida_(de, para) {
  var atual = String(de || '').trim();
  var destino = String(para || '').trim();
  if (atual === destino) return true;
  var permitidas = BQ_TRANSICOES[atual];
  return !!permitidas && permitidas.indexOf(destino) > -1;
}

/* Enum válido para (tipo, campo, valor)? Compara por String (Sheets converte '1'→1). */
function bqEnumValido_(tipo, campo, valor) {
  var cfg = SHEETS_BQ[tipo];
  if (!cfg || !cfg.enums || !cfg.enums[campo]) return true;
  return cfg.enums[campo].map(String).indexOf(String(valor)) > -1;
}

/* Campo exige evidência para ser gravado? (§7.1) */
function bqCampoExigeEvidencia_(tipo, campo) {
  var cfg = SHEETS_BQ[tipo];
  if (!cfg) return false;
  if (cfg.evidenciaObrigatoria) return true;
  if (tipo === 'bqProdutos' && cfg.criticos && cfg.criticos.indexOf(campo) > -1) return true;
  return false;
}

/**
 * Valida um payload (pura — tudo entra por parâmetro, nada lê planilha).
 * modo: 'add' | 'update'. atual: linha corrente no update.
 * Retorna {ok:true} ou {ok:false, error, campo?, valor?}.
 */
function bqValidarPayload_(tipo, data, modo, atual) {
  var cfg = SHEETS_BQ[tipo];
  if (!cfg) return { ok: false, error: 'tipo bq inválido: ' + tipo };
  data = data || {};
  atual = atual || {};

  var chaves = Object.keys(data);
  for (var i = 0; i < chaves.length; i++) {
    var k = chaves[i];
    if (BQ_PAYLOAD_RESERVADAS.indexOf(k) > -1) continue;
    if (cfg.headers.indexOf(k) === -1) return { ok: false, error: 'campo_desconhecido', campo: k };
  }

  if (modo === 'add') {
    var obr = cfg.obrigatorios || [];
    for (var j = 0; j < obr.length; j++) {
      if (data[obr[j]] === undefined || data[obr[j]] === null || String(data[obr[j]]).trim() === '') {
        return { ok: false, error: 'campo_obrigatorio', campo: obr[j] };
      }
    }
  }

  for (var c in (cfg.enums || {})) {
    if (data[c] !== undefined && data[c] !== null && String(data[c]) !== '' && !bqEnumValido_(tipo, c, data[c])) {
      return { ok: false, error: 'enum_invalido', campo: c, valor: data[c] };
    }
  }

  // Fila: transição de estado (update)
  if (tipo === 'bqPesquisas' && data.estado !== undefined && modo === 'update' && atual.estado !== undefined) {
    if (!bqTransicaoValida_(atual.estado, data.estado)) {
      return { ok: false, error: 'transicao_invalida', campo: 'estado', valor: data.estado };
    }
  }

  // Evidência obrigatória (§7.1)
  var temInline = !!data.evidencia;
  if (cfg.evidenciaObrigatoria && modo === 'add') {
    if (!data.evidenciaId && !temInline) return { ok: false, error: 'evidencia_obrigatoria' };
  }
  if (data.evidenciaId !== undefined && String(data.evidenciaId).trim() === '' && modo === 'update') {
    return { ok: false, error: 'evidencia_obrigatoria' };
  }
  if (tipo === 'bqProdutos' && cfg.criticos) {
    for (var p = 0; p < cfg.criticos.length; p++) {
      var crit = cfg.criticos[p];
      if (data[crit] === undefined) continue;
      var mudou = modo === 'add' ? String(data[crit]).trim() !== '' : bqDivergente_(atual[crit], data[crit]);
      if (mudou && !temInline && !(data.evidenciaId && modo === 'update')) {
        return { ok: false, error: 'evidencia_obrigatoria', campo: crit };
      }
    }
  }

  return { ok: true };
}

/* Texto curto p/ valorNovo do histórico (nunca mais que 500 chars). */
function bqResumo_(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return s.length > 500 ? s.slice(0, 500) + '…[truncado]' : s;
}

/* String que o Sheets converteria em número/data se gravasse solta
   (locale pt-BR: '1,410' → 1.41). Só colunas de texto são protegidas (§5.3). */
function bqSuspeitoCoagir_(v) {
  if (typeof v !== 'string' || v === '' || v.length > 60) return false;
  if (v.charAt(0) === '=' || v.charAt(0) === "'" ) return true;
  return /^[-+]?[0-9][0-9.,\/:eE+-]*$/.test(v);
}

/* Fonte oficial (AGROFIT/importação) pode nascer aprovada (§7.2); resto pendente. */
function bqStatusEvidenciaInicial_(data) {
  if (data.status) return String(data.status);
  var f = String(data.fonteTipo || '');
  return (f === 'registro_mapa' || f === 'importacao') ? 'aprovado' : 'pendente';
}

// ---------------------------------------------------------------------------
// Armazenamento: pasta privada + planilha própria (§3.1 / decisão P5)
// ---------------------------------------------------------------------------

var BQ_SS_CACHE_ = null;

function bqPasta_() {
  var props = PropertiesService.getScriptProperties();
  var fid = props.getProperty('BQ_FOLDER_ID');
  if (fid) {
    try { return DriveApp.getFolderById(fid); } catch (e) { /* id antigo: recria */ }
  }
  var nome = 'EstufaOS - Base Quimica (privada)';
  var it = DriveApp.getFoldersByName(nome);
  var pasta = it.hasNext() ? it.next() : DriveApp.createFolder(nome);
  props.setProperty('BQ_FOLDER_ID', pasta.getId());
  return pasta;
}

function bqPlanilha_() {
  if (BQ_SS_CACHE_) return BQ_SS_CACHE_;
  var props = PropertiesService.getScriptProperties();
  var sid = props.getProperty('BQ_SPREADSHEET_ID');
  if (sid) {
    try {
      BQ_SS_CACHE_ = SpreadsheetApp.openById(sid);
      return BQ_SS_CACHE_;
    } catch (e) { /* id inválido: recria */ }
  }
  var pasta = bqPasta_();
  var ss = SpreadsheetApp.create('EstufaOS - Base Quimica');
  var arquivo = DriveApp.getFileById(ss.getId());
  pasta.addFile(arquivo);
  try { DriveApp.getRootFolder().removeFile(arquivo); } catch (e2) {}
  props.setProperty('BQ_SPREADSHEET_ID', ss.getId());
  BQ_SS_CACHE_ = ss;
  return ss;
}

/* Após criar/realinhar uma aba Q_*: força texto nas colunas frágeis (§5.3)
   e semeia o dicionário de formulações (§6.4). */
function bqPosCriar_(sheet, cfg) {
  (cfg.textos || []).forEach(function (h) {
    var i = cfg.headers.indexOf(h);
    if (i > -1) sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  });
  if (cfg.seeds && sheet.getLastRow() < 2) bqSemear_(sheet, cfg);
}

function bqSemear_(sheet, cfg) {
  if (cfg.name !== 'Q_Formulacoes') return;
  var hoje = new Date();
  // Ordem heurística do motor Montador de Caldas (bulario.html) — NÃO é regra de bula.
  var defs = [
    ['WP', 'Pó molhável', 1], ['WDG', 'Grânulo dispersível em água (seco)', 1],
    ['WG', 'Grânulo dispersível em água', 1], ['SP', 'Solúvel em pó', 1],
    ['SG', 'Grânulo solúvel', 1], ['GR', 'Granular', 1],
    ['SC', 'Suspensão concentrada', 2], ['SE', 'Suspensão emulsificável', 2],
    ['FS', 'Solução para tratamento de sementes', 2],
    ['SL', 'Solução concentrada', 3], ['LS', 'Líquido solúvel', 3],
    ['AS', 'Solução aquosa', 3],
    ['EC', 'Emulsível concentrado', 4], ['ME', 'Microemulsão', 4],
    ['OD', 'Emulsível à base de óleo', 4]
  ];
  var fonte = 'Ordem heurística do motor Montador de Caldas (bulario.html) — não substitui bula';
  var rows = defs.map(function (d) {
    var obj = {
      id: bqId_(cfg.prefixo), dataCriacao: hoje, codigo: d[0], nome: d[1],
      ordemMistura: d[2], caracteristicas: d[1], cuidadoGeral: '',
      fonteInfo: fonte, conferidoEm: hoje, excluido: '', obs: ''
    };
    return cfg.headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  });
  sheet.getRange(2, 1, rows.length, cfg.headers.length).setValues(rows);
}

/* Gravação de célula de TEXTO com verificação (§5.3 anti-coerção).
   O formato '@' da criação não basta em toda a superfície da API: setValue/
   setValues/appendRow podem converter '1,410'→1.41 antes do formato agir.
   Escada: (1) leitura de volta — se já é o texto exato, acabou; (2) '@' +
   regravar; (3) apóstrofo do Sheets (força texto, não aparece na leitura);
   (4) melhor esforço sem apóstrofo visível. */
function bqSetCelula_(sheet, row, col, valor, proteger) {
  var r = sheet.getRange(row, col);
  if (!proteger || typeof valor !== 'string' || !bqSuspeitoCoagir_(valor)) {
    r.setValue(valor);
    return;
  }
  if (r.getValue() === valor) return;
  r.setNumberFormat('@');
  r.setValue(valor);
  if (r.getValue() === valor) return;
  r.setValue("'" + valor);
  if (r.getValue() !== valor) r.setValue(valor);
}

/* Após gravar uma linha: repara colunas de texto que o Sheets coagiu. */
function bqRepararTextos_(sheet, rowIdx, cfg, row) {
  (cfg.textos || []).forEach(function (h) {
    var col = cfg.headers.indexOf(h);
    if (col < 0) return;
    var v = row[col];
    if (typeof v === 'string' && bqSuspeitoCoagir_(v)) bqSetCelula_(sheet, rowIdx, col + 1, v, true);
  });
}

/* Anexa linha + repara textos (substitui appendRow nas tabelas Q_*). */
function bqAppendLinha_(sheet, cfg, row) {
  var rowIdx = sheet.getLastRow() + 1;
  sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  bqRepararTextos_(sheet, rowIdx, cfg, row);
  return rowIdx;
}

// ---------------------------------------------------------------------------
// Camada de acesso (bqRepo_) — único ponto de leitura/escrita das planilhas Q_*
// ---------------------------------------------------------------------------

function bqEhTipo_(tipo) {
  return !!(typeof SHEETS_BQ !== 'undefined' && SHEETS_BQ[String(tipo || '')]);
}

/* Único ponto em que código bq* chama getSheet_ (§9.2 guarda, §14.5):
   só devolve planilha cujo nome começa com Q_* — nunca as operacionais. */
function bqSheet_(tipo) {
  var cfg = SHEETS_BQ[String(tipo || '')];
  if (!cfg) throw new Error('tipo bq inválido: ' + tipo);
  if (String(cfg.name).indexOf('Q_') !== 0) {
    throw new Error('guarda de escopo: planilha fora de Q_* — ' + cfg.name);
  }
  return getSheet_(tipo);
}

function bqDadosTipo_(tipo) {
  if (!bqEhTipo_(tipo)) throw new Error('tipo bq inválido: ' + tipo);
  var cached = cacheLer_('tipo_' + tipo);
  if (cached) return cached;
  var d = sheetToJSON_(bqSheet_(tipo));
  cacheSalvar_('tipo_' + tipo, d);
  return d;
}

function bqLinhas_(tipo) {
  var cfg = SHEETS_BQ[tipo];
  if (!cfg) throw new Error('tipo bq inválido: ' + tipo);
  var sheet = bqSheet_(tipo);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: values[0] || cfg.headers, rows: [], idx: {} };
  var headers = values[0];
  var idx = {};
  headers.forEach(function (h, i) { idx[String(h)] = i; });
  return { headers: headers, rows: values.slice(1), idx: idx };
}

function bqAcharId_(tipo, id) {
  var l = bqLinhas_(tipo);
  for (var i = 0; i < l.rows.length; i++) {
    if (String(l.rows[i][l.idx.id]) === String(id)) {
      var obj = {};
      l.headers.forEach(function (h, j) { obj[h] = l.rows[i][j]; });
      return { linha: l.rows[i], rowIdx: i + 2, obj: obj, headers: l.headers, idx: l.idx };
    }
  }
  return null;
}

function bqExisteId_(tipo, id) {
  if (!id) return false;
  var achou = bqAcharId_(tipo, id);
  return !!(achou && !achou.obj.excluido);
}

function bqHistorico_(entidadeTipo, entidadeId, campo, anterior, novo, acao, autor, origem, motivo) {
  var cfg = SHEETS_BQ.bqHistorico;
  var sheet = bqSheet_('bqHistorico');
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {
    id: bqId_(cfg.prefixo), dataHora: new Date(),
    entidadeTipo: entidadeTipo, entidadeId: entidadeId,
    campo: campo, valorAnterior: bqResumo_(anterior), valorNovo: bqResumo_(novo),
    acao: acao, autor: autor || 'api', origem: origem || 'api',
    motivo: motivo || '', obs: ''
  };
  bqAppendLinha_(sheet, cfg, hdr.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }));
  cacheLimpar_('bqHistorico');
}

function bqRefsOk_(tipo, data, modo, atual) {
  var refs = SHEETS_BQ[tipo].refs;
  if (!refs) return { ok: true };
  for (var campo in refs) {
    var valor = data[campo];
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    if (modo === 'update' && atual && String(atual[campo]) === String(valor)) continue;
    if (!bqExisteId_(refs[campo], valor)) return { ok: false, error: 'referencia_invalida', campo: campo };
  }
  // Não deixa apagar referências obrigatórias de evidência
  if (SHEETS_BQ[tipo].evidenciaObrigatoria && modo === 'update' && data.evidenciaId !== undefined) {
    if (String(data.evidenciaId).trim() === '') return { ok: false, error: 'evidencia_obrigatoria' };
    if (atual && String(atual.evidenciaId) !== '' && String(data.evidenciaId) !== String(atual.evidenciaId) && !bqExisteId_('bqEvidencias', data.evidenciaId)) {
      return { ok: false, error: 'referencia_invalida', campo: 'evidenciaId' };
    }
  }
  return { ok: true };
}

/* Cria evidência inline (payload.evidencia). Detecta divergência (§7.3):
   se já existe evidência do mesmo (entidade, campo) com valor diferente,
   a nova nasce 'divergente' e o histórico registra a divergência. */
function bqCriarEvidenciaInline_(ev, entidadeTipo, entidadeId, campoPadrao, autor, origem) {
  ev = ev || {};
  var campos = {
    entidadeTipo: ev.entidadeTipo || entidadeTipo,
    entidadeId: ev.entidadeId || entidadeId,
    campo: ev.campo || campoPadrao,
    valor: ev.valor !== undefined ? ev.valor : '',
    unidade: ev.unidade || '',
    fonteTipo: ev.fonteTipo || '',
    fonteNome: ev.fonteNome || '',
    documentoId: ev.documentoId || '',
    documentoUrl: ev.documentoUrl || '',
    pagina: ev.pagina || '',
    trechoOriginal: ev.trechoOriginal || '',
    dataDocumento: ev.dataDocumento || '',
    confiabilidade: ev.confiabilidade || '',
    status: ev.status || '',
    obs: ev.obs || ''
  };
  if (!campos.entidadeTipo || !campos.entidadeId || !campos.campo || !campos.fonteTipo || !campos.fonteNome) {
    return { ok: false, error: 'evidencia_incompleta', esperado: 'entidadeTipo, entidadeId, campo, fonteTipo, fonteNome' };
  }
  if (!bqEnumValido_('bqEvidencias', 'entidadeTipo', campos.entidadeTipo)) return { ok: false, error: 'enum_invalido', campo: 'entidadeTipo', valor: campos.entidadeTipo };
  if (!bqEnumValido_('bqEvidencias', 'fonteTipo', campos.fonteTipo)) return { ok: false, error: 'enum_invalido', campo: 'fonteTipo', valor: campos.fonteTipo };

  // Divergência: mesma entidade+campo, valor diferente de evidência existente
  var existentes = bqDadosTipo_('bqEvidencias').filter(function (e) {
    return !e.excluido && e.status !== 'rejeitado' &&
      String(e.entidadeTipo) === String(campos.entidadeTipo) &&
      String(e.entidadeId) === String(campos.entidadeId) &&
      String(e.campo) === String(campos.campo);
  });
  var divergiu = existentes.filter(function (e) { return bqDivergente_(e.valor, campos.valor); });
  if (!campos.status) campos.status = divergiu.length ? 'divergente' : bqStatusEvidenciaInicial_(campos);
  if (divergiu.length) {
    bqHistorico_(campos.entidadeTipo, campos.entidadeId, campos.campo,
      divergiu[0].valor, campos.valor, 'divergencia', autor || 'api', origem || 'api',
      'evidencias divergentes para o mesmo campo');
  }

  var cfg = SHEETS_BQ.bqEvidencias;
  var id = bqId_(cfg.prefixo);
  var sheet = bqSheet_('bqEvidencias');
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = hdr.map(function (h) {
    if (h === 'id') return id;
    if (h === 'dataCriacao') return new Date();
    if (h === 'dataColeta') return new Date();
    if (h === 'status') return campos.status;
    if (h === 'confiabilidade') return campos.confiabilidade || 'pendente';
    if (h === 'revisadoPor') return origem === 'import_agrofit' ? 'ia:import_agrofit' : '';
    if (campos[h] !== undefined) return campos[h];
    return '';
  });
  bqAppendLinha_(sheet, cfg, row);
  cacheLimpar_('bqEvidencias');
  return { ok: true, id: id, status: campos.status, divergente: divergiu.length > 0 };
}

// ---------------------------------------------------------------------------
// API de leitura (doGet)
// ---------------------------------------------------------------------------

function bqDoGet_(e) {
  try {
    var tipo = String((e && e.parameter && e.parameter.tipo) || '');
    if (tipo === 'bqVisao') return bqVisao_(String((e.parameter.id) || ''));
    if (!bqEhTipo_(tipo)) return { ok: false, error: 'tipo bq inválido: ' + tipo };
    return { ok: true, data: bqDadosTipo_(tipo) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* Visão agregada de um produto (consulta interna — sem UI na v1, §12). */
function bqVisao_(id) {
  try {
    if (!id) return { ok: false, error: 'id obrigatório' };
    var produtos = bqDadosTipo_('bqProdutos');
    var produto = null;
    for (var i = 0; i < produtos.length; i++) {
      if (String(produtos[i].id) === String(id) && !produtos[i].excluido) { produto = produtos[i]; break; }
    }
    if (!produto) return { ok: false, error: 'produto não encontrado' };

    var pis = bqDadosTipo_('bqProdIngredientes').filter(function (p) { return String(p.produtoId) === String(id) && !p.excluido; });
    var ings = bqDadosTipo_('bqIngredientes');
    var ingredientes = pis.map(function (p) {
      var ing = null;
      for (var k = 0; k < ings.length; k++) if (String(ings[k].id) === String(p.ingredienteId)) { ing = ings[k]; break; }
      return { relacao: p, ingrediente: ing };
    });

    var idsRelevantes = [String(id)];
    pis.forEach(function (p) { idsRelevantes.push(String(p.produtoId)); idsRelevantes.push(String(p.ingredienteId)); });
    var propriedades = bqDadosTipo_('bqPropriedades').filter(function (pr) {
      return !pr.excluido && idsRelevantes.indexOf(String(pr.entidadeId)) > -1;
    });
    propriedades.forEach(function (pr) { idsRelevantes.push(String(pr.id)); });

    var evidencias = bqDadosTipo_('bqEvidencias').filter(function (ev) {
      return !ev.excluido && idsRelevantes.indexOf(String(ev.entidadeId)) > -1;
    });
    var restricoes = bqDadosTipo_('bqRestricoes').filter(function (r) { return String(r.produtoId) === String(id) && !r.excluido; });
    var culturas = bqDadosTipo_('bqCulturas').filter(function (cu) { return String(cu.produtoId) === String(id) && !cu.excluido; });

    var comps = bqDadosTipo_('bqIntComponentes').filter(function (c) { return String(c.entidadeId) === String(id) && !c.excluido; });
    var ints = bqDadosTipo_('bqInteracoes');
    var interacoes = comps.map(function (c) {
      var inter = null;
      for (var n = 0; n < ints.length; n++) if (String(ints[n].id) === String(c.interacaoId)) { inter = ints[n]; break; }
      return { interacao: inter, componentes: bqDadosTipo_('bqIntComponentes').filter(function (x) { return String(x.interacaoId) === String(c.interacaoId) && !x.excluido; }) };
    });

    var docIds = [];
    evidencias.forEach(function (ev) { if (ev.documentoId) docIds.push(String(ev.documentoId)); });
    restricoes.forEach(function (r) { if (r.documentoId) docIds.push(String(r.documentoId)); });
    culturas.forEach(function (cu) { if (cu.documentoId) docIds.push(String(cu.documentoId)); });
    docIds = docIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
    var documentos = bqDadosTipo_('bqDocumentos').filter(function (d) { return docIds.indexOf(String(d.id)) > -1 && !d.excluido; });

    return {
      ok: true,
      data: { produto: produto, ingredientes: ingredientes, propriedades: propriedades,
        evidencias: evidencias, restricoes: restricoes, culturas: culturas,
        interacoes: interacoes, documentos: documentos }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// API de gravação (doPost) — regras da §9.2
// ---------------------------------------------------------------------------

function bqDoPost_(body) {
  try {
    var tipo = String(body.tipo || '');
    var action = String(body.action || '');
    if (!bqEhTipo_(tipo)) return { ok: false, error: 'tipo bq inválido: ' + tipo };
    if (action === 'add') return bqAdd_(tipo, body);
    if (action === 'update') return bqUpdate_(tipo, body);
    if (action === 'delete') return bqDelete_(tipo, body);
    if (action === 'restaurar') return bqRestaurar_(tipo, body);
    // Ações especiais da §9.3 (Fase 2 — importação AGROFIT)
    if (action === 'agrofit' && tipo === 'bqPesquisas') return bqAgrofitSync_(body);
    if (action === 'processar' && tipo === 'bqPesquisas') return bqFilaProcessar_(body);
    if (action === 'vincular' && tipo === 'bqProdutos') return bqVincular_(body);
    return { ok: false, error: 'ação inválida' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function bqAdd_(tipo, body) {
  var cfg = SHEETS_BQ[tipo];
  if (cfg.somenteLeitura) return { ok: false, error: 'somente_leitura' };
  var data = body.data || {};
  // Evidência pode chegar no topo (body.evidencia) ou dentro de data
  // (chave reservada, §9.2) — normaliza para validação e gravação.
  if (body.evidencia && !data.evidencia) data = Object.assign({}, data, { evidencia: body.evidencia });

  var v = bqValidarPayload_(tipo, data, 'add', null);
  if (!v.ok) return v;

  if (cfg.unico) {
    var c = cfg.unico.campos;
    if (bqDuplicadoPI_(bqDadosTipo_(tipo), data[c[0]], data[c[1]])) {
      return { ok: false, error: cfg.unico.erro };
    }
  }

  var autor = String(body.autor || data.autor || 'api');
  var origem = String(body.origem || data.origem || 'api');
  if (SHEETS_BQ[tipo].enums && SHEETS_BQ[tipo].enums.origem && data.origem) origem = String(data.origem);

  // Integridade referencial ANTES de criar evidência — payload rejeitado
  // não pode deixar linha órfã nem evidência órfã.
  var refs = bqRefsOk_(tipo, data, 'add', null);
  if (!refs.ok) return refs;

  // Evidência: criar inline ANTES da linha quando exigida (a evidência aponta
  // para o id que vamos gravar — id gerado primeiro).
  var prefixo = cfg.prefixo;
  var id = bqId_(prefixo);
  var evidenciaId = '';

  if (data.evidencia || (cfg.evidenciaObrigatoria && !data.evidenciaId)) {
    var ev = data.evidencia || {};
    var campoPadrao = ev.campo || (cfg.criticos ? cfg.criticos[0] : tipo.replace(/^bq/, ''));
    var entidadeTipo = ev.entidadeTipo || bqEntidadePadrao_(tipo, data);
    var entidadeId = ev.entidadeId || bqEntidadeIdPadrao_(tipo, data, id);
    var rEv = bqCriarEvidenciaInline_(ev, entidadeTipo, entidadeId, campoPadrao, autor, origem);
    if (!rEv.ok) return rEv;
    evidenciaId = rEv.id;
  } else if (data.evidenciaId) {
    evidenciaId = String(data.evidenciaId);
  }

  var sheet = bqSheet_(tipo);
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date();
  var row = hdr.map(function (h) {
    if (h === 'id') return id;
    if ((cfg.datasAuto || ['dataCriacao']).indexOf(h) > -1 && (data[h] === undefined || data[h] === '')) return now;
    if (h === 'nomeNormalizado' && (data[h] === undefined || data[h] === '')) {
      var base = cfg.name === 'Q_Ingredientes' ? data.nome : (cfg.name === 'Q_Produtos' ? data.nomeComercial : '');
      return base ? chave_(base) : '';
    }
    if (h === 'evidenciaId' && evidenciaId) return evidenciaId;
    if (cfg.padroes && cfg.padroes[h] !== undefined && (data[h] === undefined || data[h] === '')) return cfg.padroes[h];
    if (h === 'excluido') return '';
    return data[h] !== undefined ? data[h] : '';
  });
  bqAppendLinha_(sheet, cfg, row);
  cacheLimpar_(tipo);

  var resumo = data.nomeComercial || data.nome || data.codigo || data.titulo || data.efeito || id;
  var acaoHist = (body.historicoAcao && bqEnumValido_('bqHistorico', 'acao', body.historicoAcao))
    ? String(body.historicoAcao) : 'criar';
  bqHistorico_(cfg.name, id, '(registro)', '', resumo, acaoHist, autor, origem, body.motivo || '');
  if (evidenciaId) cacheLimpar_('bqEvidencias');
  return { ok: true, id: id, evidenciaId: evidenciaId };
}

function bqEntidadePadrao_(tipo, data) {
  return tipo === 'bqProdutos' ? 'produto'
    : tipo === 'bqIngredientes' ? 'ingrediente'
    : tipo === 'bqProdIngredientes' ? 'produto_ingrediente'
    : tipo === 'bqPropriedades' ? (data.entidadeTipo || 'produto')
    : tipo === 'bqRestricoes' ? 'restricao'
    : tipo === 'bqCulturas' ? 'cultura'
    : tipo === 'bqInteracoes' ? 'interacao'
    : '';
}

function bqEntidadeIdPadrao_(tipo, data, idNovo) {
  return tipo === 'bqProdutos' ? idNovo
    : tipo === 'bqIngredientes' ? idNovo
    : tipo === 'bqProdIngredientes' ? (data.produtoId || '')
    : tipo === 'bqPropriedades' ? (data.entidadeId || '')
    : tipo === 'bqRestricoes' ? (data.produtoId || '')
    : tipo === 'bqCulturas' ? (data.produtoId || '')
    : tipo === 'bqInteracoes' ? idNovo
    : '';
}

function bqUpdate_(tipo, body) {
  var cfg = SHEETS_BQ[tipo];
  if (cfg.somenteLeitura) return { ok: false, error: 'somente_leitura' };
  var achado = bqAcharId_(tipo, body.id);
  if (!achado) return { ok: false, error: 'id não encontrado' };

  var data = Object.assign({}, body.data || {});
  delete data.id;
  if (!Object.keys(data).length) return { ok: true };
  // Evidência no topo (body) ou dentro de data (chave reservada) — mesma validação.
  if (body.evidencia && !data.evidencia) data.evidencia = body.evidencia;

  var v = bqValidarPayload_(tipo, data, 'update', achado.obj);
  if (!v.ok) return v;

  var autor = String(body.autor || data.autor || 'api');
  var origem = String(body.origem || data.origem || 'api');
  delete data.autor; delete data.origem; delete data.motivo; delete data.componentes;

  // Evidência inline num update (ex.: mudar campo crítico de Q_Produtos)
  if (data.evidencia) {
    var ev2 = data.evidencia || {};
    var rEv2 = bqCriarEvidenciaInline_(ev2,
      ev2.entidadeTipo || bqEntidadePadrao_(tipo, achado.obj),
      ev2.entidadeId || achado.obj.id || String(body.id),
      ev2.campo || '', autor, origem);
    if (!rEv2.ok) return rEv2;
    data.evidenciaId = rEv2.id;
    cacheLimpar_('bqEvidencias');
  }
  delete data.evidencia;

  var refs = bqRefsOk_(tipo, data, 'update', achado.obj);
  if (!refs.ok) return refs;

  var sheet = bqSheet_(tipo);
  var mudou = 0;
  var acaoHist = (body.historicoAcao && bqEnumValido_('bqHistorico', 'acao', body.historicoAcao))
    ? String(body.historicoAcao) : 'alterar';
  Object.keys(data).forEach(function (campo) {
    var col = achado.idx[campo];
    if (col === undefined) return;
    var antigo = achado.linha[col];
    if (String(antigo) === String(data[campo])) return;
    bqSetCelula_(sheet, achado.rowIdx, col + 1, data[campo], !!(cfg.textos && cfg.textos.indexOf(campo) > -1));
    achado.linha[col] = data[campo];
    mudou++;
    bqHistorico_(cfg.name, String(body.id), campo, antigo, data[campo], acaoHist, autor, origem, body.motivo || '');
  });

  // Carimbos de "última atualização" (§2.6)
  var agora = new Date();
  if (mudou && achado.idx.atualizadoEm !== undefined) sheet.getRange(achado.rowIdx, achado.idx.atualizadoEm + 1).setValue(agora);
  if (mudou && achado.idx.dataAtualizacao !== undefined) sheet.getRange(achado.rowIdx, achado.idx.dataAtualizacao + 1).setValue(agora);

  cacheLimpar_(tipo);
  return { ok: true, alterados: mudou };
}

function bqDelete_(tipo, body) {
  var cfg = SHEETS_BQ[tipo];
  if (cfg.somenteLeitura) return { ok: false, error: 'somente_leitura' };
  var achado = bqAcharId_(tipo, body.id);
  if (!achado) return { ok: false, error: 'id não encontrado' };
  if (achado.obj.excluido) return { ok: true, jaExcluido: true };

  var col = achado.idx.excluido;
  if (col === undefined) return { ok: false, error: 'sem_coluna_excluido' };
  var autor = String(body.autor || 'api');
  var origem = String(body.origem || 'api');
  sheet_setExcluido(bqSheet_(tipo), achado.rowIdx, col + 1);
  bqHistorico_(cfg.name, String(body.id), 'excluido', achado.obj.excluido || '', 'true',
    'excluir', autor, origem, body.motivo || '');
  cacheLimpar_(tipo);
  return { ok: true };
}

function sheet_setExcluido(sheet, row, col) {
  sheet.getRange(row, col).setValue(true);
}

/* Restauração (acao: 'restaurar') — desfaz o soft delete. */
function bqRestaurar_(tipo, body) {
  var cfg = SHEETS_BQ[tipo];
  if (cfg.somenteLeitura) return { ok: false, error: 'somente_leitura' };
  var achado = bqAcharId_(tipo, body.id);
  if (!achado) return { ok: false, error: 'id não encontrado' };
  var col = achado.idx.excluido;
  bqSheet_(tipo).getRange(achado.rowIdx, col + 1).setValue('');
  bqHistorico_(cfg.name, String(body.id), 'excluido', 'true', '', 'restaurar',
    String(body.autor || 'api'), String(body.origem || 'api'), body.motivo || '');
  cacheLimpar_(tipo);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fase 2 — Importação AGROFIT (§9.3 ações especiais + §10)
// ---------------------------------------------------------------------------

var BQ_AGROFIT_BASE_ = 'https://api.cnptia.embrapa.br/agrofit/v1';
var BQ_FETCH_LIMITE_ = 150;   // orçamento de UrlFetchApp por execução (§10.3)
var BQ_FETCH_CONTADOR_ = 0;   // zera a cada execução (var global do Apps Script)

/* Token AgroAPI exclusivamente nas Script Properties (§4.1a/P1) — nunca em
   payload HTTP nem no repositório. */
function bqAgrofitToken_() {
  try { return String(PropertiesService.getScriptProperties().getProperty('AGROAPI_TOKEN') || ''); }
  catch (e) { return ''; }
}

/* GET na AgroAPI com Bearer + orçamento por execução (§10.3). */
function bqAgrofitFetch_(caminho) {
  if (BQ_FETCH_CONTADOR_ >= BQ_FETCH_LIMITE_) return { ok: false, error: 'agrofit_orcamento_excedido' };
  var token = bqAgrofitToken_();
  if (!token) return { ok: false, error: 'agrofit_token_ausente' };
  BQ_FETCH_CONTADOR_++;
  var resp;
  try {
    resp = UrlFetchApp.fetch(BQ_AGROFIT_BASE_ + caminho, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      muteHttpExceptions: true
    });
  } catch (err) {
    return { ok: false, error: 'agrofit_fetch_falhou: ' + err.message };
  }
  var code = resp.getResponseCode();
  if (code === 401) return { ok: false, error: 'agrofit_token_invalido' };
  if (code < 200 || code >= 300) return { ok: false, error: 'agrofit_http_' + code };
  try { return { ok: true, dados: JSON.parse(resp.getContentText()) }; }
  catch (e) { return { ok: false, error: 'agrofit_json_invalido' }; }
}

/* Localiza o objeto do produto em qualquer envelope da API (raiz/results/data). */
function bqAgrofitExtrair_(json) {
  var fila = [json], giros = 0;
  while (fila.length && giros < 50) {
    giros++;
    var v = fila.shift();
    if (Array.isArray(v)) { if (v.length) fila.push(v[0]); continue; }
    if (!v || typeof v !== 'object') continue;
    if (v.numero_registro !== undefined || v.marca_comercial !== undefined ||
        v.ingrediente_ativo_detalhado !== undefined || v.titular_registro !== undefined) return v;
    ['results', 'data', 'dados', 'produtos', 'produto', 'item', 'content', 'itens'].forEach(function (k) {
      if (v[k] !== undefined && v[k] !== null) fila.push(v[k]);
    });
  }
  return null;
}

/* Lista de produtos em qualquer envelope de busca. */
function bqAgrofitLista_(json) {
  var fila = [json], giros = 0;
  while (fila.length && giros < 50) {
    giros++;
    var v = fila.shift();
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' &&
          (v[0].numero_registro !== undefined || v[0].marca_comercial !== undefined)) return v;
      continue;
    }
    if (!v || typeof v !== 'object') continue;
    ['results', 'data', 'dados', 'produtos', 'itens', 'content'].forEach(function (k) {
      if (v[k] !== undefined && v[k] !== null) fila.push(v[k]);
    });
  }
  return [];
}

/* Detalhe por registro: formulados e, se não achar, técnicos (§4.1a). */
function bqAgrofitDetalhe_(numeroRegistro) {
  var n = bqNormalizar_(numeroRegistro);
  if (!n) return { ok: false, error: 'campo_obrigatorio', campo: 'numeroRegistro' };
  var r = bqAgrofitFetch_('/produtos-formulados/' + encodeURIComponent(n));
  if (!r.ok) r = bqAgrofitFetch_('/produtos-tecnicos/' + encodeURIComponent(n));
  if (!r.ok) return r;
  var det = bqAgrofitExtrair_(r.dados);
  return det ? { ok: true, detalhe: det } : { ok: false, error: 'agrofit_produto_nao_encontrado' };
}

/* Busca por nome → registro exato (ou primeiro resultado, marcando aproximado). */
function bqAgrofitBuscaNumero_(nome) {
  var q = bqNormalizar_(nome);
  if (!q) return { ok: false, error: 'campo_obrigatorio', campo: 'nome' };
  var r = bqAgrofitFetch_('/produtos-formulados?q=' + encodeURIComponent(q) + '&page=1');
  if (!r.ok) return r;
  var lista = bqAgrofitLista_(r.dados);
  if (!lista.length) return { ok: false, error: 'agrofit_produto_nao_encontrado' };
  var alvo = chave_(q), achou = null;
  for (var i = 0; i < lista.length && !achou; i++) {
    var marcas = Array.isArray(lista[i].marca_comercial) ? lista[i].marca_comercial : [lista[i].marca_comercial];
    for (var j = 0; j < marcas.length; j++) {
      if (chave_(marcas[j]) === alvo) { achou = lista[i]; break; }
    }
  }
  var escolhido = achou || lista[0];
  var reg = bqNormalizar_(escolhido.numero_registro);
  if (!reg) return { ok: false, error: 'agrofit_produto_nao_encontrado' };
  return { ok: true, numeroRegistro: reg, aproximado: !achou };
}

/* Bootstrap do token: roda SÓ via `clasp run` (nunca via API web — o token
   não transita em payload HTTP). Retorna 'ok:<tamanho>' ou 'vazio'.
   Uso: clasp run bqConfigurarAgrofitToken --params '["<token>"]' */
function bqConfigurarAgrofitToken(token) {
  var t = String(token === undefined || token === null ? '' : token).trim();
  if (!t) return 'vazio';
  PropertiesService.getScriptProperties().setProperty('AGROAPI_TOKEN', t);
  return 'ok:' + t.length;
}

/* Classe AGROFIT → categoria enum de Q_Produtos (§6.1). Determinístico;
   o que não casa vira 'Outros'. Classe vazia → '' (nunca inventa). */
function bqCategoriaDaClasse_(classe) {
  var c = chave_(classe);
  if (!c) return '';
  if (c.indexOf('fungicida') > -1) return 'Fungicida';
  if (c.indexOf('inseticida') > -1) return 'Inseticida';
  if (c.indexOf('acaricida') > -1) return 'Acaricida';
  if (c.indexOf('herbicida') > -1) return 'Herbicida';
  if (c.indexOf('adjuvante') > -1) return 'Adjuvante';
  if (c.indexOf('condicionador') > -1) return 'Condicionador';
  if (c.indexOf('fertilizante') > -1) return 'Fertilizante';
  if (c.indexOf('biologico') > -1) return 'Biológico';
  return 'Outros';
}

/* Primeira ocorrência de um campo que a API devolve como array ou string. */
function bqPrimeiro_(v) {
  if (Array.isArray(v)) return v.length ? bqNormalizar_(v[0]) : '';
  return bqNormalizar_(v);
}

/* tipo_documento AGROFIT → enum de Q_Documentos (§6.7); '' = desconhecido. */
function bqDocTipo_(texto) {
  var t = chave_(texto);
  if (!t) return '';
  if (t.indexOf('bula') > -1) return 'bula';
  if (t.indexOf('rotulo') > -1) return 'rotulo';
  if (t.indexOf('ficha') > -1) return 'ficha_tecnica';
  if (t.indexOf('manual') > -1) return 'manual';
  if (t.indexOf('estudo') > -1) return 'estudo';
  if (t.indexOf('registro') > -1) return 'registro';
  if (t.indexOf('especifica') > -1) return 'especificacao';
  return '';
}

/* Produto excluído com o mesmo registroMAPA → não reativa nem duplica (§10.3). */
function bqAcharExcluidoPorRegistro_(produtos, registro) {
  var reg = bqNormalizar_(registro);
  if (!reg) return null;
  var lista = produtos || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].excluido && bqNormalizar_(lista[i].registroMAPA) === reg) return lista[i];
  }
  return null;
}

/* PLANO PURO de importação (§10.2): payload AGROFIT → o que seria gravado.
   Não toca planilha; atuais = {produtos, ingredientes, documentos} já lidos.
   Campos ausentes viram ''/null — nunca valor inventado (§2.1). */
function bqImportPlano_(detalhe, atuais) {
  atuais = atuais || {};
  var d = detalhe || {};
  var faltantes = [];
  var registro = bqNormalizar_(d.numero_registro);
  var marca = bqPrimeiro_(d.marca_comercial);
  var titular = bqNormalizar_(d.titular_registro);
  var classeBruta = bqPrimeiro_(d.classe_categoria_agronomica);
  var formula = bqNormalizar_(d.formulacao);
  if (!registro) faltantes.push('numero_registro');
  if (!marca) faltantes.push('marca_comercial');
  if (!classeBruta) faltantes.push('classe_categoria_agronomica');

  var nomeNorm = marca ? bqNomeNormalizado_(marca) : '';
  var campos = {
    nomeComercial: marca,
    nomeNormalizado: nomeNorm,
    titularRegistro: titular,
    registroMAPA: registro,
    classeAgronomica: classeBruta,
    formula: formula,
    categoria: classeBruta ? bqCategoriaDaClasse_(classeBruta) : '',
    produtoBiologico: (d.produto_biologico === undefined || d.produto_biologico === null) ? '' : d.produto_biologico,
    classeToxicologica: bqNormalizar_(d.classe_toxicologica),
    classeAmbiental: bqNormalizar_(d.classe_ambiental)
  };

  var match = (registro || (nomeNorm && titular))
    ? bqProdutoImportMatch_(atuais.produtos, registro, nomeNorm, titular) : null;
  var excluido = !match ? bqAcharExcluidoPorRegistro_(atuais.produtos, registro) : null;

  var produto;
  if (!marca) {
    produto = { acao: 'impossivel', motivo: 'nomeComercial obrigatório ausente', campos: campos };
  } else if (excluido) {
    produto = { acao: 'ignorado_excluido', id: excluido.id,
      motivo: 'produto com mesmo registroMAPA está excluído — não reativa nem duplica' };
  } else if (!match) {
    produto = { acao: 'criar', campos: campos };
  } else {
    var p = match.produto;
    var conflitos = {}, atualizaveis = {};
    Object.keys(campos).forEach(function (c) {
      var antigo = p[c], novo = campos[c];
      if (novo === '' || novo === undefined || novo === null) return;
      if (!bqDivergente_(antigo, novo)) return;
      var antigoVazio = antigo === '' || antigo === undefined || antigo === null;
      if (!antigoVazio) conflitos[c] = [antigo, novo];   // dois valores presentes e diferentes
      atualizaveis[c] = novo;
    });
    var validado = String(p.statusValidacao) === 'validado';
    var temConflito = Object.keys(conflitos).length > 0;
    var mudou = Object.keys(atualizaveis).length > 0;
    produto = {
      acao: validado && temConflito ? 'divergente' : (mudou ? 'atualizar' : 'identico'),
      id: p.id, criterio: match.criterio, campos: campos,
      camposAtualizar: (validado && temConflito) ? {} : atualizaveis,
      conflitos: conflitos
    };
  }

  // Ingredientes: dedup por nomeNormalizado + grupoQuimico (§10.2). O par
  // (produto, ingrediente) é único na QPI — linha repetida do payload não
  // vira nova relação (primeira ocorrência vence).
  var ativos = bqParseAtivos_(d.ingrediente_ativo_detalhado);
  var ingredientes = [], relacoes = [], idxJaVisto = {};
  ativos.forEach(function (a) {
    var nomeA = bqNomeNormalizado_(a.nome), idx = -1, i;
    for (i = 0; i < ingredientes.length; i++) {
      if (ingredientes[i].nomeNormalizado === nomeA &&
          chave_(ingredientes[i].grupoQuimico) === chave_(a.grupoQuimico)) { idx = i; break; }
    }
    if (idx < 0) {
      var achou = null;
      (atuais.ingredientes || []).forEach(function (ing) {
        if (achou || ing.excluido) return;
        if (chave_(ing.nomeNormalizado || ing.nome) === nomeA &&
            chave_(ing.grupoQuimico) === chave_(a.grupoQuimico)) achou = ing;
      });
      ingredientes.push({
        acao: achou ? 'reusar' : 'criar', id: achou ? achou.id : null,
        nome: a.nome, nomeNormalizado: nomeA, grupoQuimico: a.grupoQuimico
      });
      idx = ingredientes.length - 1;
    }
    if (idxJaVisto[idx]) return;
    idxJaVisto[idx] = true;
    relacoes.push({ ingredienteIdx: idx, concentracao: a.concentracao, unidade: a.unidade,
      percentual: a.percentual, ordem: relacoes.length + 1 });
  });

  // Documentos: dedup por URL (também dentro do próprio payload); mesma
  // identidade (tipo+título) com URL nova → cadeia substitui
  var documentos = [];
  var urlsVistos = [];
  (Array.isArray(d.documentos) ? d.documentos : []).forEach(function (doc) {
    var url = bqNormalizar_(doc.url);
    if (!url) return;
    var titulo = bqNormalizar_(doc.descricao);
    var tipo = bqDocTipo_(doc.tipo_documento || titulo);
    if (!tipo) {
      documentos.push({ acao: 'pular', motivo: 'tipo_desconhecido', url: url, titulo: titulo });
      return;
    }
    if (urlsVistos.indexOf(url) > -1) {
      documentos.push({ acao: 'pular', motivo: 'url_existente', url: url, titulo: titulo, tipo: tipo });
      return;
    }
    urlsVistos.push(url);
    var existentes = (atuais.documentos || []).filter(function (dd) { return !dd.excluido; });
    var igualUrl = existentes.some(function (dd) { return bqNormalizar_(dd.url) === url; });
    if (igualUrl) {
      documentos.push({ acao: 'pular', motivo: 'url_existente', url: url, titulo: titulo, tipo: tipo });
      return;
    }
    var anterior = null;
    existentes.forEach(function (dd) {
      if (bqDocTipo_(dd.tipo) === tipo && chave_(dd.titulo) === chave_(titulo)) anterior = dd;
    });
    documentos.push({
      acao: 'criar', tipo: tipo, titulo: titulo || tipo, url: url,
      dataDocumento: doc.data_inclusao ? String(doc.data_inclusao).slice(0, 10) : '',
      fonte: 'agrofit', substitui: anterior ? anterior.id : ''
    });
  });

  // Culturas: só quando o payload do detalhe as trouxer (§10.2)
  var culturas = [];
  var listaCulturas = d.culturas_autorizadas || d.culturas || d.indicacoes_cultura || d.culturas_uso;
  if (Array.isArray(listaCulturas)) {
    listaCulturas.forEach(function (c) {
      var obj = (typeof c === 'object' && c !== null) ? c : { cultura: String(c === undefined || c === null ? '' : c) };
      var nomeC = bqNormalizar_(obj.cultura || obj.nome_cultura || obj.nome);
      if (!nomeC) return;
      culturas.push({
        cultura: nomeC,
        estadio: bqNormalizar_(obj.estadio || obj.estagio),
        doseReferencia: bqNormalizar_(obj.dose_referencia || obj.dose),
        condicao: bqNormalizar_(obj.condicao || obj.condicoes)
      });
    });
  }

  return {
    registro: registro, nome: marca, urlAgrofit: bqNormalizar_(d.url_agrofit),
    faltantes: faltantes, produto: produto,
    ingredientes: ingredientes, relacoes: relacoes,
    documentos: documentos, culturas: culturas
  };
}

/* Evidência de bloco da importação (§10.2): fonte oficial registro_mapa,
   carimbada como importação automática (revisadoPor=ia:import_agrofit). */
function bqEvidenciaBloco_(bloco, produtoId, valor, detalhe) {
  return bqCriarEvidenciaInline_({
    entidadeTipo: 'produto', entidadeId: String(produtoId), campo: bloco,
    valor: bqResumo_(valor), fonteTipo: 'registro_mapa',
    fonteNome: 'AGROFIT (AgroAPI Embrapa)',
    documentoUrl: bqNormalizar_((detalhe || {}).url_agrofit)
  }, 'produto', String(produtoId), bloco, 'ia:import_agrofit', 'import_agrofit');
}

/* Etapa 1 — produto (identidade + evidência do bloco 'identidade'). */
function bqImportProduto_(plano, detalhe) {
  var campos = Object.assign({}, plano.produto.campos || {});
  var hoje = new Date();
  var evValor = bqResumo_([plano.registro, campos.nomeComercial, campos.titularRegistro,
    campos.formula, campos.classeAgronomica].join(' | '));
  var ev = {
    campo: 'identidade', valor: evValor, fonteTipo: 'registro_mapa',
    fonteNome: 'AGROFIT (AgroAPI Embrapa)', documentoUrl: bqNormalizar_(detalhe.url_agrofit)
  };
  var opts = { origem: 'import_agrofit', autor: 'ia:import_agrofit', historicoAcao: 'importar' };

  if (plano.produto.acao === 'criar') {
    campos.dataColetaMAPA = hoje;
    var rAdd = bqAdd_('bqProdutos', Object.assign({}, opts, {
      tipo: 'bqProdutos', data: Object.assign({}, campos, { evidencia: ev })
    }));
    if (!rAdd.ok) return rAdd;
    return { ok: true, produtoId: rAdd.id, criado: true, evidenciaId: rAdd.evidenciaId };
  }

  var produtoId = plano.produto.id;
  if (plano.produto.acao === 'divergente') {
    // Produto já validado com valores conflitantes: evidência divergente e
    // NADA é sobrescrito (§10.3).
    var rEv = bqEvidenciaBloco_('identidade', produtoId, evValor, detalhe);
    if (!rEv.ok) return rEv;
    return { ok: true, produtoId: produtoId, divergente: true, evidenciaId: rEv.id };
  }
  if (plano.produto.acao === 'atualizar') {
    var dadosUp = Object.assign({}, plano.produto.camposAtualizar,
      { dataColetaMAPA: hoje, evidencia: ev });
    var rUp = bqUpdate_('bqProdutos', Object.assign({}, opts, {
      tipo: 'bqProdutos', id: produtoId, data: dadosUp
    }));
    if (!rUp.ok) return rUp;
    return { ok: true, produtoId: produtoId, atualizado: rUp.alterados };
  }
  return { ok: true, produtoId: produtoId };  // 'identico' — idempotente, nada muda
}

/* Etapa 2 — ingredientes, relações, documentos e culturas (§10.2). */
function bqImportResto_(plano, detalhe, produtoId) {
  var res = { ingredientes: 0, relacoes: 0, documentos: 0, culturas: 0,
    evidencias: 0, atualizacoes: 0, pulados: [] };
  var opts = { origem: 'import_agrofit', autor: 'ia:import_agrofit', historicoAcao: 'importar' };
  var i, j;

  if (plano.produto.acao === 'divergente') {
    res.pulados.push('produto_divergente');
    return { ok: true, res: res };
  }

  // --- ingredientes (dedup já resolvido no plano) ---
  var idsPorChave = {};
  for (i = 0; i < plano.ingredientes.length; i++) {
    var it = plano.ingredientes[i];
    var chave = it.nomeNormalizado + '|' + chave_(it.grupoQuimico);
    if (it.acao === 'reusar') { idsPorChave[chave] = it.id; continue; }
    var rIng = bqAdd_('bqIngredientes', Object.assign({}, opts, {
      tipo: 'bqIngredientes',
      data: { nome: it.nome, nomeNormalizado: it.nomeNormalizado, grupoQuimico: it.grupoQuimico, tipo: 'ativo' }
    }));
    if (!rIng.ok) return { ok: false, error: rIng.error, etapa: 'ingredientes' };
    idsPorChave[chave] = rIng.id;
    res.ingredientes++;
  }

  // --- relações QPI (evidência do bloco 'composicao' sob demanda) ---
  var evComp = '';
  var evAutoriz = '';
  var piAtuais = bqDadosTipo_('bqProdIngredientes');
  for (i = 0; i < plano.relacoes.length; i++) {
    var rel = plano.relacoes[i];
    var itRel = plano.ingredientes[rel.ingredienteIdx];
    var ingId = idsPorChave[itRel.nomeNormalizado + '|' + chave_(itRel.grupoQuimico)];
    if (!ingId) continue;
    var conc = (rel.concentracao === null || rel.concentracao === undefined) ? '' : rel.concentracao;
    var uni = rel.unidade || '';
    var perc = (rel.percentual === null || rel.percentual === undefined) ? '' : rel.percentual;
    var existente = null;
    for (j = 0; j < piAtuais.length; j++) {
      var pi = piAtuais[j];
      if (!pi.excluido && String(pi.produtoId) === String(produtoId) && String(pi.ingredienteId) === String(ingId)) {
        existente = pi; break;
      }
    }
    if (!existente) {
      if (!evComp) {
        var rEvC = bqEvidenciaBloco_('composicao', produtoId,
          plano.ingredientes.map(function (x) { return x.nome; }).join('; '), detalhe);
        if (!rEvC.ok) return { ok: false, error: rEvC.error, etapa: 'composicao' };
        evComp = rEvC.id; res.evidencias++;
      }
      var rPI = bqAdd_('bqProdIngredientes', Object.assign({}, opts, {
        tipo: 'bqProdIngredientes',
        data: { produtoId: String(produtoId), ingredienteId: String(ingId),
          concentracao: conc, unidade: uni, percentual: perc, ordem: rel.ordem,
          evidenciaId: evComp }
      }));
      if (rPI.ok) res.relacoes++;
      else if (rPI.error !== 'duplicata') return { ok: false, error: rPI.error, etapa: 'relacoes' };
      continue;
    }
    var diffs = {};
    if (bqDivergente_(existente.concentracao, conc) && conc !== '') diffs.concentracao = conc;
    if (bqDivergente_(existente.unidade, uni) && uni !== '') diffs.unidade = uni;
    if (bqDivergente_(existente.percentual, perc) && perc !== '') diffs.percentual = perc;
    if (!Object.keys(diffs).length) continue;
    if (!evComp) {
      var rEvD = bqEvidenciaBloco_('composicao', produtoId,
        plano.ingredientes.map(function (x) { return x.nome; }).join('; '), detalhe);
      if (!rEvD.ok) return { ok: false, error: rEvD.error, etapa: 'composicao' };
      evComp = rEvD.id; res.evidencias++;
    }
    var rUpPI = bqUpdate_('bqProdIngredientes', Object.assign({}, opts, {
      tipo: 'bqProdIngredientes', id: existente.id,
      data: Object.assign({}, diffs, { evidenciaId: evComp })
    }));
    if (!rUpPI.ok) return { ok: false, error: rUpPI.error, etapa: 'relacoes' };
    res.atualizacoes++;
  }

  // --- documentos (o próprio registro é a evidência, §10.2) ---
  for (i = 0; i < plano.documentos.length; i++) {
    var doc = plano.documentos[i];
    if (doc.acao !== 'criar') { res.pulados.push('documento_' + doc.motivo); continue; }
    var rDoc = bqAdd_('bqDocumentos', Object.assign({}, opts, {
      tipo: 'bqDocumentos',
      data: { tipo: doc.tipo, titulo: doc.titulo, url: doc.url,
        dataDocumento: doc.dataDocumento, versao: '', fonte: 'agrofit',
        substitui: doc.substitui }
    }));
    if (!rDoc.ok) return { ok: false, error: rDoc.error, etapa: 'documentos' };
    res.documentos++;
  }

  // --- culturas (1 evidência do bloco 'autorizacao' se houver linhas novas) ---
  if (plano.culturas.length) {
    var culturasAtuais = bqDadosTipo_('bqCulturas');
    var novas = [];
    for (i = 0; i < plano.culturas.length; i++) {
      var c = plano.culturas[i];
      var achada = null;
      for (j = 0; j < culturasAtuais.length; j++) {
        var cu = culturasAtuais[j];
        if (cu.excluido || String(cu.produtoId) !== String(produtoId)) continue;
        if (bqNormalizar_(cu.cultura) === c.cultura &&
            bqNormalizar_(cu.estadio) === c.estadio &&
            bqNormalizar_(cu.doseReferencia) === c.doseReferencia) { achada = cu; break; }
      }
      if (!achada) novas.push(c);
    }
    if (novas.length) {
      var rEvA = bqEvidenciaBloco_('autorizacao', produtoId,
        novas.map(function (x) { return x.cultura; }).join('; '), detalhe);
      if (!rEvA.ok) return { ok: false, error: rEvA.error, etapa: 'autorizacao' };
      evAutoriz = rEvA.id; res.evidencias++;
      for (i = 0; i < novas.length; i++) {
        var nc = novas[i];
        var rCult = bqAdd_('bqCulturas', Object.assign({}, opts, {
          tipo: 'bqCulturas',
          data: { produtoId: String(produtoId), cultura: nc.cultura, estadio: nc.estadio,
            doseReferencia: nc.doseReferencia, condicao: nc.condicao, evidenciaId: evAutoriz }
        }));
        if (!rCult.ok) return { ok: false, error: rCult.error, etapa: 'culturas' };
        res.culturas++;
      }
    }
  }

  return { ok: true, res: res };
}

function bqResumoImport_(res, criado) {
  return bqResumo_([
    criado ? 'produto criado' : 'produto conferido',
    res.ingredientes + ' ingredientes novos',
    res.relacoes + ' relações novas',
    res.documentos + ' documentos novos',
    res.culturas + ' culturas novas',
    res.atualizacoes + ' atualizações'
  ].join('; '));
}

/* Item da fila: monta QPESQ para a consulta já concluída (reusa linha com a
   mesma consulta que não esteja cancelada — idempotência da §10.3). */
function bqFilaMontar_(consulta, produtoId) {
  var lista = bqDadosTipo_('bqPesquisas');
  for (var i = 0; i < lista.length; i++) {
    var q = lista[i];
    if (!q.excluido && bqNormalizar_(q.consulta) === consulta && String(q.estado) !== 'cancelado') {
      return { id: q.id, reusado: true };
    }
  }
  var r = bqAdd_('bqPesquisas', {
    tipo: 'bqPesquisas',
    data: { entidadeTipo: 'produto', entidadeId: String(produtoId), consulta: consulta,
      fonteAlvo: 'agrofit', obs: 'importação AGROFIT (Fase 2, §10)' }
  });
  if (!r.ok) return { error: r.error };
  return { id: r.id, reusado: false };
}

/* Escrita direta de campos da fila (estado/tentativas é bookkeeping interno —
   as transições da §8.2 só são validadas na API externa action:'update'). */
function bqFilaGravar_(filaId, campos) {
  var achado = bqAcharId_('bqPesquisas', filaId);
  if (!achado) return { ok: false, error: 'id não encontrado' };
  var sheet = bqSheet_('bqPesquisas');
  var textos = SHEETS_BQ.bqPesquisas.textos || [];
  Object.keys(campos).forEach(function (c) {
    var col = achado.idx[c];
    if (col === undefined) return;
    bqSetCelula_(sheet, achado.rowIdx, col + 1, campos[c], textos.indexOf(c) > -1);
    achado.linha[col] = campos[c];
  });
  cacheLimpar_('bqPesquisas');
  return { ok: true };
}

/* Processa UM item da fila: obtém detalhe → plano → produto → resto. */
function bqFilaProcessarItem_(fila, detalheFornecido) {
  var agora = new Date();
  var tentativas = (Number(fila.tentativas) || 0) + 1;
  var consulta = bqNormalizar_(fila.consulta);

  function falhou(error) {
    // Token ausente/inválido NÃO marca erro: o item fica pendente para o
    // lote seguinte, quando o token estiver disponível (§10.3).
    if (error === 'agrofit_token_ausente' || error === 'agrofit_token_invalido') {
      return { ok: false, error: error, filaId: fila.id, pendente: true };
    }
    bqFilaGravar_(fila.id, { estado: 'erro', tentativas: tentativas, dataAtualizacao: agora,
      execucaoPor: 'ia:import_agrofit', ultimoErro: bqResumo_(error) });
    return { ok: false, error: error, filaId: fila.id };
  }

  var r;
  if (detalheFornecido) {
    var dFix = bqAgrofitExtrair_(detalheFornecido);
    r = dFix ? { ok: true, detalhe: dFix } : { ok: false, error: 'agrofit_payload_invalido' };
  } else if (/^\d+$/.test(consulta)) {
    r = bqAgrofitDetalhe_(consulta);
  } else {
    var rb = bqAgrofitBuscaNumero_(consulta);
    r = rb.ok ? bqAgrofitDetalhe_(rb.numeroRegistro) : rb;
  }
  if (!r.ok) return falhou(r.error);

  var atuais = { produtos: bqDadosTipo_('bqProdutos'),
    ingredientes: bqDadosTipo_('bqIngredientes'), documentos: bqDadosTipo_('bqDocumentos') };
  var plano = bqImportPlano_(r.detalhe, atuais);

  if (plano.produto.acao === 'impossivel') return falhou('campo_obrigatorio: nomeComercial');
  if (plano.produto.acao === 'ignorado_excluido') {
    bqFilaGravar_(fila.id, { estado: 'cancelado', tentativas: tentativas, dataAtualizacao: agora,
      execucaoPor: 'ia:import_agrofit', resumoResultado: 'produto excluído — importação ignorada',
      dataConclusao: agora, ultimoErro: '' });
    return { ok: true, ignorado: true, filaId: fila.id };
  }

  var ex1 = bqImportProduto_(plano, r.detalhe);
  if (!ex1.ok) return falhou(ex1.error);
  var ex2 = bqImportResto_(plano, r.detalhe, ex1.produtoId);
  if (!ex2.ok) return falhou(ex2.error);

  var resumo = bqResumoImport_(ex2.res, plano.produto.acao === 'criar');
  bqFilaGravar_(fila.id, { estado: 'concluido', tentativas: tentativas, dataAtualizacao: agora,
    execucaoPor: 'ia:import_agrofit', resumoResultado: resumo, dataConclusao: agora,
    ultimoErro: '' });
  return { ok: true, filaId: fila.id, produtoId: ex1.produtoId, resumo: resumo, res: ex2.res };
}

/* POST {tipo:'bqPesquisas', action:'agrofit'} (§9.3/§10.3).
   simular (default TRUE): monta o plano do que seria gravado e NÃO escreve
   nada (§14.3(4)). simular:false: monta QPESQ + executa o lote agora. */
function bqAgrofitSync_(body) {
  var data = body.data || {};
  var numeroRegistro = bqNormalizar_(data.numeroRegistro);
  var nome = bqNormalizar_(data.nome);
  var temDetalhe = !!(data.detalhe && typeof data.detalhe === 'object');
  if (!numeroRegistro && !nome && !temDetalhe) {
    return { ok: false, error: 'campo_obrigatorio', campo: 'numeroRegistro|nome' };
  }

  var r;
  if (temDetalhe) {
    // Payload já trazido (simulação offline de teste — §14.3(4); sem rede)
    var dFix = bqAgrofitExtrair_(data.detalhe);
    r = dFix ? { ok: true, detalhe: dFix } : { ok: false, error: 'agrofit_payload_invalido' };
  } else if (numeroRegistro) {
    r = bqAgrofitDetalhe_(numeroRegistro);
  } else {
    var rb = bqAgrofitBuscaNumero_(nome);
    r = rb.ok ? bqAgrofitDetalhe_(rb.numeroRegistro) : rb;
  }
  if (!r.ok) return r;

  var atuais = { produtos: bqDadosTipo_('bqProdutos'),
    ingredientes: bqDadosTipo_('bqIngredientes'), documentos: bqDadosTipo_('bqDocumentos') };
  var plano = bqImportPlano_(r.detalhe, atuais);

  if (data.simular !== false) return { ok: true, simular: true, plano: plano };

  if (plano.produto.acao === 'impossivel') {
    return { ok: false, error: 'campo_obrigatorio', campo: 'nomeComercial' };
  }
  if (plano.produto.acao === 'ignorado_excluido') {
    return { ok: true, simular: false, aviso: 'produto_excluido', plano: plano };
  }

  var ex1 = bqImportProduto_(plano, r.detalhe);
  if (!ex1.ok) return ex1;

  var consulta = bqNormalizar_(plano.registro) || nome;
  var fila = bqFilaMontar_(consulta, ex1.produtoId);
  if (!fila.id) return { ok: false, error: fila.error || 'fila_falhou' };

  var ex2 = bqImportResto_(plano, r.detalhe, ex1.produtoId);
  if (!ex2.ok) {
    bqFilaGravar_(fila.id, { estado: 'erro', tentativas: 1, dataAtualizacao: new Date(),
      execucaoPor: 'ia:import_agrofit', ultimoErro: bqResumo_(ex2.error) });
    return { ok: false, error: ex2.error, etapa: ex2.etapa, filaId: fila.id };
  }

  var resumo = bqResumoImport_(ex2.res, plano.produto.acao === 'criar');
  bqFilaGravar_(fila.id, { estado: 'concluido',
    tentativas: (Number(bqAcharId_('bqPesquisas', fila.id).obj.tentativas) || 0) + 1,
    dataAtualizacao: new Date(), dataConclusao: new Date(),
    execucaoPor: 'ia:import_agrofit', resumoResultado: resumo, ultimoErro: '' });
  return { ok: true, simular: false, filaId: fila.id, reusado: !!fila.reusado,
    produtoId: ex1.produtoId, evidenciaId: ex1.evidenciaId || '',
    plano: plano, resumo: resumo, resultado: ex2.res };
}

/* POST {tipo:'bqPesquisas', action:'processar'} (§10.3): processa até N itens
   pendentes respeitando orçamento de fetch; o restante fica pendente. */
function bqFilaProcessar_(body) {
  var data = body.data || {};
  var limite = Number(data.limite);
  if (!limite || limite < 1) limite = 20;
  if (limite > 100) limite = 100;
  var orcamento = Number(data.orcamento);
  if (!orcamento || orcamento < 1) orcamento = BQ_FETCH_LIMITE_;
  if (orcamento > BQ_FETCH_LIMITE_) orcamento = BQ_FETCH_LIMITE_;

  var pendentes = bqDadosTipo_('bqPesquisas').filter(function (q) {
    return !q.excluido && String(q.estado) === 'pendente';
  });
  var processados = 0, falhas = 0, aviso = '';
  for (var i = 0; i < pendentes.length; i++) {
    if (processados >= limite) break;
    if (BQ_FETCH_CONTADOR_ >= orcamento) { aviso = 'agrofit_orcamento_excedido'; break; }
    var r = bqFilaProcessarItem_(pendentes[i], null);
    if (r.error === 'agrofit_token_ausente' || r.error === 'agrofit_token_invalido') {
      aviso = r.error; break;   // não conta nem altera o item
    }
    processados++;
    if (!r.ok) falhas++;
  }
  if (!processados && aviso) return { ok: false, error: aviso };
  var out = { ok: true, processados: processados, falhas: falhas,
    restantes: pendentes.length - processados, fetches: BQ_FETCH_CONTADOR_ };
  if (aviso) out.aviso = aviso;
  return out;
}

/* POST {tipo:'bqProdutos', action:'vincular'} (§9.3/§16): vínculo explícito com
   cadastro existente (insumosInfo/estoque) + histórico. */
function bqVincular_(body) {
  var data = body.data || {};
  var permitidas = ['produtoId', 'origemEstoqueId', 'origemInfoId', 'autor', 'origem', 'motivo'];
  var extras = Object.keys(data).filter(function (k) { return permitidas.indexOf(k) === -1; });
  if (extras.length) return { ok: false, error: 'campo_desconhecido', campo: extras[0] };
  var produtoId = String(data.produtoId || '').trim();
  if (!produtoId) return { ok: false, error: 'campo_obrigatorio', campo: 'produtoId' };
  if (!bqExisteId_('bqProdutos', produtoId)) return { ok: false, error: 'id não encontrado' };

  var campos = {};
  if (data.origemEstoqueId !== undefined) campos.origemEstoqueId = String(data.origemEstoqueId);
  if (data.origemInfoId !== undefined) campos.origemInfoId = String(data.origemInfoId);
  if (!Object.keys(campos).length) {
    return { ok: false, error: 'campo_obrigatorio', campo: 'origemEstoqueId|origemInfoId' };
  }
  return bqUpdate_('bqProdutos', {
    tipo: 'bqProdutos', id: produtoId, data: campos,
    autor: String(body.autor || 'api'), origem: String(body.origem || 'api'),
    motivo: body.motivo || 'vínculo com cadastro existente (§16)'
  });
}
