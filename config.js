/* Configuração central do Painel Estufas.
   1. Cole abaixo a URL do Apps Script (Implantar > Aplicativo da Web > URL /exec).
   2. Não apague os ajudantes: eles dão timeout, retry e cache (evitam travar em "Carregando").
   Mantém o mesmo padrão das páginas: todas usam API_URL + fetchComTimeout + cache local. */

var API_URL = "https://script.google.com/macros/s/AKfycbyuCWTKj_datn4uplxF_pjTiFPN8PqySzi8Y3GLd-3qEzS9Rfg6Qoq68WAmcSbdov0t/exec";
var FETCH_TIMEOUT_MS = 20000;
var CACHE_PREFIXO = "estufas_v1_";

function fetchComTimeout(url, opts, ms) {
  var tempo = ms || FETCH_TIMEOUT_MS;
  var ctrl = null;
  try { ctrl = new AbortController(); } catch (e) { return fetch(url, opts); }
  var id = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, tempo);
  var p = fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  return p.then(function (r) { clearTimeout(id); return r; }, function (e) { clearTimeout(id); throw e; });
}

function cacheLerTipo(tipo) {
  try {
    var raw = localStorage.getItem(CACHE_PREFIXO + tipo);
    if (!raw) return null;
    var o = JSON.parse(raw);
    return o && o.dados ? o.dados : null;
  } catch (e) { return null; }
}

function cacheSalvarTipo(tipo, dados) {
  try {
    localStorage.setItem(CACHE_PREFIXO + tipo, JSON.stringify({ quando: Date.now(), dados: dados || [] }));
  } catch (e) { /* celular sem espaço: ignora */ }
}

/* Busca 1 aba com timeout + 1 retry. Se a rede falhar, devolve o cache (p/ não travar). */
async function buscarTipo(tipo) {
  var ultimoErro = null;
  for (var t = 0; t < 2; t++) {
    try {
      var r = await fetchComTimeout(API_URL + "?tipo=" + encodeURIComponent(tipo));
      var j = await r.json();
      var arr = (j && j.data) || [];
      cacheSalvarTipo(tipo, arr);
      return arr;
    } catch (e) { ultimoErro = e; }
  }
  var c = cacheLerTipo(tipo);
  if (c) return c;
  throw ultimoErro || new Error("falha de rede");
}

/* Busca N abas em 1 chamada (?tipos=a,b,c). Cai para chamadas individuais se o servidor for antigo. */
async function buscarLote(tipos) {
  try {
    var r = await fetchComTimeout(API_URL + "?tipos=" + tipos.map(encodeURIComponent).join(","));
    var j = await r.json();
    if (j && j.dados) {
      Object.keys(j.dados).forEach(function (k) { cacheSalvarTipo(k, j.dados[k] || []); });
      return j.dados;
    }
  } catch (e) { /* cai pro plano B abaixo */ }
  var out = {};
  var partes = await Promise.all(tipos.map(function (t) {
    return buscarTipo(t).then(function (d) { out[t] = d; }).catch(function () { out[t] = cacheLerTipo(t) || []; });
  }));
  return out;
}

/* POST com timeout + retry (usar no lugar do fetch direto quando for salvar). */
async function postarSeguro(corpo) {
  var ultimoErro = null;
  for (var t = 0; t < 2; t++) {
    try {
      var r = await fetchComTimeout(API_URL, { method: "POST", body: JSON.stringify(corpo) });
      return await r.json();
    } catch (e) { ultimoErro = e; }
  }
  throw ultimoErro || new Error("falha de rede");
}
