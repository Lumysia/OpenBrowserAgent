import type { SettingsMessages } from "./en-US";

export const settingsEsES: SettingsMessages = {
  providersModels: "Proveedores de IA y modelos",
  agentsSkills: "Agentes y habilidades",
  onPages: "En las páginas",
  advanced: "Avanzado",
  translate: "Traducir",
  rightClick: "Menú contextual",
  troubleshooting: "Solución de problemas",
  shortcuts: "Atajos de teclado",
  shortcutsDescription:
    "Atajos de los comandos de OpenBrowserAgent. Los gestiona el navegador; cámbialos en su configuración de atajos.",
  shortcutNone: "Sin definir",
  changeShortcuts: "Cambiar atajos",
  shortcutsFirefoxHint:
    'Para cambiarlos, abre about:addons, haz clic en el botón del engranaje y elige "Gestionar atajos de extensiones".',
  openMenuCommand: "Abrir el menú",
  openSidePanelCommand: "Abrir el panel lateral",
  smartBarCommand: "Mostrar la barra inteligente para el texto seleccionado",
  translatePageCommand: "Traducir esta página o mostrar el original",
  sidePanelShortcutHint:
    "Elige una tecla en la configuración de atajos del navegador, por ejemplo {keys}.",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "Atajo: {shortcut}",
    none: "No hay ningún atajo asignado",
    change: "Cambiar atajo",
  },
  chatBehavior: "Comportamiento del chat",
  chatBehaviorDescription:
    "Desplazamiento, reintentos, pasos de herramientas y detalles festivos en el panel lateral.",
  models: "Modelos",
  modelsDescription:
    "El modelo que usa cada función. Todas usan el modelo del chat salvo que elijas otro.",
  modelChat: "Chat",
  modelHelper: "Auxiliar",
  modelSmartBar: "Barra inteligente",
  modelTranslation: "Traducción",
  modelTranslationUnavailable:
    "La traducción de páginas usa {engine}, no un modelo de IA. Cambia el motor de traducción en la configuración de Traducción de páginas.",
  modelImages: "Imágenes",
  translateMenuItems: "Entradas del menú contextual",
  translateMenuItemsDescription:
    "Las entradas de traducción del menú contextual. El menú se activa o desactiva en Menú contextual.",
};
