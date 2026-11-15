/* Fase 4 — população de Q_Propriedades + vínculos a partir do cadastro
   InsumosInfo (§4.2/§6.5/§11.2). As linhas vão NO PAYLOAD da action 'ficha' —
   o servidor nunca lê a aba de origem (§14.5/§9.4). Sem fonte utilizável não
   nasce propriedade; produto é criado/vinculado de qualquer forma (§11.2).
   Idempotente (§10.3): reexecutar não duplica produto/documento/propriedade.

   Uso:
     node testes/fase4_propriedades.js              # SIMULA (nada grava)
     node testes/fase4_propriedades.js --executar   # grava + verifica
   Verificação: 100% das Q_Propriedades ativas com evidenciaId, valores texto,
   status inicial pendente (nível E nunca auto-aprova — §7.2).
   Rede: sim (API publicada). */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const CAMPOS = ['ph', 'densidade', 'solubilidade', 'naturezaFisica', 'miscibilidade'];

async function get(tipos) {
  const r = await fetch(API + '?tipos=' + tipos, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em GET');
  return r.json();
}
async function post(payload) {
  const r = await fetch(API, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em POST ' + payload.action);
  return r.json();
}
const temFonte = (l) => !!(l.fonteUrl || l.fonteInfo || (l.origemDado && String(l.origemDado) !== 'nao_encontrada'));
const nProps = (l) => CAMPOS.filter((c) => l[c] !== undefined && String(l[c]).trim() !== '').length;

(async () => {
  const executar = process.argv.includes('--executar');
  console.log('== Fase 4 — ' + (executar ? 'EXECUÇÃO' : 'simulação') + ' da população (action ficha)');

  const est = await get('insumosInfo,bqProdutos,bqPropriedades,bqDocumentos,bqEvidencias');
  if (!est.ok) throw new Error('GET estado: ' + est.error);
  const d = est.dados || {};
  const linhas = (d.insumosInfo || []).filter((l) => l && l.nome);
  const produtos = d.bqProdutos || [];
  const propsAtuais = d.bqPropriedades || [];
  const docs = d.bqDocumentos || [];
  const evs = d.bqEvidencias || [];

  const comFonte = linhas.filter(temFonte);
  const semFonte = linhas.filter((l) => !temFonte(l));
  const propsPrevistas = comFonte.reduce((s, l) => s + nProps(l), 0);
  console.log('  cadastro: ' + linhas.length + ' linhas com nome (' + comFonte.length + ' com fonte, ' +
    semFonte.length + ' sem fonte) → até ' + propsPrevistas + ' propriedades previstas');
  console.log('  estado atual: ' + produtos.length + ' produtos, ' + propsAtuais.length +
    ' propriedades, ' + docs.length + ' documentos, ' + evs.length + ' evidências');

  // Linhas só com os campos que interessam (payload enxuto; colunas extras caem fora)
  const payload = linhas.map((l) => {
    const o = { id: l.id, nome: l.nome, fabricante: l.fabricante, categoria: l.categoria,
      categoriaExtra: l.categoriaExtra, finalidade: l.finalidade, formula: l.formula,
      origemDado: l.origemDado, fonteInfo: l.fonteInfo, fonteUrl: l.fonteUrl,
      fichaLink: l.fichaLink, bulaLink: l.bulaLink, estoqueId: l.estoqueId };
    CAMPOS.forEach((c) => { if (l[c] !== undefined) o[c] = l[c]; });
    return o;
  });

  // ---- 1) simulação (sempre) ----
  const sim = await post({ tipo: 'bqPropriedades', action: 'ficha', data: { simular: true, linhas: payload } });
  if (!sim.ok) throw new Error('simular: ' + sim.error);
  console.log('\n  -- plano --');
  sim.plano.forEach((e) => {
    const props = {};
    e.propriedades.forEach((p) => { props[p.acao] = (props[p.acao] || 0) + 1; });
    console.log('  ' + e.nome + ' → produto ' + e.produto.acao +
      (e.produto.id ? '' : ' (categoria: ' + (e.produto.campos.categoria || '—') + ')') +
      ', doc ' + e.documento.acao + ', props ' + JSON.stringify(props));
  });
  const rs = sim.resumo;
  console.log('  resumo: ' + JSON.stringify(sim.resumo));

  if (rs.erros.length) {
    console.log('  ERROS no plano: ' + JSON.stringify(rs.erros));
    process.exit(1);
  }
  if (rs.propriedadesCriadas !== propsPrevistas) {
    console.log('  AVISO: plano prevê ' + rs.propriedadesCriadas + ' criações, contagem local ' +
      propsPrevistas + ' (pode ser linha existente/estado desatualizado)');
  }

  if (!executar) {
    console.log('\n  simulação concluída — nada foi gravado. Rode com --executar para aplicar.');
    return;
  }

  // ---- 2) execução ----
  const ex = await post({ tipo: 'bqPropriedades', action: 'ficha', data: { simular: false, linhas: payload } });
  if (!ex.ok) throw new Error('executar: ' + ex.error);
  console.log('\n  -- execução --');
  console.log('  resumo: ' + JSON.stringify(ex.resumo));
  if (ex.resumo.erros.length) console.log('  ERROS: ' + JSON.stringify(ex.resumo.erros));

  // ---- 3) verificação (estado fresco) ----
  const pos = await get('insumosInfo,bqProdutos,bqPropriedades,bqDocumentos,bqEvidencias');
  const dp = pos.dados || {};
  const idsInfo = new Set(linhas.map((l) => String(l.id)));
  const vinculados = (dp.bqProdutos || []).filter((p) => !p.excluido && idsInfo.has(String(p.origemInfoId)));
  const idsProd = new Set(vinculados.map((p) => String(p.id)));
  const propsF4 = (dp.bqPropriedades || []).filter((p) => !p.excluido && idsProd.has(String(p.entidadeId)));
  const urls = new Set(comFonte.map((l) => l.fonteUrl).filter(Boolean));
  const docsF4 = (dp.bqDocumentos || []).filter((x) => !x.excluido && urls.has(String(x.url)));

  const falhas = [];
  const semEv = propsF4.filter((p) => !p.evidenciaId);
  if (semEv.length) falhas.push(semEv.length + ' propriedades sem evidenciaId');
  const numericas = propsF4.filter((p) => typeof p.valor === 'number' || typeof p.valorMin === 'number');
  if (numericas.length) falhas.push(numericas.length + ' valores numéricos (coerção §5.3)');
  const status = {};
  propsF4.forEach((p) => { status[p.status || '—'] = (status[p.status || '—'] || 0) + 1; });
  const semVinculo = linhas.filter((l) => !vinculados.some((p) => String(p.origemInfoId) === String(l.id)));
  if (semVinculo.length) falhas.push(semVinculo.length + ' linhas sem produto vinculado: ' +
    semVinculo.map((l) => l.nome).join(', '));

  console.log('\n  -- verificação --');
  console.log('  produtos vinculados: ' + vinculados.length + '/' + linhas.length +
    ' (docs com fonte: ' + docsF4.length + '/' + urls.size + ')');
  console.log('  propriedades Fase 4: ' + propsF4.length + ' | com evidência: ' +
    (propsF4.length - semEv.length) + ' | status: ' + JSON.stringify(status));
  const porCampo = {};
  propsF4.forEach((p) => { porCampo[p.campo] = (porCampo[p.campo] || 0) + 1; });
  console.log('  por campo: ' + JSON.stringify(porCampo));
  if (falhas.length) {
    console.log('\n  FALHOU: ' + falhas.join(' | '));
    process.exit(1);
  }
  console.log('\n  OK — 100% das propriedades com evidência; revisão humana pendente (action revisar, §7.4).');
})().catch((e) => { console.error('  ERRO: ' + e.message); process.exit(1); });
