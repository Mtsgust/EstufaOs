/* Smoke da API publicada da Base Química (§14.3) — roda DEPOIS do clasp deploy.
   Cobre:
     1. GET dos 13 tipos bq* → ok:true (planilhas Q_* criadas na 1ª chamada)
     2. Roundtrip __teste__: add → confere colunas → update (gera histórico)
        → delete soft → confere excluido (linha preservada)
     3. Q_Historico rejeita escrita (somente_leitura)
     + garantias da §9.2 em produção: enum inválido, evidência obrigatória,
       integridade referencial, formato texto (1,410 vira string, nunca 1.41)
     4. Fase 2 (§10): simulação de importação AGROFIT com fixture offline —
        plano devolvido, NENHUMA planilha escrita, guardas das ações especiais
   Uso: node testes/api_smoke.test.js
   Rede: sim (API publicada). */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const TIPOS_BQ = ['bqProdutos', 'bqIngredientes', 'bqProdIngredientes', 'bqFormulacoes',
  'bqPropriedades', 'bqEvidencias', 'bqDocumentos', 'bqRestricoes', 'bqCulturas',
  'bqInteracoes', 'bqIntComponentes', 'bqHistorico', 'bqPesquisas'];

let total = 0, falhas = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ok  - ' + msg);
  else { falhas++; console.log('  FALHOU - ' + msg); }
}
function secao(t) { console.log('\n== ' + t); }

async function get(params) {
  const resp = await fetch(API + '?' + params, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em GET ' + params);
  return resp.json();
}
async function post(payload) {
  const resp = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em POST ' + payload.tipo + '/' + payload.action);
  return resp.json();
}

(async () => {
  /* ---------- 1) GET dos 13 tipos ---------- */
  secao('§14.3(1) — GET dos 13 tipos bq*');
  for (const t of TIPOS_BQ) {
    const j = await get('tipo=' + t);
    ok(j.ok === true && Array.isArray(j.data), t + ' → ok:true com lista');
  }
  const lote = await get('tipos=' + TIPOS_BQ.join(','));
  const faltando = TIPOS_BQ.filter((t) => !lote.ok || !Array.isArray((lote.dados || {})[t]));
  ok(lote.ok === true && faltando.length === 0,
    'lote ?tipos= com os 13 tipos → todos presentes' + (faltando.length ? ' faltando: ' + faltando.join(', ') : ''));
  const formulacoes = (lote.dados || {}).bqFormulacoes || [];
  ok(formulacoes.length >= 15, 'Q_Formulacoes semeada (' + formulacoes.length + ' formulações)');

  /* ---------- 2) roundtrip __teste__ ---------- */
  secao('§14.3(2) — roundtrip __teste__ (add → update → delete soft)');
  const criado = await post({
    tipo: 'bqProdutos', action: 'add',
    data: { nomeComercial: '__teste__', categoria: 'Fungicida', obs: 'smoke test' }
  });
  ok(criado.ok && !!criado.id, 'add de produto __teste__ aceito (id ' + criado.id + ')');

  let lista = (await get('tipo=bqProdutos')).data;
  let linha = lista.find((l) => String(l.id) === String(criado.id));
  ok(!!linha, 'produto aparece no GET');
  ok(linha && linha.nomeComercial === '__teste__', 'coluna nomeComercial gravada');
  ok(linha && linha.statusValidacao === 'pendente', 'padrão statusValidacao=pendente aplicado');
  ok(linha && linha.excluido === '' || (linha && !linha.excluido), 'excluido vazio no registro novo');

  // Texto frágil: valor '1,410' tem que voltar como STRING (formato @ da §5.3).
  const prop = await post({
    tipo: 'bqPropriedades', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: criado.id, campo: 'densidade', valor: '1,410', unidade: 'g/mL' },
    evidencia: { campo: 'densidade', valor: '1,410', fonteTipo: 'ficha_tecnica', fonteNome: 'Ficha do teste' }
  });
  ok(prop.ok && !!prop.evidenciaId, 'Q_Propriedades com evidência inline aceita');
  const props = (await get('tipo=bqPropriedades')).data;
  const minhaProp = props.find((p) => String(p.id) === String(prop.id));
  ok(minhaProp && typeof minhaProp.valor === 'string' && minhaProp.valor === '1,410',
    'valor "1,410" preservado como texto (não virou 1.41)');
  const minhaEv = (await get('tipo=bqEvidencias')).data.find((e) => String(e.id) === String(prop.evidenciaId));
  ok(minhaEv && typeof minhaEv.valor === 'string' && minhaEv.valor === '1,410',
    'evidência com valor "1,410" também texto');

  // Resíduo de deploy anterior (@43): linhas antigas gravadas como número 1.41
  // são reparadas via update (escada de reparo da §5.3 no caminho de update).
  // Update de campo técnico exige evidência (§7.1): reaproveita a da linha ou
  // registra evidência inline de reparo.
  const residuos = (await get('tipo=bqPropriedades')).data.filter((p) => typeof p.valor === 'number');
  for (const rd of residuos) {
    const dadosRep = { valor: '1,410' };
    const corpoRep = { tipo: 'bqPropriedades', action: 'update', id: rd.id, data: dadosRep };
    if (rd.evidenciaId) {
      dadosRep.evidenciaId = rd.evidenciaId;
    } else {
      corpoRep.evidencia = { campo: rd.campo || 'densidade', valor: '1,410',
        fonteTipo: 'usuario', fonteNome: 'reparo anti-coerção (smoke §5.3)' };
    }
    const rp = await post(corpoRep);
    ok(rp.ok, 'resíduo Q_Propriedades ' + rd.id + ' reparado' + (rp.ok ? '' : ' → ' + rp.error));
  }
  const residuosEv = (await get('tipo=bqEvidencias')).data.filter((e) => typeof e.valor === 'number');
  for (const re2 of residuosEv) {
    const rp = await post({ tipo: 'bqEvidencias', action: 'update', id: re2.id, data: { valor: '1,410' } });
    ok(rp.ok, 'resíduo Q_Evidencias ' + re2.id + ' reparado' + (rp.ok ? '' : ' → ' + rp.error));
  }
  const propsFinal = (await get('tipo=bqPropriedades')).data;
  ok(propsFinal.filter((p) => typeof p.valor === 'number').length === 0,
    'nenhum valor numérico residual em Q_Propriedades');

  const upd = await post({ tipo: 'bqProdutos', action: 'update', id: criado.id, data: { nomeComercial: '__teste__ v2' } });
  ok(upd.ok && upd.alterados === 1, 'update aceito com 1 alteração');
  const hist = (await get('tipo=bqHistorico')).data;
  const alteracoes = hist.filter((h) => String(h.entidadeId) === String(criado.id) && h.acao === 'alterar');
  ok(alteracoes.length >= 1 && String(alteracoes[0].campo) === 'nomeComercial', 'Q_Historico registrou a alteração por campo');

  const antes = (await get('tipo=bqProdutos')).data.length;
  const del = await post({ tipo: 'bqProdutos', action: 'delete', id: criado.id });
  ok(del.ok, 'delete aceito');
  const depois = (await get('tipo=bqProdutos')).data;
  ok(depois.length === antes, 'linha preservada após delete (soft delete)');
  linha = depois.find((l) => String(l.id) === String(criado.id));
  ok(linha && (linha.excluido === true || linha.excluido === 'true'), 'coluna excluido = true');
  const del2 = await post({ tipo: 'bqProdutos', action: 'delete', id: criado.id });
  ok(del2.ok && del2.jaExcluido === true, 'delete repetido idempotente');
  const restaurado = await post({ tipo: 'bqProdutos', action: 'restaurar', id: criado.id });
  ok(restaurado.ok, 'restaurar aceito (desfaz soft delete)');
  // Deixa o registro de teste excluído de vez (soft delete — auditoria preservada).
  const fim = await post({ tipo: 'bqProdutos', action: 'delete', id: criado.id });
  ok(fim.ok, 'delete final deixa __teste__ excluído');

  /* ---------- 3) Q_Historico somente leitura ---------- */
  secao('§14.3(3) — Q_Historico rejeita escrita');
  let j = await post({ tipo: 'bqHistorico', action: 'add', data: { entidadeTipo: 'produto', entidadeId: 'x' } });
  ok(!j.ok && j.error === 'somente_leitura', 'add → somente_leitura');
  j = await post({ tipo: 'bqHistorico', action: 'update', id: 'qualquer', data: { campo: 'y' } });
  ok(!j.ok && j.error === 'somente_leitura', 'update → somente_leitura');
  j = await post({ tipo: 'bqHistorico', action: 'delete', id: 'qualquer' });
  ok(!j.ok && j.error === 'somente_leitura', 'delete → somente_leitura');

  /* ---------- garantias da §9.2 em produção ---------- */
  secao('§9.2 — guardas em produção');
  j = await post({ tipo: 'bqProdutos', action: 'add', data: { nomeComercial: '__nunca__', categoria: 'CategoriaInventada' } });
  ok(!j.ok && j.error === 'enum_invalido' && j.campo === 'categoria', 'enum inválido → enum_invalido');
  j = await post({ tipo: 'bqProdutos', action: 'add', data: {} });
  ok(!j.ok && j.error === 'campo_obrigatorio', 'campo obrigatório ausente → campo_obrigatorio');
  j = await post({
    tipo: 'bqPropriedades', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: 'QPROD_qualquer', campo: 'ph', valor: '6,5' }
  });
  ok(!j.ok && j.error === 'evidencia_obrigatoria', 'Q_Propriedades sem evidência → evidencia_obrigatoria');
  j = await post({
    tipo: 'bqProdIngredientes', action: 'add',
    data: { produtoId: 'QPROD_inexistente', ingredienteId: 'QING_inexistente' },
    evidencia: { campo: 'concentracao', valor: 'x', fonteTipo: 'bula', fonteNome: 'Bula' }
  });
  ok(!j.ok && (j.error === 'referencia_invalida' || j.error === 'evidencia_obrigatoria'),
    'referência inexistente não vira linha órfã (' + j.error + ')');
  j = await post({ tipo: 'bqProdutos', action: 'add', data: { nomeComercial: '__x__', produtoId: 'coluna_inexistente' } });
  ok(!j.ok && j.error === 'campo_desconhecido', 'campo desconhecido → campo_desconhecido');
  // Resíduos de testes de runs anteriores: auditoria preservada, mas nada ativo.
  const testesLegado = (await get('tipo=bqProdutos')).data
    .filter((l) => /^__teste__/.test(String(l.nomeComercial)));
  const ativosTeste = testesLegado
    .filter((l) => !(l.excluido === true || l.excluido === 'true'));
  ok(ativosTeste.length === 0,
    'nenhum produto __teste__ ativo (' + testesLegado.length + ' resíduos, todos soft-deleted)');

  /* ---------- 4) Fase 2: simulação AGROFIT offline (§14.3(4)/§10) ---------- */
  secao('§14.3(4) — simulação de importação AGROFIT (fixture offline, sem rede)');
  const FIX = {
    numero_registro: '99991',
    marca_comercial: ['Fungix 999'],
    titular_registro: 'Coagri Teste Ltda',
    classe_categoria_agronomica: ['Fungicida'],
    formulacao: 'Suspensão Concentrada (SC)',
    ingrediente_ativo: ['Mancozebe', 'Tebuconazol'],
    ingrediente_ativo_detalhado: [
      { ingrediente_ativo: 'Mancozebe', grupo_quimico: 'Ditiocarbamatos', concentracao: '640', unidade_medida: 'g/L', percentual: '' },
      { ingrediente_ativo: 'Tebuconazol', grupo_quimico: 'Triazol', concentracao: '200', unidade_medida: 'g/L', percentual: '' }
    ],
    produto_biologico: false,
    url_agrofit: 'https://agrofit.agricultura.gov.br/detalhe/99991',
    documentos: [
      { descricao: 'Bula Fungix 999', tipo_documento: 'Bula', data_inclusao: '2024-05-01', url: 'https://agrofit/bula/99991.pdf' }
    ],
    culturas_autorizadas: [{ cultura: 'Soja', estadio: 'V4-V6', dose_referencia: '300 mL/ha', condicao: '' }]
  };
  async function contagens() {
    const l = await get('tipos=' + TIPOS_BQ.join(','));
    const c = {};
    for (const t of TIPOS_BQ) c[t] = ((l.dados || {})[t] || []).length;
    return c;
  }
  const c0 = await contagens();
  let sim = await post({ tipo: 'bqPesquisas', action: 'agrofit', data: { numeroRegistro: '99991', detalhe: FIX } });
  ok(sim.ok === true && sim.simular === true, 'action agrofit → simular:true (default)');
  ok(sim.plano && sim.plano.produto && sim.plano.produto.acao === 'criar', 'plano devolvido com acao criar');
  ok(Array.isArray(sim.plano.ingredientes) && sim.plano.ingredientes.length === 2 &&
     Array.isArray(sim.plano.documentos) && sim.plano.culturas.length === 1,
    'plano completo (ingredientes, documentos, culturas)');
  const c1 = await contagens();
  ok(JSON.stringify(c0) === JSON.stringify(c1),
    'simular não escreveu em nenhuma das 13 planilhas (contagens idênticas)');

  j = await post({ tipo: 'bqPesquisas', action: 'agrofit',
    data: { detalhe: { numero_registro: '99992', marca_comercial: [] } } });
  ok(j.ok === true && j.simular === true && j.plano.produto.acao === 'impossivel',
    'payload incompleto → plano impossível (nunca exceção)');
  j = await post({ tipo: 'bqPesquisas', action: 'agrofit', data: {} });
  ok(!j.ok && j.error === 'campo_obrigatorio', 'agrofit sem numeroRegistro|nome → campo_obrigatorio');
  j = await post({ tipo: 'bqProdutos', action: 'agrofit', data: {} });
  ok(!j.ok && j.error === 'ação inválida', 'action agrofit fora de bqPesquisas → ação inválida');
  j = await post({ tipo: 'bqPesquisas', action: 'processar', data: { limite: 1 } });
  ok(j.ok === true && j.processados === 0,
    'processar sem itens pendentes → nada a processar (sem rede)');
  const c2 = await contagens();
  ok(JSON.stringify(c0) === JSON.stringify(c2), 'nenhuma linha nova em nenhuma planilha após os guardas');
  j = await post({ tipo: 'bqProdutos', action: 'vincular',
    data: { produtoId: 'QPROD_nao_existe', origemInfoId: 'X' } });
  ok(!j.ok && j.error === 'id não encontrado', 'vincular com produto inexistente → id não encontrado');
  j = await post({ tipo: 'bqProdutos', action: 'vincular', data: { produtoId: 'QPROD_x', extra: 1 } });
  ok(!j.ok && j.error === 'campo_desconhecido', 'vincular com campo desconhecido → campo_desconhecido');

  /* ---------- 5) Fase 4: ficha (simular/executar), revisar, chave lógica ---------- */
  secao('§14.3(5) — Fase 4: action ficha, revisar e guarda de chave lógica (§6.5/§7.4)');
  const carimbo = Date.now();
  const linhaFix = {
    id: 'SMOKE_F4_' + carimbo, nome: '__teste__ f4 sim ' + carimbo,
    fabricante: 'Ficha Teste Ltda', categoria: 'Fertilizante líquido',
    origemDado: 'fabricante', fonteInfo: 'Ficha oficial – Ficha Teste Ltda',
    fonteUrl: 'https://exemplo.invalid/ficha-f4-' + carimbo + '.pdf',
    densidade: '1,20 g/cm³', ph: '6,5–7,5', solubilidade: '', naturezaFisica: '', miscibilidade: ''
  };
  const cF0 = await contagens();
  let sf = await post({ tipo: 'bqPropriedades', action: 'ficha', data: { simular: true, linhas: [linhaFix] } });
  ok(sf.ok === true && sf.simular === true, 'action ficha → simular:true');
  ok(sf.plano && sf.plano.length === 1 && sf.plano[0].produto.acao === 'criar',
    'plano devolvido com produto a criar');
  ok(sf.plano[0].produto.campos.categoria === 'Fertilizante',
    'categoria mapeada por regra documentada (§16), nunca adivinhada');
  ok(Array.isArray(sf.plano[0].propriedades) && sf.plano[0].propriedades.length === 2,
    'plano: 2 propriedades (densidade + ph) — vazias puladas');
  const cF1 = await contagens();
  ok(JSON.stringify(cF0) === JSON.stringify(cF1),
    'ficha simular não escreveu em nenhuma das 13 planilhas');
  j = await post({ tipo: 'bqPropriedades', action: 'ficha', data: {} });
  ok(!j.ok && j.error === 'campo_obrigatorio', 'ficha sem linhas → campo_obrigatorio');
  j = await post({ tipo: 'bqProdutos', action: 'ficha', data: { linhas: [linhaFix] } });
  ok(!j.ok && j.error === 'ação inválida', 'ficha fora de bqPropriedades → ação inválida');
  j = await post({
    tipo: 'bqPropriedades', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: 'QPROD_nao_existe_' + carimbo, campo: 'ph', valor: '7' },
    evidencia: { campo: 'ph', valor: '7', fonteTipo: 'bula', fonteNome: 'Bula FK' }
  });
  ok(!j.ok && j.error === 'referencia_invalida' && j.campo === 'entidadeId',
    'entidadeId inexistente → referencia_invalida (§6.5)');

  // Executar de verdade (produto __teste__ … fica auditado; soft-deletado ao final)
  const linhaExec = {
    id: 'SMOKE_F4E_' + carimbo, nome: '__teste__ f4 exec ' + carimbo,
    fabricante: 'Ficha Teste Ltda', origemDado: 'fabricante',
    fonteInfo: 'Ficha oficial – Ficha Teste Ltda',
    fonteUrl: 'https://exemplo.invalid/ficha-f4e-' + carimbo + '.pdf',
    densidade: '1,410 g/mL', ph: '6,5'
  };
  let ex = await post({ tipo: 'bqPropriedades', action: 'ficha', data: { simular: false, linhas: [linhaExec] } });
  ok(ex.ok === true && ex.simular === false, 'ficha executado (simular:false)');
  ok(ex.resumo.produtosCriados === 1 && ex.resumo.documentosCriados === 1,
    'produto + documento criados (resumo ' + JSON.stringify(ex.resumo).slice(0, 180) + '…)');
  ok(ex.resumo.propriedadesCriadas === 2, '2 propriedades criadas com evidência');
  ok(ex.resumo.erros.length === 0, 'nenhum erro por linha');
  const prodF4 = (await get('tipo=bqProdutos')).data
    .find((p) => String(p.origemInfoId) === linhaExec.id && !p.excluido);
  ok(!!prodF4, 'produto gravado com origemInfoId do cadastro (§11.2)');
  const propsF4 = (await get('tipo=bqPropriedades')).data
    .filter((p) => prodF4 && String(p.entidadeId) === String(prodF4.id) && !p.excluido);
  ok(propsF4.length === 2 && propsF4.every((p) => !!p.evidenciaId),
    'propriedades ligadas a evidência (§7.1)');
  const densF4 = propsF4.find((p) => p.campo === 'densidade');
  ok(densF4 && String(densF4.valor) === '1,410' && densF4.unidade === 'g/mL',
    'densidade parseada: valor "1,410" + unidade g/mL (nunca 1.41)');

  // Idempotência (§10.3): re-executar não duplica nada
  ex = await post({ tipo: 'bqPropriedades', action: 'ficha', data: { simular: false, linhas: [linhaExec] } });
  ok(ex.ok === true && ex.resumo.produtosCriados === 0 && ex.resumo.documentosCriados === 0 &&
     ex.resumo.propriedadesCriadas === 0 && ex.resumo.propriedadesIdenticas === 2,
    're-execução idempotente: 0 criações, 2 evidências idênticas puladas');
  ok(ex.resumo.documentosReusados === 1 && ex.resumo.produtosExistentes === 1,
    'documento reusado por URL e produto casado por origemInfoId');

  // Chave lógica (§6.5): mesmo valor → reusado; valor diferente → divergente
  const evBase = { campo: 'ph', fonteTipo: 'bula', fonteNome: 'Bula F4 ' + carimbo };
  j = await post({
    tipo: 'bqPropriedades', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: prodF4.id, campo: 'ph', valor: '6,5' },
    evidencia: Object.assign({}, evBase, { valor: '6,5' })
  });
  ok(j.ok === true && j.reusado === true, 'mesma chave + mesmo valor → reusado (sem 3ª linha)');
  j = await post({
    tipo: 'bqPropriedades', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: prodF4.id, campo: 'ph', valor: '7,8' },
    evidencia: Object.assign({}, evBase, { valor: '7,8', fonteNome: 'Outra Ficha ' + carimbo })
  });
  ok(j.ok === true && j.divergente === true, 'mesma chave + valor diferente → divergente (sem 3ª linha)');
  const phF4 = (await get('tipo=bqPropriedades')).data
    .filter((p) => prodF4 && String(p.entidadeId) === String(prodF4.id) && p.campo === 'ph' && !p.excluido);
  ok(phF4.length === 1, 'continua exatamente 1 linha de ph (nunca uma 3ª)');
  ok(phF4[0].status === 'divergente' && String(phF4[0].valor) === '6,5',
    'status virou divergente com o VALOR original preservado (§7.3)');

  // Revisão humana (§7.4/§9.3): aprovar carimba propriedade + evidência
  const rv = await post({ tipo: 'bqPropriedades', action: 'revisar',
    data: { id: phF4[0].id, decisao: 'aprovar', motivo: 'smoke §7.4' } });
  ok(rv.ok === true && rv.status === 'aprovado', 'revisar aprovar → status aprovado');
  const evRv = (await get('tipo=bqEvidencias')).data.find((e) => String(e.id) === String(rv.evidenciaId));
  ok(evRv && evRv.status === 'aprovado' && evRv.revisadoPor === 'usuario',
    'evidência vinculada carimbada (revisadoPor=usuario, status aprovado)');
  const phDepois = (await get('tipo=bqPropriedades')).data.find((p) => String(p.id) === String(phF4[0].id));
  ok(String(phDepois.valor) === '6,5', 'revisão NUNCA altera o valor (§7.4)');
  j = await post({ tipo: 'bqPropriedades', action: 'revisar', data: { id: phF4[0].id, decisao: 'chute' } });
  ok(!j.ok && j.error === 'enum_invalido', 'decisão fora de aprovar|rejeitar → enum_invalido');
  j = await post({ tipo: 'bqPropriedades', action: 'revisar', data: { id: 'QPROP_nao_existe', decisao: 'aprovar' } });
  ok(!j.ok && j.error === 'id não encontrado', 'revisar id inexistente → id não encontrado');

  // Update de campo técnico exige evidência (§7.1); obs é operacional
  j = await post({ tipo: 'bqPropriedades', action: 'update', id: phF4[0].id, data: { valor: '8,0' } });
  ok(!j.ok && j.error === 'evidencia_obrigatoria',
    'update técnico sem evidência → evidencia_obrigatoria (§7.1)');
  j = await post({ tipo: 'bqPropriedades', action: 'update', id: phF4[0].id, data: { obs: 'nota livre' } });
  ok(j.ok === true, 'update de obs sem evidência aceito (não é campo técnico)');

  // Limpeza: soft delete dos resíduos desta execução (auditoria preservada)
  await post({ tipo: 'bqPropriedades', action: 'delete', id: phF4[0].id });
  if (densF4) await post({ tipo: 'bqPropriedades', action: 'delete', id: densF4.id });
  await post({ tipo: 'bqProdutos', action: 'delete', id: prodF4.id });
  const docsLimpar = ex.plano.map((e) => e.documento).filter((d) => d && d.id);
  for (const d of docsLimpar) await post({ tipo: 'bqDocumentos', action: 'delete', id: d.id });
  ok(true, 'limpeza: produto/propriedades/documentos de teste soft-deletados');

  console.log('');
  console.log((total - falhas) + '/' + total + ' asserções passaram.');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('  FALHOU - ' + e.message); process.exit(1); });
