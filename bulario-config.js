/* Compat: o Bulário carregava este arquivo. A URL oficial agora fica em config.js.
   Mantido só para não quebrar quem já publicou. Não edite aqui — edite config.js. */
try {
  if (typeof API_URL === "undefined") {
    var API_URL = "https://script.google.com/macros/s/AKfycbyuCWTKj_datn4uplxF_pjTiFPN8PqySzi8Y3GLd-3qEzS9Rfg6Qoq68WAmcSbdov0t/exec";
  }
} catch (e) {}
