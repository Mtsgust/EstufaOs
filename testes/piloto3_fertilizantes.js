/* Lote piloto ③ (§16) — fertilizantes foliares/bioestimulantes mapeados no
   InsumosInfo: Amino Power, Amino Classic, Nutrilife B+, Soil K, Soil Ca,
   Nitrato de cálcio, Potent Active, Booster Pro, Plant Reviv, Biovita Life,
   Fosfito de potássio (PHOSFIK PK).

   A busca por nome escolhe match exato de marca_comercial ou o primeiro
   resultado (aproximado) — a SONDAGEM vem primeiro: confirme o registro/
   titular achado (e ⚠ de nome divergente) antes de executar. Ajustes de
   identidade ficam em `numeroRegistro` na entrada (mesmo mecanismo do
   piloto ② com Lanate→Bazuka / Abamectina→Abamex).

   Uso:
     node testes/piloto3_fertilizantes.js            → sondagem (só SIMULA)
     node testes/piloto3_fertilizantes.js --executar  → simula e executa

   Rede: sim (API publiceda da Base Química).

   RESULTADO (sondagem 2026-11-15): lote SEM COBERTURA no AGROFIT — 10/11
   retornaram só falsos positivos (primeiro resultado aproximado de outras
   classes), 1 nada; buscas por marca/titular = 0 (Nutrilife, Biolchim,
   Yara, Biovita, Potent, Soil, Reviv, Booster…). Motivo oficial: a spec
   da API define AGROFIT como defensivos/fitossanitários e
   GET /classes-categorias-agronomicas não tem Fertilizante/Adjuvante.
   Decisão do usuário: fase AGROFIT encerrada com os lotes ①–② (24
   validados); ③–⑤ vão para a Fase 4 (fichas/fabricantes, §4.2 da
   spec). Script mantido como evidência — não executar --executar. */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const PRODUTOS = [
  { nome: 'Amino Power' }, { nome: 'Amino Classic' }, { nome: 'Nutrilife B+' },
  { nome: 'Soil K' }, { nome: 'Soil Ca' }, { nome: 'Nitrato de cálcio' },
  { nome: 'Potent Active' }, { nome: 'Booster Pro' }, { nome: 'Plant Reviv' },
  { nome: 'Biovita Life' }, { nome: 'Fosfito de potássio' }
];
const EXECUTAR = process.argv.indexOf('--executar') > -1;

async function post(payload) {
  const resp = await fetch(API, {
    method: 'POST', redirect: 'follow',
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
  console.log('Lote piloto ③ — ' + PRODUTOS.length + ' fertilizantes/bioestimulantes (' +
    (EXECUTAR ? 'SIMULAR + EXECUTAR' : 'sondagem: só SIMULAR') + ')\n');

  const resultados = [];
  let falhas = 0;

  for (const item of PRODUTOS) {
    const nome = item.nome;
    const busca = item.numeroRegistro ? { numeroRegistro: item.numeroRegistro } : { nome: nome };
    const sim = await post({
      tipo: 'bqPesquisas', action: 'agrofit', data: busca
    });
    if (!sim.ok) {
      falhas++;
      console.log('✗ ' + nome.padEnd(20) + ' → ' + sim.error);
      resultados.push({ nome, ok: false, erro: sim.error });
      continue;
    }
    const p = sim.plano.produto;
    const achado = sim.plano.produto.campos.nomeComercial;
    const tit = sim.plano.produto.campos.titularRegistro;
    const cat = sim.plano.produto.campos.categoria;
    const difere = String(achado).toLowerCase() !== nome.toLowerCase();
    console.log(
      (p.acao === 'criar' ? '→ ' : '· ') + nome.padEnd(20) +
      ' ⇒ ' + String(achado) + ' [reg ' + sim.plano.registro + ']' +
      (difere ? (item.numeroRegistro ? '  (busca por registro, nome é do AGROFIT)' : '  ⚠ nome do AGROFIT difere do pedido') : '') +
      '\n    titular: ' + tit + ' | categoria: ' + cat +
      ' | plano: ' + p.acao +
      ' | ing ' + sim.plano.ingredientes.length +
      ' | docs criar ' + sim.plano.documentos.filter((d) => d.acao === 'criar').length +
      ' | culturas ' + sim.plano.culturas.length +
      (sim.plano.faltantes.length ? ' | FALTANDO: ' + sim.plano.faltantes.join(',') : ''));

    if (p.acao === 'impossivel' || p.acao === 'ignorado_excluido') {
      resultados.push({ nome, ok: true, acao: p.acao, aviso: 'pulado' });
      continue;
    }
    if (!EXECUTAR) {
      resultados.push({ nome, ok: true, acao: p.acao, registro: sim.plano.registro, achado });
      continue;
    }
    const exe = await post({
      tipo: 'bqPesquisas', action: 'agrofit',
      data: Object.assign({}, busca, { simular: false })
    });
    if (!exe.ok) {
      falhas++;
      console.log('  FALHOU executar: ' + exe.error + (exe.etapa ? ' (' + exe.etapa + ')' : ''));
      resultados.push({ nome, fase: 'executar', ok: false, erro: exe.error });
      continue;
    }
    console.log('  executado: produto ' + exe.produtoId +
      (exe.reusado ? ' (fila reusada)' : '') + ' | fila ' + exe.filaId + ' → ' + exe.resumo);
    resultados.push({ nome, ok: true, fase: 'executar', produtoId: exe.produtoId,
      registro: sim.plano.registro, achado, resumo: exe.resumo });
  }

  const prods = (await get('tipo=bqProdutos')).data.filter((x) => !x.excluido);
  console.log('\nConferência Q_Produtos (ativos): ' + prods.length);
  resultados.filter((r) => r.ok && r.acao !== 'impossivel' && r.acao !== 'ignorado_excluido')
    .forEach((r) => {
      const linha = prods.find((x) => String(x.registroMAPA) === String(r.registro)) ||
        prods.find((x) => x.nomeComercial === r.achado);
      console.log('  ' + r.nome + ' → ' + (linha ? linha.nomeComercial + ' [' + linha.registroMAPA + '] ' + linha.statusValidacao : 'NÃO ENCONTRADO'));
    });

  console.log('\n' + (EXECUTAR ? 'Execução' : 'Sondagem') + ': ' +
    resultados.filter((r) => r.ok).length + '/' + resultados.length + ' ok' +
    (falhas ? ', ' + falhas + ' falha(s)' : ''));
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
