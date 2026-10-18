import type { SettingsMessages } from "./en-US";

export const settingsPtBR: SettingsMessages = {
  providersModels: "Provedores de IA e modelos",
  agentsSkills: "Agentes e habilidades",
  onPages: "Nas páginas",
  advanced: "Avançado",
  translate: "Traduzir",
  rightClick: "Menu de contexto",
  troubleshooting: "Solução de problemas",
  shortcuts: "Atalhos de teclado",
  shortcutsDescription:
    "Atalhos dos comandos do OpenBrowserAgent. O navegador os gerencia; altere-os nas configurações de atalhos dele.",
  shortcutNone: "Não definido",
  changeShortcuts: "Alterar atalhos",
  shortcutsFirefoxHint:
    'Para alterá-los, abra about:addons, clique no botão de engrenagem e escolha "Gerenciar atalhos de extensões".',
  openMenuCommand: "Abrir o menu",
  openSidePanelCommand: "Abrir o painel lateral",
  smartBarCommand: "Mostrar a barra inteligente para o texto selecionado",
  translatePageCommand: "Traduzir esta página ou mostrar o original",
  sidePanelShortcutHint:
    "Escolha uma tecla nas configurações de atalhos do navegador, por exemplo {keys}.",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "Atalho: {shortcut}",
    none: "Nenhum atalho definido",
    change: "Alterar atalho",
  },
  chatBehavior: "Comportamento da conversa",
  chatBehaviorDescription:
    "Rolagem, novas tentativas, etapas de ferramentas e toques festivos no painel lateral.",
  models: "Modelos",
  modelsDescription:
    "O modelo que cada recurso usa. Todos usam o modelo da conversa, a menos que você escolha outro.",
  modelChat: "Conversa",
  modelHelper: "Auxiliar",
  modelSmartBar: "Barra inteligente",
  modelTranslation: "Tradução",
  modelTranslationFallback:
    "Usado quando o tradutor integrado não consegue traduzir uma página.",
  modelTranslationUnavailable:
    "A tradução de páginas usa {engine}, não um modelo de IA. Mude o mecanismo de tradução nas configurações de Tradução de páginas.",
  modelImages: "Imagens",
  translateMenuItems: "Itens do menu de contexto",
  translateMenuItemsDescription:
    "Os itens de tradução do menu de contexto. O menu em si é ativado ou desativado em Menu de contexto.",
};
