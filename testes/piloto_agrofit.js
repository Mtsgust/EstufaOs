/* Lote piloto ① (§16) — importação real dos 6 fungicidas do piloto (P2):
   Elatus, Score, Amistar Top, Cabrio Top, Bravonil 720, Infinito.

   Pré-requisitos (uma vez):
     1. Token AGROAPI renovado no portal AgroAPI (APPLICATIONS → Show Keys)
     2. Gravar no Script Properties (NUNCA via payload HTTP):
        - no editor do Apps Script: bqConfigurarAgrofitToken('<token>')
        - ou, com Execution API habilitada: clasp run bqConfigurarAgrofitToken --params '[\"<token>\"]'

   Uso:
     node testes/piloto_agrofit.js            → só SIMULA (nada é gravado)
     node testes/piloto_agrofit.js --executar  → simula e executa a importação real

   Rede: sim (API publicada da Base Química). */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const PRODUTOS = ['Elatus', 'Score', 'Amistar Top', 'Cabrio Top', 'Bravonil 720', 'Infinito'];
const EXECUTAR = process.argv.indexOf('--executar') > -1;

async function post(payload) {
  const resp = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em POST ' + payload.action);
  return resp.json();
}
async function get(params) {
  const resp = await fetch(API + '?' + params, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em GET ' + params);
  return resp.json();
}

(async () => {
  console.log('Lote piloto ① — ' + PRODUTOS.length + ' fungicidas (' +
    (EXECUTAR ? 'SIMULAR + EXECUTAR' : 'somente SIMULAR') + ')\n');

  // Pré-voo: token presente? (processar devolve o aviso sem alterar a fila)
  const fila = await post({
    tipo: 'bqPesquisas', action: 'add',
    data: { entidadeTipo: 'produto', entidadeId: 'QPROD_piloto_preflight',
      consulta: '000000', fonteAlvo: 'agrofit', obs: 'preflight do lote piloto' }
  });
  if (!fila.ok) throw new Error('não criou item de pré-voo: ' + fila.error);
  const proc = await post({ tipo: 'bqPesquisas', action: 'processar', data: { limite: 1 } });
  const aviso = proc.error || proc.aviso || '';
  if (aviso === 'agrofit_token_ausente' || aviso === 'agrofit_token_invalido') {
    await post({ tipo: 'bqPesquisas', action: 'delete', id: fila.id });
    console.error('BLOQUEADO: ' + aviso + ' — renove o token e rode de novo.');
    console.error('  Editor do Apps Script → bqConfigurarAgrofitToken(\'<token>\')');
    process.exit(2);
  }
  // pré-voo ok (ou já havia itens) — limpa o item criado só para o teste
  await post({ tipo: 'bqPesquisas', action: 'delete', id: fila.id });

  const resultados = [];
  let falhas = 0;

  for (const nome of PRODUTOS) {
    console.log('--- ' + nome);
    const sim = await post({
      tipo: 'bqPesquisas', action: 'agrofit', data: { nome: nome }
    });
    if (!sim.ok) {
      falhas++;
      console.log('  FALHOU simular: ' + sim.error + (sim.campo ? ' (' + sim.campo + ')' : ''));
      resultados.push({ nome, fase: 'simular', ok: false, erro: sim.error });
      continue;
    }
    const p = sim.plano.produto;
    console.log('  plano: ' + p.acao +
      ' | registro ' + (sim.plano.registro || '?') +
      ' | ingredientes ' + sim.plano.ingredientes.length +
      ' | docs criar ' + sim.plano.documentos.filter((d) => d.acao === 'criar').length +
      ' | culturas ' + sim.plano.culturas.length +
      (sim.plano.faltantes.length ? ' | FALTANDO: ' + sim.plano.faltantes.join(',') : ''));
    if (p.acao === 'impossivel' || p.acao === 'ignorado_excluido') {
      resultados.push({ nome, fase: 'simular', ok: true, acao: p.acao, aviso: 'pulado' });
      continue;
    }
    if (!EXECUTAR) {
      resultados.push({ nome, fase: 'simular', ok: true, acao: p.acao });
      continue;
    }
    const exe = await post({
      tipo: 'bqPesquisas', action: 'agrofit', data: { nome: nome, simular: false }
    });
    if (!exe.ok) {
      falhas++;
      console.log('  FALHOU executar: ' + exe.error);
      resultados.push({ nome, fase: 'executar', ok: false, erro: exe.error });
      continue;
    }
    console.log('  executado: produto ' + exe.produtoId +
      (exe.reusado ? ' (fila reusada)' : '') +
      ' | fila ' + exe.filaId + ' → ' + exe.resumo);
    resultados.push({ nome, fase: 'executar', ok: true, produtoId: exe.produtoId, resumo: exe.resumo });
  }

  // Conferência da planilha (o que a importação de fato gravou)
  const prods = (await get('tipo=bqProdutos')).data.filter((x) => !x.excluido);
  console.log('\nConferência Q_Produtos (ativos): ' + prods.length);
  resultados.forEach((r) => {
    if (!r.produtoId) return;
    const linha = prods.find((x) => String(x.id) === String(r.produtoId));
    console.log('  ' + r.nome + ' → ' + (linha ? linha.nomeComercial + ' [' + linha.registroMAPA + ']' : 'NÃO ENCONTRADO'));
  });

  console.log('\n' + (EXECUTAR ? 'Execução' : 'Simulação') + ': ' +
    resultados.filter((r) => r.ok).length + '/' + resultados.length + ' ok' +
    (falhas ? ', ' + falhas + ' falha(s)' : ''));
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
