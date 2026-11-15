/* Lote piloto ② (§16) — inseticidas/acaricidas de tomate/pepino já mapeados
   nos cadastros existentes: Influx, Verdavis, Trigard, Abamectina, Actara,
   Ampligo, Oberon, Connect, Lanate, Minecto Pro, Pirate, Diador, Blade,
   Privilege, Dimexion, Delegate, Abamex maxx, Benevia.

   A busca por nome escolhe match exato de marca_comercial ou o primeiro
   resultado (aproximado) — por isso a SONDAGEM vem primeiro: confirme o
   registro/titular achado antes de executar. Duas entradas usam busca por
   NÚMERO DE REGISTRO (decisão do usuário em 2026-11-15):
     - 'Lanate'  → reg 3010  Bazuka 216 SL (metomil, Albaugh) — busca por
       nome pegaria Krypto/Kickstart (primeiro resultado, não exato)
     - 'Abamectina' → reg 3801 Abamex (abamectina 18 EC, Sumitomo)

   Uso:
     node testes/piloto2_inseticidas.js            → sondagem (só SIMULA)
     node testes/piloto2_inseticidas.js --executar  → simula e executa

   Rede: sim (API publicada da Base Química). */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const PRODUTOS = [
  { nome: 'Influx' }, { nome: 'Verdavis' }, { nome: 'Trigard' },
  { nome: 'Abamectina', numeroRegistro: '3801' },
  { nome: 'Actara' }, { nome: 'Ampligo' }, { nome: 'Oberon' }, { nome: 'Connect' },
  { nome: 'Lanate', numeroRegistro: '3010' },
  { nome: 'Minecto Pro' }, { nome: 'Pirate' }, { nome: 'Diador' }, { nome: 'Blade' },
  { nome: 'Privilege' }, { nome: 'Dimexion' }, { nome: 'Delegate' },
  { nome: 'Abamex maxx' }, { nome: 'Benevia' }
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
  console.log('Lote piloto ② — ' + PRODUTOS.length + ' inseticidas (' +
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
      console.log('✗ ' + nome.padEnd(14) + ' → ' + sim.error);
      resultados.push({ nome, ok: false, erro: sim.error });
      continue;
    }
    const p = sim.plano.produto;
    const achado = sim.plano.produto.campos.nomeComercial;
    const tit = sim.plano.produto.campos.titularRegistro;
    const difere = String(achado).toLowerCase() !== nome.toLowerCase();
    console.log(
      (p.acao === 'criar' ? '→ ' : '· ') + nome.padEnd(14) +
      ' ⇒ ' + String(achado) + ' [reg ' + sim.plano.registro + ']' +
      (difere ? (item.numeroRegistro ? '  (busca por registro, nome é do AGROFIT)' : '  ⚠ nome do AGROFIT difere do pedido') : '') +
      '\n    titular: ' + tit +
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
      const linha = prods.find((x) => x.nomeComercial === r.achado ||
        (r.registro && String(x.registroMAPA) === String(r.registro)));
      console.log('  ' + r.nome + ' → ' + (linha ? linha.nomeComercial + ' [' + linha.registroMAPA + '] ' + linha.statusValidacao : 'NÃO ENCONTRADO'));
    });

  console.log('\n' + (EXECUTAR ? 'Execução' : 'Sondagem') + ': ' +
    resultados.filter((r) => r.ok).length + '/' + resultados.length + ' ok' +
    (falhas ? ', ' + falhas + ' falha(s)' : ''));
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
