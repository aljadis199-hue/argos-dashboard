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
  FLOW_URL: 'REEMPLAZAR-CON-URL-DEL-FLOW',

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
