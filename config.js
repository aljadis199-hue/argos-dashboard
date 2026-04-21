/**
 * ARGOS Operations Dashboard — Configuración
 * ===========================================
 * Solo necesitas UNA cosa: la URL del Flow de Power Automate.
 *
 * Cómo obtenerla:
 *   1. Ir a make.powerautomate.com
 *   2. Abrir el flow: "ARGOS Get Operations Data"
 *   3. Hacer clic en el trigger "When an HTTP request is received"
 *   4. Copiar la "HTTP POST URL"
 *   5. Pegar abajo reemplazando REEMPLAZAR-CON-URL-DEL-FLOW
 */

const ARGOS_CONFIG = {

  // ── LO ÚNICO QUE DEBES EDITAR ────────────────────────────────────────────
  FLOW_URL: 'https://defaultfaa44fd9dabe4064a6bb59608ea9d0.f3.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/45be830588fc49afb85785dd9fb0c5c9/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=V0Rh2pg58NftxX-P48dLDr8T3zRTkM7LrJ-nN1tAZQ0',

  // ── PARÁMETROS OPERACIONALES (no tocar) ──────────────────────────────────
  REFRESH_MINUTES: 30,
  CRITICAL_DAYS:   7,
  WARNING_DAYS:    15,
  FROM_YEAR:       2024,

  // ── TERMINALES ────────────────────────────────────────────────────────────
  ISLANDS: {
    ANU:  { name: 'Antigua & Barbuda', prefix: 'ANU Operations Control Sheet' },
    DOM:  { name: 'Dominica',          prefix: 'DOM Operations Control Sheet' },
    SXM:  { name: 'Saint Maarten',     prefix: 'SXM Operations Control Sheet' },
    USVI: { name: 'Saint Thomas',      prefix: 'USVI Operations Control Sheet' }
  },

  SHAREPOINT_SITE: 'https://argoscorp.sharepoint.com/sites/VP_RCCA_PANT',
  SP_FOLDER_PATH:  '/Administration/Financial Daily Operations',

  get isConfigured() {
    return this.FLOW_URL && !this.FLOW_URL.includes('REEMPLAZAR');
  }
};
