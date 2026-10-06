/* Compat: o Bulário carregava este arquivo. A URL oficial agora fica em config.js.
   Mantido só para não quebrar quem já publicou. Não edite aqui — edite config.js. */
try {
  if (typeof API_URL === "undefined") {
    var API_URL = "https://script.google.com/macros/s/AKfycbzp4jx7a0GWHpA8WHSCDrz0veY-_-XYmLtBrTpgkTuI85tsmiIaXlVIYFarcuWJtDFdWg/exec";
  }
} catch (e) {}
