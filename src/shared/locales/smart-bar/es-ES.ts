import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarEsES: SmartBarLocaleMessages = {
  barLabel: "Barra inteligente",
  actions: {
    ask: "Preguntar",
    explain: "Explicar",
    translate: "Traducir",
    summarize: "Resumir",
    copy: "Copiar",
    improve: "Mejorar redacción",
    fixGrammar: "Corregir ortografía y gramática",
  },
  copied: "Copiado",
  closeMenu: "Opciones de la barra inteligente",
  hideOnSite: "Ocultar en {site}",
  turnOff: "Desactivar la barra inteligente",
  close: "Cerrar",
  stop: "Detener",
  retry: "Reintentar",
  replace: "Reemplazar",
  insertBelow: "Insertar debajo",
  continueInSidePanel: "Continuar en el panel lateral",
  writing: "Escribiendo…",
  emptyResult: "El modelo no devolvió texto.",
  selectionChanged:
    "El texto seleccionado ha cambiado. Copia el resultado en su lugar.",
  selectionTooLong:
    "La selección es demasiado larga (más de {max} caracteres). Continúa en el panel lateral.",
  settingsTitle: "Barra inteligente",
  settingsDescription:
    "Una pequeña barra junto al texto seleccionado con acciones rápidas de IA. No se envía nada hasta que eliges una acción.",
  enable: "Mostrar la barra inteligente",
  enableDescription:
    "Desactivada de forma predeterminada. Al activarla, OpenBrowserAgent responde a la selección de texto en las páginas permitidas.",
  trigger: "Cuándo mostrarla",
  triggerDescription:
    "El atajo de teclado funciona en ambos modos. Configúralo en los atajos de extensiones del navegador.",
  triggerSelection: "Al seleccionar texto",
  triggerShortcut: "Solo con el atajo",
  sites: "Sitios",
  sitesDescription:
    "Se conservan ambas listas; el modo decide cuál se aplica. Un sitio incluye sus subdominios.",
  siteModeBlockList: "En todas partes excepto en los sitios bloqueados",
  siteModeAllowList: "Solo en los sitios permitidos",
  blockedSites: "Sitios bloqueados",
  allowedSites: "Sitios permitidos",
  sitePlaceholder: "example.com",
  addSite: "Añadir sitio",
  removeSite: "Quitar {host}",
  invalidSite: "Introduce un sitio como example.com.",
  noSites: "Aún no hay sitios.",
  pageActions: "Acciones para el texto de la página",
  pageActionsDescription: "Se muestran al seleccionar texto en una página.",
  editActions: "Acciones para el texto que editas",
  editActionsDescription:
    "Se muestran al seleccionar texto en un campo. El resultado puede reemplazar la selección.",
  model: "Modelo de la barra inteligente",
  modelDescription:
    "Modelo para Explicar, Traducir, Resumir y las acciones de escritura.",
  modelSameAsAgent: "Igual que el modelo del agente",
};
