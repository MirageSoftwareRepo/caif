// Feature flags compartidos por cliente y servidor.

// Bot de WhatsApp (whatsapp-web.js + Chromium): desactivado temporalmente porque
// no se usa y el Chromium de Puppeteer consume demasiada RAM. Con `false` no se
// programan los crons de 20:45–21:20, los endpoints /api/whatsapp/* responden 503
// y la UI oculta la pestaña de admin y el toggle del médico. Para reactivarlo,
// cambiar a `true` y redeployar. No afecta "WhatsApp directo" (links wa.me).
export const WHATSAPP_BOT_ENABLED = false;
