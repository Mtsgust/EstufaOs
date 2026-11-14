/* Smoke da API publicada da Base Química (§14.3) — roda DEPOIS do clasp deploy.
   Cobre:
     1. GET dos 13 tipos bq* → ok:true (planilhas Q_* criadas na 1ª chamada)
     2. Roundtrip __teste__: add → confere colunas → update (gera histórico)
        → delete soft → confere excluido (linha preservada)
     3. Q_Historico rejeita escrita (somente_leitura)
     + garantias da §9.2 em produção: enum inválido, evidência obrigatória,
       integridade referencial, formato texto (1,410 vira string, nunca 1.41)
     (item 4 do §14.3 — simular do bqAgrofitSync — pertence à Fase 2, §10)
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
  const residuos = (await get('tipo=bqPropriedades')).data.filter((p) => typeof p.valor === 'number');
  for (const rd of residuos) {
    const rp = await post({ tipo: 'bqPropriedades', action: 'update', id: rd.id, data: { valor: '1,410' } });
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

  console.log('');
  console.log((total - falhas) + '/' + total + ' asserções passaram.');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('  FALHOU - ' + e.message); process.exit(1); });
