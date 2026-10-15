import type { SetupMessages } from "./en-US";

export const setupPtBR: SetupMessages = {
  title: "Configure o OpenBrowserAgent",
  description: "Adicione um provedor de IA para começar a conversar.",
  continueSetup: "Continuar a configuração",
  openedSettings:
    "A configuração está aberta em outra aba. Volte aqui quando terminar.",
  runAgain: "Executar a configuração de novo",
  progressLabel: "Etapas da configuração",
  progressStep: "Etapa {current} de {total}: {step}",
  steps: {
    language: "Idioma",
    provider: "Provedor de IA",
    pages: "Nas páginas",
    done: "Pronto",
  },
  back: "Voltar",
  next: "Avançar",
  skipStep: "Pular",
  languageTitle: "Escolha seus idiomas",
  languageDescription:
    "O idioma da extensão e o idioma para o qual as páginas são traduzidas. A maioria das pessoas deixa os dois como estão.",
  providerTitle: "Conecte um provedor de IA",
  providerDescription:
    "A conversa e o agente precisam de um provedor de IA. Escolha um serviço ou qualquer servidor compatível com OpenAI ou Anthropic com sua Base URL.",
  providerPlaceholder: "Escolha um provedor de IA",
  providerReady: "{name} está pronto. Clique em “Avançar” para continuar.",
  testConnection: "Testar conexão",
  testingConnection: "Testando…",
  connectionOk: "Conectado. {model} respondeu.",
  connectionFailed: "Não foi possível conectar ao provedor de IA",
  modelFailed: "Conectado, mas {model} não respondeu",
  noModelsListed:
    "Conectado, mas o provedor de IA não listou nenhum modelo. Digite o nome de um modelo.",
  model: "Modelo",
  modelName: "Nome do modelo",
  modelNameHint:
    "Se o provedor de IA não listar os modelos, digite um pelo nome e teste de novo.",
  pagesTitle: "Nas páginas",
  pagesDescription:
    "O que o OpenBrowserAgent adiciona às páginas que você visita. Você pode mudar isso depois em Configurações → Nas páginas.",
  translateButtonDescription:
    "Um pequeno botão na borda da página traduz a página ou mostra o original.",
  smartBarTitle: "Barra inteligente ao selecionar texto",
  smartBarDescription:
    "Ações rápidas ao lado do texto selecionado. Nada é enviado até você escolher uma.",
  subtitlesDescription:
    "Vídeos com legendas mostram cada linha com a tradução embaixo.",
  doneTitle: "Tudo pronto",
  doneDescription:
    "Abra o painel lateral e pergunte sobre a página em que você está. Estes atalhos funcionam em qualquer página.",
  noProviderNote:
    "A conversa precisa de um provedor de IA. A tradução de páginas com o tradutor integrado funciona sem ele.",
  welcomeTitle: "Boas-vindas ao OpenBrowserAgent",
  openPanelDescription:
    "Fixe o OpenBrowserAgent no menu Extensões do navegador e clique no ícone dele para abrir o painel lateral.",
  openPanel: "Abrir painel lateral",
  joinLink:
    "Já usa o OpenBrowserAgent em outro dispositivo? Cole um código de sincronização",
  codeTab: "Colar código",
  manualTab: "Configuração manual",
  code: "Código de sincronização",
  codeDescription:
    "Copie-o no outro dispositivo em Configurações → Sincronização. As escolhas de sincronização do código substituem as deste dispositivo.",
  codeInvalid:
    "Este não é um código de sincronização válido. Copie-o de novo e cole o código inteiro.",
  connect: "Conectar e sincronizar",
  testing: "Conectando…",
  pulling: "Sincronizando…",
  failed:
    "Não foi possível conectar. Verifique o código ou os dados do servidor e tente novamente.",
  connected: "Conectado. Suas configurações estão sincronizando.",
  keysLocked:
    "Suas chaves de API estão sincronizadas, mas bloqueadas. Digite sua frase secreta de sincronização.",
  unlock: "Desbloquear",
  skip: "Agora não",
};
