import type { SmartBarLocaleMessages } from "./en-US";

export const smartBarPtBR: SmartBarLocaleMessages = {
  barLabel: "Barra inteligente",
  actions: {
    ask: "Perguntar no painel lateral",
    explain: "Explicar",
    translate: "Traduzir",
    summarize: "Resumir",
    copy: "Copiar",
    improve: "Melhorar a escrita",
    fixGrammar: "Corrigir ortografia e gramática",
  },
  copied: "Copiado",
  closeMenu: "Opções da barra inteligente",
  hideOnSite: "Ocultar em {site}",
  turnOff: "Desativar a barra inteligente",
  close: "Fechar",
  stop: "Parar",
  retry: "Tentar novamente",
  replace: "Substituir",
  insertBelow: "Inserir abaixo",
  continueInSidePanel: "Continuar no painel lateral",
  readSource: "Ler o original em voz alta",
  readResult: "Ler o resultado em voz alta",
  stopReading: "Parar a leitura",
  writing: "Escrevendo…",
  emptyResult: "O modelo não retornou texto.",
  selectionChanged:
    "O texto selecionado mudou. Copie o resultado em vez disso.",
  selectionTooLong:
    "A seleção é longa demais (mais de {max} caracteres). Continue no painel lateral em vez disso.",
  dictionary: {
    pronunciation: "Pronúncia",
    inContext: "Neste contexto",
    examples: "Exemplos",
    synonyms: "Sinônimos",
    collocations: "Colocações",
    entry: "Verbete de dicionário",
  },
  settingsTitle: "Barra inteligente",
  settingsDescription:
    "Ações rápidas de IA ao lado do texto selecionado. Nada é enviado até você escolher uma.",
  enable: "Mostrar a barra inteligente",
  enableDescription:
    "Desativada por padrão. Quando ativada, o OpenBrowserAgent acompanha a seleção de texto nas páginas permitidas.",
  trigger: "Quando mostrar",
  triggerDescription:
    "O atalho de teclado funciona nos dois modos. Defina-o nas configurações de atalhos de extensões do navegador.",
  triggerSelection: "Ao selecionar texto",
  triggerShortcut: "Somente com o atalho",
  sites: "Sites",
  sitesDescription:
    "As duas listas são mantidas; o modo decide qual vale. Um site inclui seus subdomínios.",
  siteModeBlockList: "Em todos os lugares, exceto sites bloqueados",
  siteModeAllowList: "Somente em sites permitidos",
  blockedSites: "Sites bloqueados",
  allowedSites: "Sites permitidos",
  sitePlaceholder: "example.com",
  addSite: "Adicionar site",
  removeSite: "Remover {host}",
  invalidSite: "Digite um site como example.com.",
  noSites: "Nenhum site ainda.",
  pageActions: "Ações para o texto da página",
  pageActionsDescription: "Aparecem ao selecionar texto em uma página.",
  editActions: "Ações para o texto que você está editando",
  editActionsDescription:
    "Aparecem ao selecionar texto em um campo de texto. O resultado pode substituir a seleção.",
  model: "Modelo da barra inteligente",
  modelDescription:
    "Modelo para Explicar, Traduzir, Resumir e as ações de escrita.",
};
