import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslatePtBR: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traduzir esta página",
    showOriginal: "Mostrar original",
  },
  menuItemLabel: "Traduzir esta página / Mostrar original",
  settingsTitle: "Tradução de páginas",
  settingsDescription:
    "Traduza páginas inteiras pelo menu de contexto: escolha “Traduzir esta página” e, para voltar, “Mostrar original”.",
  engine: "Mecanismo de tradução",
  engineDescription:
    "De onde vêm as traduções. Elas ficam salvas neste dispositivo, então páginas que você já traduziu voltam na hora.",
  engines: {
    model: "Modelo de IA",
    browser: "Tradutor integrado (no dispositivo)",
    google: "Google Tradutor (gratuito)",
    microsoft: "Microsoft Translator (gratuito)",
  },
  engineDetails: {
    model:
      "Seu provedor de IA configurado traduz, com o modelo escolhido abaixo.",
    browser:
      "O navegador traduz neste dispositivo; nenhum texto sai dele. Cada idioma é baixado uma vez.",
    google:
      "Um serviço gratuito não oficial, não uma API do Google. Pode parar de funcionar a qualquer momento.",
    microsoft:
      "Um serviço gratuito não oficial, não uma API da Microsoft. Pode parar de funcionar a qualquer momento.",
  },
  cloudNotice: {
    google: "O texto da página é enviado ao Google para ser traduzido.",
    microsoft: "O texto da página é enviado à Microsoft para ser traduzido.",
  },
  privacyLink: "Política de privacidade",
  model: "Modelo",
  modelDescription: "O modelo que traduz as páginas.",
  defaultModel: "Modelo selecionado na conversa",
  targetLanguage: "Traduzir para",
  targetLanguageDescription:
    "As páginas são traduzidas para este idioma. O idioma da extensão não muda.",
  followInterface: "Idioma da extensão ({language})",
  display: "Exibição",
  displayDescription:
    "“Original e tradução” mantém cada parágrafo e adiciona a tradução abaixo dele.",
  displayModes: {
    bilingual: "Original e tradução",
    translation: "Somente tradução",
  },
  cache: "Traduções salvas",
  cacheDescription:
    "As traduções ficam 30 dias neste dispositivo, então páginas traduzidas voltam na hora.",
  clearCache: "Limpar traduções salvas",
  cacheCleared: "Traduções salvas limpas.",
  errors: {
    unavailable:
      "{engine} não está disponível. Verifique a tradução de páginas nas configurações.",
    rateLimited:
      "{engine} está limitando as solicitações desta rede. Tente de novo mais tarde ou escolha outro mecanismo nas configurações.",
    refused:
      "{engine} recusou a tradução. Escolha outro mecanismo nas configurações.",
    network:
      "Não foi possível conectar ao {engine}. Verifique sua conexão e tente de novo.",
    failed: "{engine} não conseguiu traduzir alguns parágrafos.",
  },
  noModel:
    "Nenhum modelo de IA configurado. Adicione um provedor nas configurações.",
  browserUnsupported:
    "O tradutor integrado não consegue traduzir esta página para {language}.",
  unavailablePage:
    "Não é possível traduzir esta página: o navegador não permite que extensões a alterem.",
};
