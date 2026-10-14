import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuEsES: ContextMenuLocaleMessages = {
  items: {
    ask: "Preguntar o actuar sobre esta página",
    summarizePage: "Resumir esta página",
    searchPage: "Buscar en la web sobre esta página",
    searchSelection: "Buscar «%s» en la web",
    summarizeLink: "Resumir la página enlazada",
    copyMarkdown: "Copiar como Markdown",
  },
  searchSelectionRequest: "Buscar en la web sobre el texto seleccionado",
  copied: "Copiado como Markdown",
  copyFailed:
    "No se ha podido copiar al portapapeles. Haz clic en la página y vuelve a intentarlo.",
  copyUnavailable:
    "No se puede copiar esta página: el navegador no permite que las extensiones la lean.",
  settingsTitle: "Menú contextual",
  settingsDescription:
    "Acciones de OpenBrowserAgent en el menú que se abre al hacer clic derecho en una página.",
  enable: "Mostrar en el menú contextual",
  enableDescription:
    "Añade un submenú de OpenBrowserAgent al hacer clic derecho en una página, un enlace, una imagen o texto seleccionado.",
  itemsTitle: "Elementos del menú",
  itemsDescription:
    "Las acciones que abren el panel lateral pasan la página a tu agente. Copiar como Markdown no usa IA.",
  itemLabels: {
    ask: "Preguntar o actuar sobre esta página",
    summarizePage: "Resumir esta página",
    searchWeb: "Buscar en la web sobre esta página o el texto seleccionado",
    summarizeLink: "Resumir la página enlazada (en enlaces)",
    copyMarkdown: "Copiar como Markdown",
  },
};
