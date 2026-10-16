import { plural } from "../../plural";
import type { SetupMessages } from "./en-US";

export const setupPtBR: SetupMessages = {
  continueSetup: "Continuar a configuração",
  runAgain: "Executar a configuração de novo",
  progressLabel: "Etapas da configuração",
  progressStep: "Etapa {current} de {total}: {step}",
  steps: {
    language: "Idioma",
    path: "Primeiro uso",
    provider: "Provedor de IA",
    pages: "Nas páginas",
    sync: "Sincronização",
    passphrase: "Frase secreta",
    download: "Download",
    done: "Pronto",
  },
  back: "Voltar",
  next: "Avançar",
  skipStep: "Pular",
  languageTitle: "Escolha seus idiomas",
  languageDescription:
    "O idioma da extensão e o idioma para o qual as páginas são traduzidas. A maioria das pessoas deixa os dois como estão.",
  pathTitle: "Você já usou o OpenBrowserAgent?",
  pathDescription:
    "Se você o usa em outro dispositivo, a sincronização traz para cá seus provedores de IA, agentes e conversas.",
  pathNew: "É a primeira vez",
  pathNewDescription:
    "Conecte um provedor de IA e escolha o que o OpenBrowserAgent adiciona às páginas da web.",
  pathReturning: "Uso em outro dispositivo",
  pathReturningDescription:
    "Sincronize suas configurações, provedores de IA e conversas do seu outro dispositivo.",
  syncTitle: "Escolha como sincronizar",
  syncDescription: "Conecte do mesmo jeito que no seu outro dispositivo.",
  recommended: "Recomendado",
  methodCode: "Colar um código de sincronização",
  methodCodeDescription:
    "Um só código contém o servidor de sincronização e o que é sincronizado.",
  methodBrowser: "Sincronização pela conta do navegador",
  browserConnect: "Ativar a sincronização pela conta do navegador",
  tryAgain: "Tentar novamente",
  asNewUser: "Configurar como novo usuário",
  passphraseTitle: "Digite sua frase secreta de sincronização",
  passphraseDescription:
    "Suas chaves de API são sincronizadas criptografadas. Digite a frase secreta de sincronização definida no seu outro dispositivo.",
  keysUnlocked: "Suas chaves de API estão desbloqueadas.",
  downloadTitle: "Conectar e baixar",
  downloadDescription:
    "O OpenBrowserAgent baixa o que seu outro dispositivo sincronizou.",
  downloading: "Baixando…",
  downloadFailed: "Não foi possível baixar do servidor de sincronização.",
  arrived: "Do seu outro dispositivo:",
  noSyncedProvider:
    "Nenhum provedor de IA veio do seu outro dispositivo. A conversa precisa de um.",
  arrivedCount: {
    providers: plural({
      one: "{count} provedor de IA",
      other: "{count} provedores de IA",
    }),
    agents: plural({ one: "{count} agente", other: "{count} agentes" }),
    skills: plural({ one: "{count} habilidade", other: "{count} habilidades" }),
    mcpServers: plural({
      one: "{count} servidor MCP",
      other: "{count} servidores MCP",
    }),
    chats: plural({ one: "{count} conversa", other: "{count} conversas" }),
  },
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
    "Fixe o OpenBrowserAgent no menu Extensões do navegador, clique no ícone dele e escolha “Abrir painel lateral”.",
  openPanel: "Abrir painel lateral",
  code: "Código de sincronização",
  codeDescription:
    "No seu outro dispositivo, abra {settings} → {sync} e clique em “{button}”. As escolhas de sincronização do código substituem as deste dispositivo.",
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
  unlocking: "Desbloqueando…",
  skip: "Agora não",
};
