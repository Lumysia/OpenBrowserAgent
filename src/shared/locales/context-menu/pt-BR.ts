import type { ContextMenuLocaleMessages } from "./en-US";

export const contextMenuPtBR: ContextMenuLocaleMessages = {
  items: {
    ask: "Perguntar ou agir nesta página",
    summarizePage: "Resumir esta página",
    searchPage: "Pesquisar na web sobre esta página",
    searchSelection: 'Pesquisar "%s" na web',
    summarizeLink: "Resumir a página do link",
    copyMarkdown: "Copiar como Markdown",
  },
  searchSelectionRequest: "Pesquisar na web sobre o texto selecionado",
  copied: "Copiado como Markdown",
  copyFailed:
    "Não foi possível copiar para a área de transferência. Clique na página e tente novamente.",
  copyUnavailable:
    "Não é possível copiar esta página: o navegador não permite que extensões a leiam.",
  settingsTitle: "Menu de contexto",
  settingsDescription:
    "Ações do OpenBrowserAgent no menu que abre quando você clica com o botão direito em uma página.",
  enable: "Mostrar no menu de contexto",
  enableDescription:
    "Adiciona um submenu do OpenBrowserAgent quando você clica com o botão direito em uma página, link, imagem ou texto selecionado.",
  itemsTitle: "Itens do menu",
  itemsDescription:
    "As ações que abrem o painel lateral entregam a página ao seu agente. Copiar como Markdown não usa IA.",
  itemLabels: {
    ask: "Perguntar ou agir nesta página",
    summarizePage: "Resumir esta página",
    searchWeb: "Pesquisar na web sobre esta página ou o texto selecionado",
    summarizeLink: "Resumir a página do link (em links)",
    copyMarkdown: "Copiar como Markdown",
  },
};
