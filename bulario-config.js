/* Compat: o Bulário carregava este arquivo. A URL oficial agora fica em config.js.
   Mantido só para não quebrar quem já publicou. Não edite aqui — edite config.js. */
try {
  if (typeof API_URL === "undefined") {
    var API_URL = "https://script.google.com/macros/s/AKfycbyoAG7x4S3xdpUg4_ECL7qx4TpYYi13Q66ah-loeK7CDVNAW9air7nXg6V6GqVrqchKgA/exec";
  }
} catch (e) {}
