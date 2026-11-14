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
  bqHistorico_(cfg.name, id, '(registro)', '', resumo, 'criar', autor, origem, body.motivo || '');
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
  Object.keys(data).forEach(function (campo) {
    var col = achado.idx[campo];
    if (col === undefined) return;
    var antigo = achado.linha[col];
    if (String(antigo) === String(data[campo])) return;
    bqSetCelula_(sheet, achado.rowIdx, col + 1, data[campo], !!(cfg.textos && cfg.textos.indexOf(campo) > -1));
    achado.linha[col] = data[campo];
    mudou++;
    bqHistorico_(cfg.name, String(body.id), campo, antigo, data[campo], 'alterar', autor, origem, body.motivo || '');
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
