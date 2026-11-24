// Harness de testes do módulo Hábitos.
// Extrai o <script> do index.html, roda a app + suíte num contexto VM
// com mocks de DOM/LocalStorage/timers — sem rede, sem browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){
  console.error('ERRO: bloco <script> nao encontrado em index.html');
  process.exit(1);
}
const appCode = m[1];
const suiteCode = fs.readFileSync(path.join(__dirname, 'suite.js'), 'utf8');

const store = Object.create(null);

function makeEl(id){
  return {
    id: id || '',
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){},
    appendChild(){}, remove(){}, focus(){}, blur(){},
    setSelectionRange(){}, scrollTo(){}, scrollIntoView(){}, click(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getAttribute(){ return null; }, setAttribute(){},
    files: []
  };
}

const els = Object.create(null);
const document = {
  getElementById(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; },
  querySelector(){ return makeEl('q'); },
  querySelectorAll(){ return []; },
  createElement(){ return makeEl('novo'); },
  body: makeEl('body'),
  addEventListener(){},
  removeEventListener(){}
};

const sandbox = {
  console,
  Math, Date, JSON, Number, String, Boolean, Array, Object,
  parseInt, parseFloat, isNaN, isFinite,
  Error, TypeError, RegExp, Promise, Set, Map, Symbol,
  localStorage: {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
    clear(){ Object.keys(store).forEach(k => delete store[k]); },
    key(i){ return Object.keys(store)[i]; },
    get length(){ return Object.keys(store).length; }
  },
  document,
  window: { addEventListener(){}, removeEventListener(){}, scrollTo(){} },
  navigator: {},
  location: { reload(){}, href: '' },
  requestAnimationFrame(fn){ fn(); return 1; },
  cancelAnimationFrame(){},
  setTimeout(){ return 0; },
  clearTimeout(){},
  setInterval(){ return 0; },
  clearInterval(){},
  alert(){},
  confirm(){ return true; },
  prompt(){ return '2,5'; },
  fetch(){ return Promise.reject(new Error('sem rede nos testes')); },
  AbortController: class { constructor(){ this.signal = {}; } abort(){} },
  URL: { createObjectURL(){ return 'blob:teste'; }, revokeObjectURL(){} },
  Blob: class {},
  FileReader: class { readAsText(){} }
};

vm.createContext(sandbox);

try{
  vm.runInContext(appCode + '\n;\n' + suiteCode, sandbox, { filename: 'habitos-app+suite.js' });
  process.exit(0);
}catch(e){
  console.error('\nERRO NA SUITE:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
