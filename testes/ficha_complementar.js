/* Fase 4 complementar — importa via action ficha as propriedades obtidas da
   busca nas URLs já vinculadas (páginas/PDFs/FDS lidos em 2026-11-15).
   Uso: node ficha_complementar.js           → simular (§10.1)
        node ficha_complementar.js --executar → grava (depois verificação) */
const API = 'https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec';
const EXEC = process.argv.includes('--executar');

const LINHAS = [
  {
    nome: 'Aminon 25', fabricante: 'Technes', origemDado: 'fabricante',
    fonteUrl: 'https://technes.com.br/aminon-25',
    fonteInfo: 'Página do produto Aminon 25 – Technes',
    naturezaFisica: 'Fluído / Líquido'
  },
  {
    nome: 'Booster Pro', fabricante: 'Agrichem', origemDado: 'fabricante',
    fonteUrl: 'https://www.agrichem.com.br/sites/default/files/%5Bdate%3Acustom%3AY%5D-%5Bdate%3Acustom%3Am%5D/BOOSTER_PRO_0.pdf',
    fonteInfo: 'FDS Booster Pro (Agrichem) – Rev02 08/01/2025',
    ph: '5,0 - 6,0', solubilidade: 'Totalmente solúvel', naturezaFisica: 'Líquido, fluido em solução'
  },
  {
    nome: 'Thyper S-50', fabricante: 'Quimia', origemDado: 'fichatecnica',
    fonteUrl: 'https://drive.google.com/file/d/15dVV4gcoCm263Yv2PAv1o9x6tv8g2SW3',
    fonteInfo: 'Ficha Técnica Thyper S-50 AGRO – Quimia (Revisão JAN/22)',
    densidade: '1,196 g/cm³ (20ºC)', solubilidade: 'Completa', naturezaFisica: 'Líquido'
  }
];

async function post(body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  return r.json();
}
async function get(tipos) {
  const r = await fetch(API + '?tipos=' + tipos, { redirect: 'follow' });
  return (await r.json()).dados;
}

(async () => {
  console.log('== Fase 4 complementar — ' + (EXEC ? 'EXECUÇÃO' : 'simulação') + ' (action ficha) ==');
  const r = await post({
    tipo: 'bqPropriedades', action: 'ficha',
    data: { linhas: LINHAS, simular: !EXEC }
  });
  if (!r.ok) { console.error('FALHA', JSON.stringify(r)); process.exit(1); }
  console.log('resumo: ' + JSON.stringify(r.resumo));
  if (r.resumo.erros.length) { console.error('ERROS', JSON.stringify(r.resumo.erros)); process.exit(1); }
  if (!EXEC) {
    const esp = { propriedadesCriadas: 7, produtosExistentes: 3, erros: 0 };
    const okPlan = r.resumo.propriedadesCriadas === 7 && r.resumo.produtosExistentes === 3 &&
      r.resumo.erros.length === 0;
    console.log(okPlan ? 'OK — plano prevê 7 propriedades em 3 produtos existentes, 0 erros.'
      : 'FALHA — plano inesperado: ' + JSON.stringify(r.resumo));
    process.exit(okPlan ? 0 : 1);
  }

  // ---- verificação pós-execução ----
  const d = await get('bqProdutos,bqPropriedades,bqEvidencias,bqDocumentos');
  const prods = d.bqProdutos.filter(p => !p.excluido);
  const props = d.bqPropriedades.filter(p => !p.excluido);
  const alvos = ['Aminon 25', 'Booster Pro', 'Thyper S-50'];
  let falhas = 0;
  const chk = (cond, msg) => { console.log((cond ? '  ok  - ' : '  FALHA - ') + msg); if (!cond) falhas++; };
  const esperado = {
    'Aminon 25': { naturezaFisica: 1 },
    'Booster Pro': { ph: 1, solubilidade: 1, naturezaFisica: 1 },
    'Thyper S-50': { densidade: 1, solubilidade: 1, naturezaFisica: 1 }
  };
  let total = 0, comEv = 0, pend = 0;
  for (const nome of alvos) {
    const p = prods.find(x => x.nomeComercial === nome);
    chk(!!p, nome + ' existe');
    if (!p) continue;
    for (const [campo, n] of Object.entries(esperado[nome])) {
      const rows = props.filter(x => String(x.entidadeId) === String(p.id) && x.campo === campo);
      chk(rows.length === n, nome + '.' + campo + ' = ' + n + ' (achou ' + rows.length + ')');
      for (const row of rows) {
        total++;
        if (row.evidenciaId) comEv++;
        if (row.status === 'pendente') pend++;
        const ev = d.bqEvidencias.find(e => String(e.id) === String(row.evidenciaId));
        chk(!!ev && !ev.excluido && !!ev.documentoUrl, nome + '.' + campo + ' com evidência+URL');
      }
    }
  }
  // densidade do Thyper parseada (não crua)
  const th = prods.find(x => x.nomeComercial === 'Thyper S-50');
  if (th) {
    const den = props.find(x => String(x.entidadeId) === String(th.id) && x.campo === 'densidade');
    chk(den && den.valor === '1,196' && den.unidade === 'g/cm³' && den.condicao,
      'Thyper densidade parseada: valor 1,196 + g/cm³ + condição');
  }
  const bo = prods.find(x => x.nomeComercial === 'Booster Pro');
  if (bo) {
    const ph = props.find(x => String(x.entidadeId) === String(bo.id) && x.campo === 'ph');
    chk(ph && ph.valorMin === '5,0' && ph.valorMax === '6,0',
      'Booster ph parseado como intervalo 5,0–6,0 (hífen ASCII)');
  }
  chk(total === 7 && comEv === 7 && pend === 7,
    'total 7/7 propriedades com evidência e pendente (recebido ' + total + '/' + comEv + '/' + pend + ')');
  const docs = d.bqDocumentos.filter(x => !x.excluido);
  chk(docs.some(x => String(x.url).includes('BOOSTER_PRO_0')), 'FDS Booster Pro virou Q_Documentos');
  chk(docs.some(x => String(x.url).includes('15dVV4gcoCm263Yv2PAv1o9x6tv8g2SW3')), 'ficha Thyper virou Q_Documentos');
  console.log(falhas === 0 ? '\nOK — verificação completa passou.' : '\nFALHA — ' + falhas + ' verificações.');
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO', e); process.exit(1); });
