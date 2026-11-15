/* Conferência do lote piloto ① contra o AGROFIT — critério de aceite 1 (§15):
   compara o que foi importado (Q_Produtos/QPI/Q_Culturas/Q_Documentos) com o
   que a fonte oficial diz HOJE (plano ao vivo da action agrofit, simular).

   Também verifica o critério 2 (cada QPI com evidenciaId → evidência com
   documentoUrl) e os blocos de evidência por produto (identidade, composicao,
   autorizacao).

   Uso:
     node testes/conferencia_piloto1.js [Nome] [Nome2 …]  → relatório
        (sem nomes = lote piloto ①; nada grava)
     node testes/conferencia_piloto1.js … --aprovar       → só com relatório limpo:
        grava statusValidacao=validado + ultimaRevisao com autor humano (§8.3)

   Rede: sim. Sai com 0 = limpo, 3 = divergências, 1 = erro. */

'use strict';

const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const nomesArgs = process.argv.slice(2).filter((a) => a.indexOf('--') !== 0);
const PRODUTOS = nomesArgs.length ? nomesArgs
  : ['Elatus', 'Score', 'Amistar Top', 'Cabrio Top', 'Bravonil 720', 'Infinito'];
/* Ajustes de busca do piloto ② (2026-11-15): nomes que a busca por nome
   resolveria errado → número de registro (mesmos do piloto2_inseticidas.js). */
const REGISTROS = { 'Lanate': '3010', 'Abamectina': '3801' };
const APROVAR = process.argv.indexOf('--aprovar') > -1;

async function post(payload) {
  const resp = await fetch(API, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em POST ' + payload.action);
  return resp.json();
}
async function get(tipo) {
  const resp = await fetch(API + '?' + tipo, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em GET ' + tipo);
  return resp.json();
}
/* espelho do bqNormalizar_ do servidor (minúsculas + sem acento) */
const norm = (s) => String(s === undefined || s === null ? '' : s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

(async () => {
  console.log('Conferência piloto ① — ' + PRODUTOS.length + ' produtos vs AGROFIT ao vivo' +
    (APROVAR ? ' (MODO APROVAR)' : '') + '\n');

  const [prodR, piR, ingR, cultR, docR, evR] = await Promise.all(
    ['bqProdutos', 'bqProdIngredientes', 'bqIngredientes', 'bqCulturas', 'bqDocumentos', 'bqEvidencias']
      .map((t) => get('tipo=' + t)));
  const produtos = prodR.data.filter((x) => !x.excluido);
  const pis = piR.data.filter((x) => !x.excluido);
  const ings = ingR.data.filter((x) => !x.excluido);
  const cults = cultR.data.filter((x) => !x.excluido);
  const docs = docR.data.filter((x) => !x.excluido);
  const evs = evR.data.filter((x) => !x.excluido);
  const urlDocs = new Set(docs.map((d) => norm(d.url)));
  const ingPorId = new Map(ings.map((i) => [String(i.id), i]));
  const evPorId = new Map(evs.map((e) => [String(e.id), e]));

  let divergencias = 0;
  const linhas = [];
  const achados = new Map();
  const falhar = (msg) => { divergencias++; linhas.push('    ✗ ' + msg); };
  const ok = (msg) => linhas.push('    ✓ ' + msg);

  for (const nome of PRODUTOS) {
    linhas.push('--- ' + nome);

    // 1) identidade: plano ao vivo (busca + detalhe no AGROFIT) vs linha atual
    const busca = REGISTROS[nome] ? { numeroRegistro: REGISTROS[nome] } : { nome: nome };
    const sim = await post({ tipo: 'bqPesquisas', action: 'agrofit', data: busca });
    if (!sim.ok) { falhar('simular falhou: ' + sim.error); continue; }
    const plano = sim.plano;
    const prd = produtos.find((p) => String(p.registroMAPA) === String(plano.registro)) ||
      produtos.find((p) => p.nomeComercial === nome);
    if (!prd) { falhar('produto ausente da Q_Produtos (reg ' + plano.registro + ')'); continue; }
    achados.set(nome, prd);
    const id = String(prd.id);
    if (plano.produto.acao === 'identico') {
      ok('identidade idêntica ao AGROFIT (registro ' + plano.registro + ', status ' + prd.statusValidacao + ')');
    } else if (plano.produto.acao === 'atualizar') {
      const diffs = plano.produto.camposAtualizar || {};
      falhar('AGROFIT mudou desde a importação → campos: ' +
        Object.keys(diffs).map((k) => k + '=' + JSON.stringify(diffs[k])).join(', '));
    } else if (plano.produto.acao === 'divergente') {
      falhar('produto divergente vs AGROFIT (§10.3) — não pode ser validado assim');
    } else {
      falhar('ação inesperada do plano: ' + plano.produto.acao);
    }
    if (String(prd.registroMAPA) !== String(plano.registro)) {
      falhar('registroMAPA planilha (' + prd.registroMAPA + ') ≠ AGROFIT (' + plano.registro + ')');
    }

    // 2) ingredientes/relações QPI: conjunto planilha vs conjunto do plano
    //    (concentração/unidade/% moram em plano.relacoes, com ingredienteIdx)
    const minhas = pis.filter((r) => String(r.produtoId) === id);
    const chaveSheet = minhas.map((r) => {
      const ing = ingPorId.get(String(r.ingredienteId));
      return norm((ing ? ing.nome : '?') + '|' + (ing ? ing.grupoQuimico : '') + '|' +
        r.concentracao + '|' + r.unidade + '|' + r.percentual);
    }).sort().join('\n');
    const chavePlano = plano.relacoes.map((r) => {
      const i = plano.ingredientes[r.ingredienteIdx] || {};
      const cv = (r.concentracao === null || r.concentracao === undefined) ? '' : r.concentracao;
      const pv = (r.percentual === null || r.percentual === undefined) ? '' : r.percentual;
      return norm((i.nome || '?') + '|' + (i.grupoQuimico || '') + '|' + cv + '|' +
        (r.unidade || '') + '|' + pv);
    }).sort().join('\n');
    if (chaveSheet === chavePlano) ok('QPI: ' + minhas.length + ' relação(ões) conferem (atual, unidade, %)');
    else falhar('QPI divergente.\n      planilha: ' + JSON.stringify(chaveSheet.split('\n')) +
      '\n      AGROFIT:  ' + JSON.stringify(chavePlano.split('\n')));

    // critério 2: cada QPI com evidenciaId → evidência com URL de documento
    const semEv = minhas.filter((r) => !r.evidenciaId || !evPorId.has(String(r.evidenciaId)));
    const evSemUrl = minhas.filter((r) => {
      const e = evPorId.get(String(r.evidenciaId));
      return e && !norm(e.documentoUrl);
    });
    if (!semEv.length && !evSemUrl.length) ok('critério 2: ' + minhas.length + ' QPI com evidenciaId → evidência com documentoUrl');
    else {
      if (semEv.length) falhar('critério 2: ' + semEv.length + ' QPI sem evidenciaId válida');
      if (evSemUrl.length) falhar('critério 2: ' + evSemUrl.length + ' evidência(s) de QPI sem documentoUrl');
    }

    // 3) culturas: conjunto planilha vs conjunto do plano (dedup do payload)
    const cSheet = cults.filter((c) => String(c.produtoId) === id)
      .map((c) => [norm(c.cultura), norm(c.estadio), norm(c.doseReferencia)].join('|')).sort();
    const cVistas = new Set();
    const cPlano = [];
    plano.culturas.forEach((c) => {
      const k = [norm(c.cultura), norm(c.estadio), norm(c.doseReferencia)].join('|');
      if (!cVistas.has(k)) { cVistas.add(k); cPlano.push(k); }
    });
    cPlano.sort();
    if (cSheet.join('\n') === cPlano.join('\n')) ok('culturas: ' + cSheet.length + ' autorização(ões) conferem');
    else {
      const falta = cPlano.filter((k) => cSheet.indexOf(k) === -1);
      const sobra = cSheet.filter((k) => cPlano.indexOf(k) === -1);
      if (falta.length) falhar('culturas faltando na planilha: ' + falta.join(' ; '));
      if (sobra.length) falhar('culturas na planilha fora do AGROFIT: ' + sobra.join(' ; '));
    }

    // 4) documentos do plano presentes (URL global). Docs com tipo fora do
    //    enum §6.7 (ex.: 'Ofício') são pulados por design na importação —
    //    não entram na exigência de presença.
    const docsEsperados = plano.documentos.filter((d) => d.acao === 'criar' || d.motivo === 'url_existente');
    const docsForaEnum = plano.documentos.filter((d) => d.acao !== 'criar' && d.motivo !== 'url_existente');
    const docsFaltando = docsEsperados.filter((d) => !urlDocs.has(norm(d.url)));
    if (!docsFaltando.length) {
      ok('documentos: ' + docsEsperados.length + ' do AGROFIT presentes em Q_Documentos' +
        (docsForaEnum.length ? ' (' + docsForaEnum.length + ' com tipo fora do enum §6.7, pulados por design)' : ''));
    } else falhar('documentos ausentes: ' + docsFaltando.map((d) => d.titulo).join(' ; '));

    // 5) blocos de evidência da importação
    const blocos = new Set(evs.filter((e) => String(e.entidadeId) === id)
      .map((e) => e.campo));
    if (blocos.has('identidade') && blocos.has('composicao') && blocos.has('autorizacao')) {
      ok('evidências: blocos identidade/composicao/autorizacao presentes');
    } else falhar('evidências faltando blocos: tem ' + Array.from(blocos).join(',') +
      ' (esperado identidade, composicao, autorizacao)');

    // 6) status atual
    if (prd.statusValidacao === 'validado') ok('já validado em ' + (prd.ultimaRevisao || '?'));
    else linhas.push('    · status atual: ' + prd.statusValidacao + (APROVAR ? ' → será validado' : ''));
  }

  console.log(linhas.join('\n'));
  console.log('\nDivergências: ' + divergencias);

  if (divergencias) {
    console.log('RESULTADO: REPROVADO — corrigir antes de validar (§15.1).');
    process.exit(3);
  }
  if (!APROVAR) {
    console.log('RESULTADO: LIMPO — para aprovar, rode com --aprovar (revisão humana, §8.3).');
    process.exit(0);
  }

  // --- aprovação (nível E): só entra aqui com relatório limpo ---
  console.log('\nAprovando (autor humano, §8.3)…');
  const agora = new Date().toISOString();
  let falhas = 0;
  for (const nome of PRODUTOS) {
    const prd = achados.get(nome);
    const r = await post({
      tipo: 'bqProdutos', action: 'update', id: prd.id,
      data: { statusValidacao: 'validado', ultimaRevisao: agora },
      autor: 'usuario', origem: 'conferencia_piloto1',
      motivo: 'conferência vs AGROFIT aprovada (§15.1, critério 1)'
    });
    if (!r.ok) { falhas++; console.log('  ✗ ' + nome + ': ' + r.error); }
    else console.log('  ✓ ' + nome + ' → validado');
  }
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
