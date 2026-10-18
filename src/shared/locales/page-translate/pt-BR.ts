import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslatePtBR: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traduzir esta página",
    showOriginal: "Mostrar original",
  },
  menuItemLabel: "Traduzir esta página / Mostrar original",
  settingsTitle: "Tradução de páginas",
  settingsDescription:
    "Traduza uma página com o botão na borda, o atalho de teclado ou “Traduzir esta página” no menu de contexto. Repita para voltar ao original.",
  engine: "Mecanismo de tradução",
  engineDescription: "Escolha o que traduz as páginas.",
  engines: {
    model: "Modelo de IA",
    browser: "Tradutor integrado (no dispositivo)",
    google: "Google Tradutor (gratuito)",
    microsoft: "Microsoft Translator (gratuito)",
  },
  engineDetails: {
    model:
      "Seu provedor de IA traduz as páginas com o modelo de tradução escolhido em Provedores de IA e modelos.",
    browser:
      "O navegador traduz neste dispositivo; nenhum texto sai dele. Cada idioma é baixado uma vez.",
    google:
      "Um serviço gratuito não oficial, não uma API do Google. Pode parar de funcionar a qualquer momento.",
    microsoft:
      "Um serviço gratuito não oficial, não uma API da Microsoft. Pode parar de funcionar a qualquer momento.",
  },
  cloudNotice: {
    google:
      "O texto da página é enviado ao Google para ser traduzido. Se o Google falhar em uma página, a Microsoft traduz o resto dela.",
    microsoft:
      "O texto da página é enviado à Microsoft para ser traduzido. Se a Microsoft falhar em uma página, o Google traduz o resto dela.",
  },
  engineNames: {
    model: "o modelo de IA",
    browser: "o tradutor integrado",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Política de privacidade",
  modelDescription: "O modelo que traduz as páginas.",
  targetLanguage: "Traduzir para",
  targetLanguageDescription:
    "As páginas, as legendas de vídeos e “Traduzir” da barra inteligente usam este idioma. O idioma da extensão não muda.",
  followInterface: "Idioma da extensão ({language})",
  display: "Exibição",
  displayDescription:
    "“Original e tradução” mantém cada parágrafo e adiciona a tradução abaixo dele.",
  displayModes: {
    bilingual: "Original e tradução",
    translation: "Somente tradução",
  },
  translateMenus: "Traduzir também menus e botões",
  translateMenusDescription:
    "Desativado, os rótulos curtos de navegação, menus, botões, abas e rodapés ficam como estão; títulos, frases e perguntas neles continuam sendo traduzidos.",
  cache: "Traduções salvas",
  cacheDescription:
    "As traduções ficam 30 dias neste dispositivo, então páginas traduzidas voltam na hora.",
  clearCache: "Limpar traduções salvas",
  cacheCleared: "Traduções salvas limpas.",
  clearCacheFailed: "Não foi possível limpar as traduções salvas",
  errors: {
    unavailable:
      "{engine} não consegue traduzir esta página. Escolha outro mecanismo de tradução nas configurações de Tradução de páginas.",
    rateLimited:
      "{engine} está limitando as solicitações desta rede. Tente de novo mais tarde ou escolha outro mecanismo nas configurações.",
    refused:
      "{engine} recusou a tradução. Escolha outro mecanismo nas configurações.",
    network:
      "Não foi possível conectar ao {engine}. Verifique sua conexão e tente de novo.",
    failed: "{engine} não conseguiu traduzir alguns parágrafos.",
    allFailed:
      "Nem {engine} nem {fallback} conseguiram traduzir. Tente de novo mais tarde ou escolha outro mecanismo nas configurações.",
  },
  switched: {
    rateLimited:
      "Nesta página, {fallback} assumiu a tradução: {engine} está limitando as solicitações.",
    failed:
      "Nesta página, {fallback} assumiu a tradução: {engine} não está funcionando agora.",
    unavailable:
      "Nesta página, {fallback} assumiu a tradução: {engine} não consegue traduzi-la aqui.",
  },
  browserMissing:
    "Este navegador não tem tradutor integrado. Escolha outro mecanismo de tradução.",
  notStarted:
    "Não foi possível começar a traduzir esta página. Recarregue a página e tente novamente.",
  unavailablePage:
    "Não é possível traduzir esta página: o navegador não permite que extensões a alterem.",
  button: {
    translating: "Traduzindo…",
    hide: "Ocultar o botão de tradução",
    hideOnSite: "Ocultar em {site}",
    hideEverywhere: "Ocultar em todos os sites",
    setting: "Botão de tradução nas páginas",
    settingDescription:
      "Um pequeno botão na borda das páginas da web traduz a página ou mostra o original. Arraste-o para movê-lo; ele fica na borda mais próxima da janela. Ele só aparece em páginas que ainda não estão no idioma de “Traduzir para”.",
    move: "As setas o movem ao longo da borda; E o leva para a próxima borda.",
    hiddenSites: "Oculto nestes sites",
    hiddenSitesDescription:
      "O botão não aparece nestes sites. Um site inclui seus subdomínios.",
  },
  subtitles: {
    menu: "Traduzir legendas",
    menuHide: "Ocultar legendas traduzidas",
    menuItemLabel: "Traduzir legendas / Ocultá-las (em vídeos)",
    noCaptions:
      "Ainda não foram encontradas legendas para este vídeo. Ative as legendas no player — elas são traduzidas assim que aparecem.",
    liveOnly:
      "As legendas na tela são traduzidas conforme aparecem. Para traduzir com antecedência, desative e ative de novo as legendas do player.",
    noVideo: "Não há nenhum vídeo para traduzir legendas aqui.",
    // Settings: subtitles start by themselves on every video.
    setting: "Traduzir legendas de vídeos automaticamente",
    settingDescription:
      "Vídeos com legendas mostram cada linha com a tradução embaixo, em todos os sites. “Traduzir legendas” no menu de contexto de um vídeo as desativa ou ativa para esse vídeo. Com esta opção desativada, o menu e “Traduzir esta página” continuam traduzindo as legendas.",
    // Settings: how translated subtitles look; the preview's two lines.
    style: {
      title: "Estilo das legendas",
      description:
        "Como as legendas traduzidas aparecem sobre os vídeos. As que estão na tela mudam na hora.",
      preview: "Pré-visualização",
      previewOriginal: "The river was high that spring.",
      previewTranslation: "Naquela primavera, o rio estava cheio.",
      background: "Opacidade do fundo",
      translationColor: "Cor da tradução",
      originalColor: "Cor do original",
      colors: {
        yellow: "Amarelo",
        white: "Branco",
        cyan: "Azul-claro",
        grey: "Cinza",
      },
      font: "Fonte",
      fonts: {
        system: "Sistema",
        serif: "Serifada",
        monospace: "Monoespaçada",
      },
      size: "Tamanho",
      showOriginal: "Mostrar a linha original",
      showOriginalDescription: "Desativado, só a tradução aparece.",
    },
  },
};
