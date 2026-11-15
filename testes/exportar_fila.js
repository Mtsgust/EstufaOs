/* Exporta a fila Q_Propriedades + os produtos vinculados para JSON (revisão humana §7.4).
   Uso: node exportar_fila.js [caminhoSaida]   (padrão: export_fila_q_propriedades.json) */
const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const SAIDA = process.argv[2] || 'export_fila_q_propriedades.json';

(async () => {
  const r = await fetch(API + '?tipos=bqProdutos,bqPropriedades,bqEvidencias,bqDocumentos', { redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) { console.error('FALHA API', JSON.stringify(j)); process.exit(1); }
  const d = j.dados;
  const prods = d.bqProdutos.filter((x) => !x.excluido);
  const props = d.bqPropriedades.filter((x) => !x.excluido && x.entidadeTipo === 'produto');
  const evs = d.bqEvidencias.filter((x) => !x.excluido);
  const docs = d.bqDocumentos.filter((x) => !x.excluido);
  const byId = (arr) => { const m = {}; arr.forEach((x) => { m[String(x.id)] = x; }); return m; };
  const prodById = byId(prods), evById = byId(evs), docById = byId(docs);

  const cmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR');
  const fila = props.map((p) => {
    const prod = prodById[String(p.entidadeId)] || {};
    const ev = evById[String(p.evidenciaId)] || {};
    let doc = ev.documentoId ? docById[String(ev.documentoId)] : null;
    if (!doc && ev.documentoUrl) doc = docs.find((x) => String(x.url) === String(ev.documentoUrl)) || null;
    return {
      propriedadeId: p.id,
      produtoId: p.entidadeId,
      nomeComercial: prod.nomeComercial || '(produto não encontrado)',
      fabricante: prod.fabricante || '',
      propriedade: p.campo,
      statusRevisao: p.status || 'pendente',
      valor: {
        valor: p.valor || '',
        valorMin: p.valorMin || '',
        valorMax: p.valorMax || '',
        unidade: p.unidade || '',
        condicao: p.condicao || ''
      },
      urlFonte: ev.documentoUrl || (doc ? doc.url : ''),
      trechoEvidencia: ev.trechoOriginal || '',
      documento: doc ? {
        id: doc.id, titulo: doc.titulo, tipo: doc.tipo,
        url: doc.url, status: doc.status || ''
      } : null,
      evidencia: {
        id: ev.id || '',
        fonteTipo: ev.fonteTipo || '',
        fonteNome: ev.fonteNome || '',
        pagina: ev.pagina || '',
        confiabilidade: ev.confiabilidade || '',
        status: ev.status || '',
        revisadoPor: ev.revisadoPor || '',
        revisadoEm: ev.revisadoEm || ''
      },
      obsPropriedade: p.obs || '',
      dataColeta: p.dataColeta || ''
    };
  }).sort((a, b) => cmp(a.nomeComercial, b.nomeComercial) || cmp(a.propriedade, b.propriedade));

  const produtos = prods.map((p) => {
    const minhas = props.filter((x) => String(x.entidadeId) === String(p.id));
    return {
      id: p.id,
      nomeComercial: p.nomeComercial,
      fabricante: p.fabricante || '',
      categoria: p.categoria || '',
      statusValidacao: p.statusValidacao || '',
      origemInfoId: p.origemInfoId || '',
      temPropriedade: minhas.length > 0,
      propriedades: minhas.map((x) => x.campo).sort(cmp)
    };
  }).sort((a, b) => cmp(a.nomeComercial, b.nomeComercial));

  const conta = (arr, chave) => arr.reduce((m, x) => { const k = x[chave] || '(vazio)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const comProp = produtos.filter((p) => p.temPropriedade).length;
  const saida = {
    geradoEm: new Date().toISOString(),
    fonte: 'EstufaOS — Base Química v1.0 (API bq*, deploy @50)',
    resumo: {
      produtos: produtos.length,
      produtosComPropriedade: comProp,
      produtosSemPropriedade: produtos.length - comProp,
      propriedades: fila.length,
      propriedadesPorStatus: conta(fila, 'statusRevisao'),
      propriedadesPorCampo: conta(fila, 'propriedade'),
      comDocumento: fila.filter((x) => x.documento).length,
      comTrecho: fila.filter((x) => x.trechoEvidencia).length,
      comUrlFonte: fila.filter((x) => x.urlFonte).length,
      documentosAtivos: docs.length
    },
    fila,
    produtos
  };
  require('fs').writeFileSync(SAIDA, JSON.stringify(saida, null, 2), 'utf8');
  console.log('OK → ' + SAIDA);
  console.log(JSON.stringify(saida.resumo, null, 2));
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
